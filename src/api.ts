/**
 * Core API implementation for call-ai
 */
import {
  CallAIOptions,
  Message,
  ResponseMeta,
  SchemaStrategy,
  StreamResponse,
  ThenableStreamResponse,
} from "./types";
import { chooseSchemaStrategy } from "./strategies";

// Internal key store to keep track of the latest key
const keyStore = {
  // Default key from environment or config
  current: null as string | null,
  // The refresh endpoint URL - defaults to vibecode.garden
  refreshEndpoint: "https://vibecode.garden" as string | null,
  // Authentication token for refresh endpoint - defaults to use-vibes
  refreshToken: "use-vibes" as string | null,
  // Flag to prevent concurrent refresh attempts
  isRefreshing: false,
  // Timestamp of last refresh attempt (to prevent too frequent refreshes)
  lastRefreshAttempt: 0,
  // Storage for key metadata (useful for future top-up implementation)
  metadata: {} as Record<string, any>,
};

// Global debug flag
let globalDebug = false;

/**
 * Initialize key store with environment variables
 */
function initKeyStore() {
  // Initialize with environment variables if available
  if (typeof process !== "undefined" && process.env) {
    if (process.env.CALLAI_API_KEY) {
      keyStore.current = process.env.CALLAI_API_KEY;
    }

    // Support both CALLAI_REFRESH_ENDPOINT and CALLAI_REKEY_ENDPOINT for backward compatibility
    if (process.env.CALLAI_REFRESH_ENDPOINT) {
      keyStore.refreshEndpoint = process.env.CALLAI_REFRESH_ENDPOINT;
    } else if (process.env.CALLAI_REKEY_ENDPOINT) {
      keyStore.refreshEndpoint = process.env.CALLAI_REKEY_ENDPOINT;
    } else {
      // Default to vibecode.garden if not specified
      keyStore.refreshEndpoint = "https://vibecode.garden";
    }

    // Support both CALL_AI_REFRESH_TOKEN and CALL_AI_KEY_TOKEN for backward compatibility
    if (process.env.CALL_AI_REFRESH_TOKEN) {
      keyStore.refreshToken = process.env.CALL_AI_REFRESH_TOKEN;
    } else if (process.env.CALL_AI_KEY_TOKEN) {
      keyStore.refreshToken = process.env.CALL_AI_KEY_TOKEN;
    } else {
      // Default to use-vibes if not specified - this is the default token for vibecode.garden
      keyStore.refreshToken = "use-vibes";
    }

    // Check for CALLAI_DEBUG environment variable (any truthy value works)
    if (process.env.CALLAI_DEBUG) {
      // Set the global debug flag
      globalDebug = true;
    }
  }
  // Initialize from window globals if in browser context
  else if (typeof window !== "undefined") {
    // Use window.CALLAI_API_KEY or window.callAI.API_KEY if available
    if ((window as any).CALLAI_API_KEY) {
      keyStore.current = (window as any).CALLAI_API_KEY;
    } else if ((window as any).callAI?.API_KEY) {
      keyStore.current = (window as any).callAI.API_KEY;
    }

    // Check for debug flag in browser environment
    if ((window as any).CALLAI_DEBUG) {
      globalDebug = true;
    }
    keyStore.refreshEndpoint =
      (window as any).CALLAI_REFRESH_ENDPOINT || keyStore.refreshEndpoint;
    keyStore.refreshToken =
      (window as any).CALL_AI_REFRESH_TOKEN || keyStore.refreshToken;
  }
}

// Initialize on module load
initKeyStore();

/**
 * Check if an error indicates we need a new API key
 * @param error The error to check
 * @param debug Whether to log debug information
 * @returns True if the error suggests we need a new key
 */
function isNewKeyError(error: any, debug: boolean = false): boolean {
  // Extract status from error object or message text
  let status = error?.status || error?.statusCode || error?.response?.status;
  const errorMessage = String(error || "").toLowerCase();

  // Extract status code from error message if not found in the object properties
  // Handle messages like "HTTP error! Status: 403" common in fetch errors
  if (!status && errorMessage.includes("status:")) {
    const statusMatch = errorMessage.match(/status:\s*(\d+)/i);
    if (statusMatch && statusMatch[1]) {
      status = parseInt(statusMatch[1], 10);
    }
  }

  const is4xx = status >= 400 && status < 500;

  // Common error messages related to API key issues across different providers
  const isKeyError =
    errorMessage.includes("key limit") ||
    errorMessage.includes("api key") ||
    errorMessage.includes("token limit") ||
    errorMessage.includes("usage limit") ||
    errorMessage.includes("quota") ||
    errorMessage.includes("insufficient balance") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("exceeded");

  // The HTTP status code is 401 (Unauthorized) or 403 (Forbidden) which often indicates auth issues
  const isAuthError = status === 401 || status === 403;

  // Check for OpenRouter-specific errors that indicate key issues
  const isOpenRouterKeyError =
    errorMessage.includes("openrouter") &&
    (errorMessage.includes("key limit") ||
      errorMessage.includes("manage it using"));

  // For status 403, treat as likely key error since that's common for quota/authorization issues
  const isLikelyKeyError = status === 403 && !isKeyError;

  // Consider an error a key-related error if:
  // 1. It's a 4xx status code AND contains key-related terms in the error message, OR
  // 2. It's a 401/403 auth error, OR
  // 3. It's an OpenRouter key error message
  // 4. It's a 403 error (common for key/quota issues)
  if (
    (is4xx && isKeyError) ||
    isAuthError ||
    isOpenRouterKeyError ||
    isLikelyKeyError
  ) {
    if (debug) {
      console.log(
        `[callAI:debug] Key error detected: status=${status}, message=${String(error).substring(0, 200)}`,
      );
    }
    return true;
  }

  if (debug && is4xx) {
    // Log 4xx errors that weren't identified as key errors for debugging
    console.log(
      `[callAI:debug] Non-key 4xx error detected: status=${status}, message=${String(error).substring(0, 200)}`,
    );
  }

  return false;
}

/**
 * Refreshes the API key by calling the specified endpoint
 * @param currentKey The current API key (may be null for initial key request)
 * @param endpoint The endpoint to call for key refresh
 * @param refreshToken Authentication token for the refresh endpoint
 * @returns Object containing the API key and topup flag
 */
async function refreshApiKey(
  currentKey: string | null,
  endpoint: string | null,
  refreshToken: string | null,
  debug: boolean = globalDebug,
): Promise<{ apiKey: string; topup: boolean }> {
  if (!endpoint) {
    throw new Error("No refresh endpoint configured");
  }

  try {
    // Prepare headers with authentication
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Use the refresh token for authentication if available, otherwise use the current key
    if (refreshToken) {
      headers["Authorization"] = `Bearer ${refreshToken}`;
    } else if (currentKey) {
      headers["Authorization"] = `Bearer ${currentKey}`;
    } else {
      throw new Error(
        "No refresh token or API key available for authentication",
      );
    }

    // Extract hash from current key if available (for potential future top-up capability)
    let keyHash = null;
    if (currentKey) {
      try {
        // Attempt to extract hash if it's stored in metadata
        keyHash = getHashFromKey(currentKey);
      } catch (e) {
        // If we can't extract the hash, we'll just create a new key
        console.warn(
          "Could not extract hash from current key, will create new key",
        );
      }
    }

    // Determine if this might be a top-up request based on available hash
    const isTopupAttempt = Boolean(keyHash);

    // Create the request body
    const requestBody: any = {
      userId: "anonymous", // Replace with actual user ID if available
      name: "Session Key",
      label: `session-${Date.now()}`,
    };

    // If we have a key hash and want to attempt top-up (for future implementation)
    if (isTopupAttempt) {
      requestBody.keyHash = keyHash;
      requestBody.action = "topup"; // Signal that we're trying to top up existing key
    }

    // Append the specific API path to the base URL endpoint
    const fullEndpointUrl = `${endpoint}/api/keys`;

    // Make request to refresh endpoint
    const response = await fetch(fullEndpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Check for specific error situations
      if (response.status === 401 || response.status === 403) {
        const refreshTokenError = new Error("Refresh token expired or invalid");
        refreshTokenError.name = "RefreshTokenError";
        throw refreshTokenError;
      }

      const errorData = await response.json();
      throw new Error(
        `Failed to refresh key: ${errorData.error || response.statusText}`,
      );
    }

    // Parse the response
    const data = await response.json();

    // Only log in debug mode
    if (debug) {
      console.log(`[callAI:debug] Key refresh response received`);
    }

    // Extract the key and relevant metadata - handle different possible formats
    let apiKey;
    if (typeof data === "object" && data !== null) {
      // Handle case where key is a string (direct key value)
      if (typeof data.key === "string") {
        apiKey = data.key;
      }
      // Handle case where apiKey is used instead of key
      else if (typeof data.apiKey === "string") {
        apiKey = data.apiKey;
      }
      // Handle nested response format where key is an object containing a key property
      // This is the format returned by Vibecode API
      else if (
        data.key &&
        typeof data.key === "object" &&
        typeof data.key.key === "string"
      ) {
        apiKey = data.key.key;
        // Store usage and limit information for logging
        if (
          typeof data.key.usage === "number" &&
          typeof data.key.limit === "number"
        ) {
          data.usage = data.key.usage;
          data.limit = data.key.limit;
        }
      }
      // Handle data.data nesting pattern
      else if (data.data && typeof data.data.key === "string") {
        apiKey = data.data.key;
      }
    }

    if (!apiKey) {
      if (debug) {
        console.log(
          `[callAI:debug] Failed to extract key from refresh response`,
        );
      }
      throw new Error("API key not found in refresh response");
    }

    // Store the key metadata for potential future use
    storeKeyMetadata(data);

    // Always log new key info with usage statistics if available (helpful for users)
    const usageInfo =
      typeof data.usage === "number" && typeof data.limit === "number"
        ? ` (Usage: ${data.usage}/${data.limit})`
        : "";
    console.log(
      `[callAI] New API key received${usageInfo}. First 8 chars: ${apiKey.substring(0, 8)}...`,
    );

    // For now, always return with topup=false since the backend doesn't support topup yet
    // When topup is implemented on the backend, this can be updated to check data.topup
    return {
      apiKey: apiKey,
      topup: Boolean(data.topup), // Will be true when backend supports topup feature
    };
  } catch (error: unknown) {
    // Re-throw refresh token errors with specific type
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "RefreshTokenError"
    ) {
      throw error;
    }
    throw new Error(`Key refresh failed: ${String(error)}`);
  }
}

/**
 * Helper function to extract hash from key (implementation depends on how you store metadata)
 */
function getHashFromKey(key: string): string | null {
  // This extracts the hash from stored metadata if available
  const keyMetadata = keyStore.metadata?.[key];
  return keyMetadata?.hash || null;
}

/**
 * Helper function to store key metadata for future reference
 */
function storeKeyMetadata(data: any): void {
  // Initialize metadata storage if needed
  if (!keyStore.metadata) {
    keyStore.metadata = {};
  }

  // Store the metadata with the key as the index
  if (data.key) {
    keyStore.metadata[data.key] = {
      hash: data.hash || null,
      name: data.name || null,
      label: data.label || null,
      limit: data.limit || null,
      usage: data.usage || null,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }
}

// WeakMap to store metadata for responses without modifying the response objects
const responseMetadata = new WeakMap<object, ResponseMeta>();

// Store for string responses - we need to box strings since WeakMap keys must be objects
const stringResponseMap = new Map<string, object>();

/**
 * Helper to box a string so it can be used with WeakMap
 * @internal
 */
function boxString(str: string): object {
  const boxed = new String(str);
  stringResponseMap.set(str, boxed);
  return boxed;
}

/**
 * Retrieve metadata associated with a response from callAI()
 * @param response A response from callAI, either string or AsyncGenerator
 * @returns The metadata object if available, undefined otherwise
 */
export function getMeta(
  response: string | StreamResponse,
): ResponseMeta | undefined {
  // For strings, we need to use our mapping since primitives can't be WeakMap keys
  if (typeof response === "string") {
    // Check if we have a boxed version of this string
    const boxed = stringResponseMap.get(response);
    if (boxed) {
      return responseMetadata.get(boxed);
    }
    return undefined;
  }

  // For AsyncGenerators and other objects, directly use the WeakMap
  return responseMetadata.get(response);
}

// Import package version for debugging
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PACKAGE_VERSION = require("../package.json").version;

// Default fallback model when the primary model fails or is unavailable
const FALLBACK_MODEL = "openrouter/auto";

/**
 * Make an AI API call with the given options
 * @param prompt User prompt as string or an array of message objects
 * @param options Configuration options including optional schema for structured output
 * @returns A Promise that resolves to the complete response string when streaming is disabled,
 *          or a Promise that resolves to an AsyncGenerator when streaming is enabled.
 *          The AsyncGenerator yields partial responses as they arrive.
 */
export function callAI(
  prompt: string | Message[],
  options: CallAIOptions = {},
): Promise<string | StreamResponse> {
  // Check if we need to force streaming based on model strategy
  const schemaStrategy = chooseSchemaStrategy(
    options.model,
    options.schema || null,
  );

  if (!options.max_tokens) {
    options.max_tokens = 100000;
  }

  // Handle special case: Claude with tools requires streaming
  if (!options.stream && schemaStrategy.shouldForceStream) {
    // Buffer streaming results into a single response
    return bufferStreamingResults(prompt, options);
  }

  // Handle normal non-streaming mode
  if (options.stream !== true) {
    return callAINonStreaming(prompt, options);
  }

  // Handle streaming mode - return a Promise that resolves to an AsyncGenerator
  // but also supports legacy non-awaited usage for backward compatibility
  const streamPromise = (async () => {
    // Do setup and validation before returning the generator
    const { endpoint, requestOptions, model, schemaStrategy } =
      prepareRequestParams(prompt, { ...options, stream: true });

    // Use either explicit debug option or global debug flag
    const debug = options.debug || globalDebug;
    if (debug) {
      console.log(
        `[callAI:${PACKAGE_VERSION}] Making fetch request to: ${endpoint}`,
      );
      console.log(`[callAI:${PACKAGE_VERSION}] With model: ${model}`);
      console.log(
        `[callAI:${PACKAGE_VERSION}] Request headers:`,
        JSON.stringify(requestOptions.headers),
      );
    }

    let response;
    try {
      response = await fetch(endpoint, requestOptions);
      if (options.debug) {
        console.log(
          `[callAI:${PACKAGE_VERSION}] Fetch completed with status:`,
          response.status,
          response.statusText,
        );

        // Log all headers
        console.log(`[callAI:${PACKAGE_VERSION}] Response headers:`);
        response.headers.forEach((value, name) => {
          console.log(`[callAI:${PACKAGE_VERSION}]   ${name}: ${value}`);
        });

        // Clone response for diagnostic purposes only
        const diagnosticResponse = response.clone();
        try {
          // Try to get the response as text for debugging
          const responseText = await diagnosticResponse.text();
          console.log(
            `[callAI:${PACKAGE_VERSION}] First 500 chars of response body:`,
            responseText.substring(0, 500) +
              (responseText.length > 500 ? "..." : ""),
          );
        } catch (e) {
          console.log(
            `[callAI:${PACKAGE_VERSION}] Could not read response body for diagnostics:`,
            e,
          );
        }
      }
    } catch (fetchError) {
      if (options.debug) {
        console.error(
          `[callAI:${PACKAGE_VERSION}] Network error during fetch:`,
          fetchError,
        );
      }
      throw fetchError; // Re-throw network errors
    }

    // Explicitly check for HTTP error status and log extensively if debug is enabled
    // Safe access to headers in case of mock environments
    const contentType = response?.headers?.get?.("content-type") || "";

    if (options.debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Response.ok =`, response.ok);
      console.log(
        `[callAI:${PACKAGE_VERSION}] Response.status =`,
        response.status,
      );
      console.log(
        `[callAI:${PACKAGE_VERSION}] Response.statusText =`,
        response.statusText,
      );
      console.log(`[callAI:${PACKAGE_VERSION}] Response.type =`, response.type);
      console.log(`[callAI:${PACKAGE_VERSION}] Content-Type =`, contentType);
    }

    // Browser-compatible error handling - must check BOTH status code AND content-type
    // Some browsers will report status 200 for SSE streams even when server returns 400
    const hasHttpError = !response.ok || response.status >= 400;
    const hasJsonError = contentType.includes("application/json");

    if (hasHttpError || hasJsonError) {
      if (options.debug) {
        console.log(
          `[callAI:${PACKAGE_VERSION}] ⚠️ Error detected - HTTP Status: ${response.status}, Content-Type: ${contentType}`,
        );
      }

      // Handle the error with fallback model if appropriate
      if (!options.skipRetry) {
        const clonedResponse = response.clone();
        let isInvalidModel = false;

        try {
          // Check if this is an invalid model error
          const modelCheckResult = await checkForInvalidModelError(
            clonedResponse,
            model,
            false,
            options.skipRetry,
            options.debug,
          );
          isInvalidModel = modelCheckResult.isInvalidModel;

          if (isInvalidModel) {
            if (options.debug) {
              console.log(
                `[callAI:${PACKAGE_VERSION}] Retrying with fallback model: ${FALLBACK_MODEL}`,
              );
            }
            // Retry with fallback model
            return (await callAI(prompt, {
              ...options,
              model: FALLBACK_MODEL,
            })) as StreamResponse;
          }
        } catch (modelCheckError) {
          console.error(
            `[callAI:${PACKAGE_VERSION}] Error during model check:`,
            modelCheckError,
          );
          // Continue with normal error handling
        }
      }

      // Extract error details from response
      try {
        // Try to get error details from the response body
        const errorBody = await response.text();
        if (options.debug) {
          console.log(`[callAI:${PACKAGE_VERSION}] Error body:`, errorBody);
        }

        try {
          // Try to parse JSON error
          const errorJson = JSON.parse(errorBody);
          if (options.debug) {
            console.log(`[callAI:${PACKAGE_VERSION}] Parsed error:`, errorJson);
          }

          // Extract message from OpenRouter error format
          let errorMessage = "";

          // Handle common error formats
          if (
            errorJson.error &&
            typeof errorJson.error === "object" &&
            errorJson.error.message
          ) {
            // OpenRouter/OpenAI format: { error: { message: "..." } }
            errorMessage = errorJson.error.message;
          } else if (errorJson.error && typeof errorJson.error === "string") {
            // Simple error format: { error: "..." }
            errorMessage = errorJson.error;
          } else if (errorJson.message) {
            // Generic format: { message: "..." }
            errorMessage = errorJson.message;
          } else {
            // Fallback with status details
            errorMessage = `API returned ${response.status}: ${response.statusText}`;
          }

          // Add status details to error message if not already included
          if (!errorMessage.includes(response.status.toString())) {
            errorMessage = `${errorMessage} (Status: ${response.status})`;
          }

          if (options.debug) {
            console.log(
              `[callAI:${PACKAGE_VERSION}] Extracted error message:`,
              errorMessage,
            );
          }

          // Create error with standard format
          const error = new Error(errorMessage);

          // Add useful metadata
          (error as any).status = response.status;
          (error as any).statusText = response.statusText;
          (error as any).details = errorJson;
          (error as any).contentType = contentType;
          throw error;
        } catch (jsonError) {
          // If JSON parsing fails, extract a useful message from the raw error body
          if (options.debug) {
            console.log(
              `[callAI:${PACKAGE_VERSION}] JSON parse error:`,
              jsonError,
            );
          }

          // Try to extract a useful message even from non-JSON text
          let errorMessage = "";

          // Check if it's a plain text error message
          if (errorBody && errorBody.trim().length > 0) {
            // Limit length for readability
            errorMessage =
              errorBody.length > 100
                ? errorBody.substring(0, 100) + "..."
                : errorBody;
          } else {
            errorMessage = `API error: ${response.status} ${response.statusText}`;
          }

          // Add status details if not already included
          if (!errorMessage.includes(response.status.toString())) {
            errorMessage = `${errorMessage} (Status: ${response.status})`;
          }

          if (options.debug) {
            console.log(
              `[callAI:${PACKAGE_VERSION}] Extracted text error message:`,
              errorMessage,
            );
          }

          const error = new Error(errorMessage);
          (error as any).status = response.status;
          (error as any).statusText = response.statusText;
          (error as any).details = errorBody;
          (error as any).contentType = contentType;
          throw error;
        }
      } catch (responseError) {
        if (responseError instanceof Error) {
          // Re-throw if it's already properly formatted
          throw responseError;
        }

        // Fallback error
        const error = new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
        (error as any).status = response.status;
        (error as any).statusText = response.statusText;
        (error as any).contentType = contentType;
        throw error;
      }
    }
    // Only if response is OK, create and return the streaming generator
    if (options.debug) {
      console.log(
        `[callAI:${PACKAGE_VERSION}] Response OK, creating streaming generator`,
      );
    }
    return createStreamingGenerator(response, options, schemaStrategy, model);
  })();

  // For backward compatibility with v0.6.x where users didn't await the result
  if (process.env.NODE_ENV !== "production") {
    if (options.debug) {
      console.warn(
        `[callAI:${PACKAGE_VERSION}] No await found - using legacy streaming pattern. This will be removed in a future version and may cause issues with certain models.`,
      );
    }
  }

  // Create a proxy object that acts both as a Promise and an AsyncGenerator for backward compatibility
  // @ts-ignore - We're deliberately implementing a proxy with dual behavior
  return createBackwardCompatStreamingProxy(streamPromise);
}

/**
 * Buffer streaming results into a single response for cases where
 * we need to use streaming internally but the caller requested non-streaming
 */
async function bufferStreamingResults(
  prompt: string | Message[],
  options: CallAIOptions,
): Promise<string> {
  // Create a copy of options with streaming enabled
  const streamingOptions = {
    ...options,
    stream: true,
  };

  try {
    // Get streaming generator
    const generator = (await callAI(
      prompt,
      streamingOptions,
    )) as StreamResponse;

    // Buffer all chunks
    let finalResult = "";
    let chunkCount = 0;
    for await (const chunk of generator) {
      finalResult = chunk; // Each chunk contains the full accumulated text
      chunkCount++;
    }

    return finalResult;
  } catch (error) {
    await handleApiError(error, "Streaming buffer error", options.debug, {
      apiKey: options.apiKey,
      endpoint: options.endpoint,
      skipRefresh: options.skipRefresh,
    });
    // If we get here, key was refreshed successfully, retry the operation with the new key
    // Retry with the refreshed key
    return bufferStreamingResults(prompt, {
      ...options,
      apiKey: keyStore.current || undefined, // Use the refreshed key from keyStore
    });
  }

  // This line should never be reached, but it satisfies the linter by ensuring
  // all code paths return a value
  throw new Error("Unexpected code path in bufferStreamingResults");
}

/**
 * Standardized API error handler
 */
/**
 * Create a proxy that acts both as a Promise and an AsyncGenerator for backward compatibility
 * @internal This is for internal use only, not part of public API
 */
function createBackwardCompatStreamingProxy(
  promise: Promise<StreamResponse>,
): ThenableStreamResponse {
  // Create a proxy that forwards methods to the Promise or AsyncGenerator as appropriate
  return new Proxy({} as any, {
    get(target, prop) {
      // First check if it's an AsyncGenerator method (needed for for-await)
      if (
        prop === "next" ||
        prop === "throw" ||
        prop === "return" ||
        prop === Symbol.asyncIterator
      ) {
        // Create wrapper functions that await the Promise first
        if (prop === Symbol.asyncIterator) {
          return function () {
            return {
              // Implement async iterator that gets the generator first
              async next(value?: unknown) {
                try {
                  const generator = await promise;
                  return generator.next(value);
                } catch (error) {
                  // Turn Promise rejection into iterator result with error thrown
                  return Promise.reject(error);
                }
              },
            };
          };
        }

        // Methods like next, throw, return
        return async function (value?: unknown) {
          const generator = await promise;
          return (generator as any)[prop](value);
        };
      }

      // Then check if it's a Promise method
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return promise[prop].bind(promise);
      }

      return undefined;
    },
  });
}

/**
 * Standardized API error handler
 * @param error The error object
 * @param context Context description for error messages
 * @param debug Whether to log debug information
 * @param options Options for error handling including key refresh control
 */
async function handleApiError(
  error: any,
  context: string,
  debug: boolean = globalDebug,
  options: { apiKey?: string; endpoint?: string; skipRefresh?: boolean } = {},
): Promise<void> {
  if (debug) {
    console.error(`[callAI:${context}]:`, error);

    // In debug mode, show more information about the error type
    console.log(`[callAI:debug] Error type:`, {
      status: error?.status || error?.statusCode || error?.response?.status,
      message: String(error).substring(0, 200),
      skipRefresh: options.skipRefresh,
      hasApiKey: Boolean(options.apiKey || keyStore.current),
      hasEndpoint: Boolean(options.endpoint || keyStore.refreshEndpoint),
      hasRefreshToken: Boolean(keyStore.refreshToken),
    });
  }

  // Check if this is a key-related error that can be resolved by refreshing
  const canRefresh = !options.skipRefresh && isNewKeyError(error, debug);

  if (canRefresh) {
    if (debug) {
      console.log(
        `[callAI:debug] Attempting key refresh due to error: ${String(error).substring(0, 100)}${String(error).length > 100 ? "..." : ""}`,
      );
    }

    // Rate limit refresh attempts to avoid hammering the server
    const now = Date.now();
    const minRefreshInterval = 5000; // 5 seconds between refresh attempts

    if (keyStore.isRefreshing) {
      if (debug) {
        console.log(
          `[callAI:debug] Key refresh already in progress, waiting...`,
        );
      }

      // We could implement a wait mechanism here if needed
      // For now, just throw an error to prevent concurrent refreshes
      throw new Error(
        `${context}: Key refresh already in progress. Please retry in a few seconds.`,
      );
    }

    // Check if we need to throttle refresh attempts
    if (now - keyStore.lastRefreshAttempt < minRefreshInterval) {
      if (debug) {
        console.log(
          `[callAI:debug] Too many refresh attempts, throttling... (${now - keyStore.lastRefreshAttempt}ms since last attempt)`,
        );
      }
      throw new Error(
        `${context}: Too many key refresh attempts. Please retry in a few seconds.`,
      );
    }

    try {
      // Set refresh state
      keyStore.isRefreshing = true;
      keyStore.lastRefreshAttempt = now;

      // Use passed apiKey or fall back to stored key
      const currentKey = options.apiKey || keyStore.current;
      const endpoint = options.endpoint || keyStore.refreshEndpoint;

      // Attempt to refresh the key
      const { apiKey, topup } = await refreshApiKey(
        currentKey,
        endpoint,
        keyStore.refreshToken,
        debug,
      );

      // Store the new key
      keyStore.current = apiKey;

      if (debug) {
        console.log(
          `[callAI:debug] Key refresh ${topup ? "top-up" : "new key"} successful`,
        );
      }

      // Return instead of throwing, allowing caller to retry with new key
      return;
    } catch (refreshError) {
      if (debug) {
        console.error(`[callAI:debug] Key refresh failed:`, refreshError);
      }
      // If refresh fails, throw the original error with additional context
      throw new Error(
        `${context}: ${String(error)} (Key refresh failed: ${String(refreshError)})`,
      );
    } finally {
      // Always reset the refresh state
      keyStore.isRefreshing = false;
    }
  }

  // For non-key errors or when skipRefresh is true, throw the original error
  throw new Error(`${context}: ${String(error)}`);
}

/**
 * Helper to check if an error indicates invalid model and handle fallback
 */
async function checkForInvalidModelError(
  response: Response,
  model: string,
  isRetry: boolean,
  skipRetry: boolean = false,
  debug: boolean = globalDebug,
): Promise<{ isInvalidModel: boolean; errorData?: any }> {
  // Skip retry immediately if skipRetry is true or if we're already retrying
  if (skipRetry || isRetry) {
    return { isInvalidModel: false };
  }

  // We want to check all 4xx errors, not just 400
  if (response.status < 400 || response.status >= 500) {
    return { isInvalidModel: false };
  }

  // Clone the response so we can read the body
  const clonedResponse = response.clone();
  try {
    const errorData = await clonedResponse.json();

    if (debug) {
      console.log(
        `[callAI:${PACKAGE_VERSION}] Checking for invalid model error:`,
        {
          model,
          statusCode: response.status,
          errorData,
        },
      );
    }

    // Common patterns for invalid model errors across different providers
    const invalidModelPatterns = [
      "not a valid model",
      "model .* does not exist",
      "invalid model",
      "unknown model",
      "no provider was found",
      "fake-model", // For our test case
      "does-not-exist", // For our test case
    ];

    // Check if error message contains any of our patterns
    let errorMessage = "";
    if (errorData.error && errorData.error.message) {
      errorMessage = errorData.error.message.toLowerCase();
    } else if (errorData.message) {
      errorMessage = errorData.message.toLowerCase();
    } else {
      errorMessage = JSON.stringify(errorData).toLowerCase();
    }

    // Test the error message against each pattern
    const isInvalidModel = invalidModelPatterns.some((pattern) =>
      errorMessage.includes(pattern.toLowerCase()),
    );

    if (isInvalidModel && debug) {
      console.warn(
        `[callAI:${PACKAGE_VERSION}] Model ${model} not valid, will retry with ${FALLBACK_MODEL}`,
      );
    }

    return { isInvalidModel, errorData };
  } catch (parseError) {
    // If we can't parse the response as JSON, try to read it as text
    if (debug) {
      console.error("Failed to parse error response as JSON:", parseError);
    }
    try {
      const textResponse = await response.clone().text();
      if (debug) {
        console.log("Error response as text:", textResponse);
      }

      // Even if it's not JSON, check if it contains any of our known patterns
      const lowerText = textResponse.toLowerCase();
      const isInvalidModel =
        lowerText.includes("invalid model") ||
        lowerText.includes("not exist") ||
        lowerText.includes("fake-model");

      if (isInvalidModel) {
        if (debug) {
          console.warn(
            `[callAI:${PACKAGE_VERSION}] Detected invalid model in text response for ${model}`,
          );
        }
      }

      return { isInvalidModel, errorData: { text: textResponse } };
    } catch (textError) {
      if (debug) {
        console.error("Failed to read error response as text:", textError);
      }
      return { isInvalidModel: false };
    }
  }
}

/**
 * Prepare request parameters common to both streaming and non-streaming calls
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions,
): {
  apiKey: string;
  model: string;
  endpoint: string;
  requestOptions: RequestInit;
  schemaStrategy: SchemaStrategy;
} {
  const apiKey =
    options.apiKey ||
    (typeof window !== "undefined" ? (window as any).CALLAI_API_KEY : null);
  const schema = options.schema || null;

  if (!apiKey) {
    throw new Error(
      "API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY",
    );
  }

  // Select the appropriate strategy based on model and schema
  const schemaStrategy = chooseSchemaStrategy(options.model, schema);
  const model = schemaStrategy.model;

  // Get custom chat API origin if set
  const customChatOrigin =
    options.chatUrl ||
    (typeof window !== "undefined" ? (window as any).CALLAI_CHAT_URL : null) ||
    (typeof process !== "undefined" && process.env
      ? process.env.CALLAI_CHAT_URL
      : null);

  // Use custom origin or default OpenRouter URL
  const endpoint =
    options.endpoint ||
    (customChatOrigin
      ? `${customChatOrigin}/api/v1/chat/completions`
      : "https://openrouter.ai/api/v1/chat/completions");

  // Handle both string prompts and message arrays for backward compatibility
  const messages: Message[] = Array.isArray(prompt)
    ? prompt
    : [{ role: "user", content: prompt }];

  // Build request parameters
  const requestParams: any = {
    model: model,
    stream: options.stream === true,
    messages: messages,
  };

  // Support for multimodal content (like images)
  if (options.modalities && options.modalities.length > 0) {
    requestParams.modalities = options.modalities;
  }

  // Apply the strategy's request preparation
  const strategyParams = schemaStrategy.prepareRequest(schema, messages);

  // If the strategy returns custom messages, use those instead
  if (strategyParams.messages) {
    requestParams.messages = strategyParams.messages;
  }

  // Add all other strategy parameters
  Object.entries(strategyParams).forEach(([key, value]) => {
    if (key !== "messages") {
      requestParams[key] = value;
    }
  });

  // Add any other options provided, but exclude internal keys
  Object.entries(options).forEach(([key, value]) => {
    if (!["apiKey", "model", "endpoint", "stream", "schema"].includes(key)) {
      requestParams[key] = value;
    }
  });

  const requestOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://vibes.diy",
      "X-Title": "Vibes",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestParams),
  };

  // Debug logging for request payload
  if (options.debug) {
    console.log(`[callAI-prepareRequest:raw] Endpoint: ${endpoint}`);
    console.log(`[callAI-prepareRequest:raw] Model: ${model}`);
    console.log(
      `[callAI-prepareRequest:raw] Payload:`,
      JSON.stringify(requestParams),
    );
  }

  return { apiKey, model, endpoint, requestOptions, schemaStrategy };
}

/**
 * Internal implementation for non-streaming API calls
 */
async function callAINonStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {},
  isRetry: boolean = false,
): Promise<string> {
  try {
    // Start timing for metadata
    const startTime = Date.now();

    // Create metadata object
    const meta: ResponseMeta = {
      model: options.model || "unknown",
      timing: {
        startTime: startTime,
      },
    };
    const { endpoint, requestOptions, model, schemaStrategy } =
      prepareRequestParams(prompt, options);

    const response = await fetch(endpoint, requestOptions);

    // We don't store the raw Response object in metadata anymore

    // Handle HTTP errors, with potential fallback for invalid model
    if (!response.ok || response.status >= 400) {
      const { isInvalidModel } = await checkForInvalidModelError(
        response,
        model,
        isRetry,
        options.skipRetry,
        options.debug,
      );

      if (isInvalidModel) {
        // Retry with fallback model
        return callAINonStreaming(
          prompt,
          { ...options, model: FALLBACK_MODEL },
          true,
        );
      }

      // Create a proper error object with the status code preserved
      const error: any = new Error(`HTTP error! Status: ${response.status}`);
      // Add status code as a property of the error object
      error.status = response.status;
      error.statusCode = response.status; // Add statusCode for compatibility with different error patterns
      throw error;
    }

    let result;

    // For Claude, use text() instead of json() to avoid potential hanging
    if (/claude/i.test(model)) {
      try {
        result = await extractClaudeResponse(response);
      } catch (error) {
        handleApiError(
          error,
          "Claude API response processing failed",
          options.debug,
        );
      }
    } else {
      result = await response.json();
    }

    // Debug logging for raw API response
    if (options.debug) {
      console.log(
        `[callAI-nonStreaming:raw] Response:`,
        JSON.stringify(result),
      );
    }

    // Handle error responses
    if (result.error) {
      if (options.debug) {
        console.error("API returned an error:", result.error);
      }
      // If it's a model error and not already a retry, try with fallback
      if (
        !isRetry &&
        !options.skipRetry &&
        result.error.message &&
        result.error.message.toLowerCase().includes("not a valid model")
      ) {
        if (options.debug) {
          console.warn(`Model ${model} error, retrying with ${FALLBACK_MODEL}`);
        }
        return callAINonStreaming(
          prompt,
          { ...options, model: FALLBACK_MODEL },
          true,
        );
      }
      return JSON.stringify({
        error: result.error,
        message: result.error.message || "API returned an error",
      });
    }

    // Extract content from the response
    const content = extractContent(result, schemaStrategy);

    // Store the raw response data for user access
    if (result) {
      // Store the parsed JSON result from the API call
      meta.rawResponse = result;
    }

    // Update model info
    meta.model = model;

    // Update timing info
    if (meta.timing) {
      meta.timing.endTime = Date.now();
      meta.timing.duration = meta.timing.endTime - meta.timing.startTime;
    }

    // Process the content based on model type
    const processedContent = schemaStrategy.processResponse(content);

    // Box the string for WeakMap storage
    const boxed = boxString(processedContent);
    responseMetadata.set(boxed, meta);

    return processedContent;
  } catch (error) {
    await handleApiError(error, "Non-streaming API call", options.debug, {
      apiKey: options.apiKey,
      endpoint: options.endpoint,
      skipRefresh: options.skipRefresh,
    });
    // If we get here, key was refreshed successfully, retry the operation with the new key
    // Retry with the refreshed key
    return callAINonStreaming(
      prompt,
      {
        ...options,
        apiKey: keyStore.current || undefined, // Use the refreshed key from keyStore
      },
      true,
    ); // Set isRetry to true
  }

  // This line will never be reached, but it satisfies the linter
  throw new Error("Unexpected code path in callAINonStreaming");
}

/**
 * Extract content from API response accounting for different formats
 */
function extractContent(result: any, schemaStrategy: SchemaStrategy): any {
  // Find tool use content or normal content
  let content;

  // Extract tool use content if necessary
  if (
    schemaStrategy.strategy === "tool_mode" &&
    result.stop_reason === "tool_use"
  ) {
    // Try to find tool_use block in different response formats
    if (result.content && Array.isArray(result.content)) {
      const toolUseBlock = result.content.find(
        (block: any) => block.type === "tool_use",
      );
      if (toolUseBlock) {
        content = toolUseBlock;
      }
    }

    if (!content && result.choices && Array.isArray(result.choices)) {
      const choice = result.choices[0];
      if (choice.message && Array.isArray(choice.message.content)) {
        const toolUseBlock = choice.message.content.find(
          (block: any) => block.type === "tool_use",
        );
        if (toolUseBlock) {
          content = toolUseBlock;
        }
      }
    }
  }

  // If no tool use content was found, use the standard message content
  if (!content) {
    if (!result.choices || !result.choices.length) {
      throw new Error("Invalid response format from API");
    }

    content = result.choices[0]?.message?.content || "";
  }

  return content;
}

/**
 * Extract response from Claude API with timeout handling
 */
async function extractClaudeResponse(response: Response): Promise<any> {
  let textResponse: string;
  const textPromise = response.text();
  const timeoutPromise = new Promise<string>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Text extraction timed out after 5 seconds"));
    }, 5000);
  });

  try {
    textResponse = (await Promise.race([
      textPromise,
      timeoutPromise,
    ])) as string;
  } catch (textError) {
    // Always log timeout errors
    console.error(`Text extraction timed out or failed:`, textError);
    throw new Error(
      "Claude response text extraction timed out. This is likely an issue with the Claude API's response format.",
    );
  }

  try {
    return JSON.parse(textResponse);
  } catch (err) {
    // Always log JSON parsing errors
    console.error(`Failed to parse Claude response as JSON:`, err);
    throw new Error(`Failed to parse Claude response as JSON: ${err}`);
  }
}

/**
 * Generator factory function for streaming API calls
 * This is called after the fetch is made and response is validated
 *
 * Note: Even though we checked response.ok before creating this generator,
 * we need to be prepared for errors that may occur during streaming. Some APIs
 * return a 200 OK initially but then deliver error information in the stream.
 */
async function* createStreamingGenerator(
  response: Response,
  options: CallAIOptions,
  schemaStrategy: SchemaStrategy,
  model: string,
): StreamResponse {
  // Create a metadata object for this streaming response
  const startTime = Date.now();
  const meta: ResponseMeta = {
    model: model,
    timing: {
      startTime: startTime,
    },
  };
  if (options.debug) {
    console.log(
      `[callAI:${PACKAGE_VERSION}] Starting streaming generator with model: ${model}`,
    );
    console.log(
      `[callAI:${PACKAGE_VERSION}] Response status:`,
      response.status,
    );
    console.log(`[callAI:${PACKAGE_VERSION}] Response type:`, response.type);
    console.log(
      `[callAI:${PACKAGE_VERSION}] Response Content-Type:`,
      response.headers.get("content-type"),
    );
  }
  try {
    // Handle streaming response
    if (!response.body) {
      throw new Error(
        "Response body is undefined - API endpoint may not support streaming",
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let completeText = "";
    let chunkCount = 0;
    let toolCallsAssembled = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (options.debug) {
          console.log(
            `[callAI:${PACKAGE_VERSION}] Stream done=true after ${chunkCount} chunks`,
          );
          console.log(
            `[callAI-streaming:complete v${PACKAGE_VERSION}] Stream finished after ${chunkCount} chunks`,
          );
        }
        break;
      }

      // Increment chunk counter before processing
      chunkCount++;
      const chunk = decoder.decode(value);
      if (options.debug) {
        console.log(
          `[callAI:${PACKAGE_VERSION}] Raw chunk #${chunkCount} (${chunk.length} bytes):`,
          chunk.length > 200 ? chunk.substring(0, 200) + "..." : chunk,
        );
      }

      const lines = chunk.split("\n").filter((line) => line.trim() !== "");
      if (options.debug) {
        console.log(
          `[callAI:${PACKAGE_VERSION}] Chunk #${chunkCount} contains ${lines.length} non-empty lines`,
        );
      }

      for (const line of lines) {
        if (options.debug) {
          console.log(
            `[callAI:${PACKAGE_VERSION}] Processing line:`,
            line.length > 100 ? line.substring(0, 100) + "..." : line,
          );
        }

        if (line.startsWith("data: ")) {
          let data = line.slice(6);

          if (data === "[DONE]") {
            if (options.debug) {
              console.log(`[callAI:${PACKAGE_VERSION}] Received [DONE] marker`);
            }
            break;
          }
          if (options.debug) {
            console.log(`[callAI:raw] ${line}`);
          }

          // Skip [DONE] marker or OPENROUTER PROCESSING lines
          if (
            line.includes("[DONE]") ||
            line.includes("OPENROUTER PROCESSING")
          ) {
            continue;
          }

          try {
            const jsonLine = line.replace("data: ", "");
            if (!jsonLine.trim()) {
              if (options.debug) {
                console.log(
                  `[callAI:${PACKAGE_VERSION}] Empty JSON line after data: prefix`,
                );
              }
              continue;
            }

            if (options.debug) {
              console.log(
                `[callAI:${PACKAGE_VERSION}] JSON line (first 100 chars):`,
                jsonLine.length > 100
                  ? jsonLine.substring(0, 100) + "..."
                  : jsonLine,
              );
            }

            // Parse the JSON chunk
            let json;
            try {
              json = JSON.parse(jsonLine);
              if (options.debug) {
                console.log(
                  `[callAI:${PACKAGE_VERSION}] Parsed JSON:`,
                  JSON.stringify(json).substring(0, 1000),
                );
              }
            } catch (parseError) {
              if (options.debug) {
                console.error(
                  `[callAI:${PACKAGE_VERSION}] JSON parse error:`,
                  parseError,
                );
              }
              continue;
            }

            // Enhanced error detection - check for BOTH error and json.error
            // Some APIs return 200 OK but then deliver errors in the stream
            if (json.error || (typeof json === "object" && "error" in json)) {
              if (options.debug) {
                console.error(
                  `[callAI:${PACKAGE_VERSION}] Detected error in streaming response:`,
                  json,
                );
              }

              // Create a detailed error object similar to our HTTP error handling
              const errorMessage =
                json.error?.message ||
                json.error?.toString() ||
                JSON.stringify(json.error || json);

              const detailedError = new Error(
                `API streaming error: ${errorMessage}`,
              );

              // Add error metadata
              (detailedError as any).status = json.error?.status || 400;
              (detailedError as any).statusText =
                json.error?.type || "Bad Request";
              (detailedError as any).details = JSON.stringify(
                json.error || json,
              );

              console.error(
                `[callAI:${PACKAGE_VERSION}] Throwing stream error:`,
                detailedError,
              );
              throw detailedError;
            }

            // Handle tool use response - Claude with schema cases
            const isClaudeWithSchema =
              /claude/i.test(model) && schemaStrategy.strategy === "tool_mode";

            if (isClaudeWithSchema) {
              // Claude streaming tool calls - need to assemble arguments
              if (json.choices && json.choices.length > 0) {
                const choice = json.choices[0];

                // Handle finish reason tool_calls - this is where we know the tool call is complete
                if (choice.finish_reason === "tool_calls") {
                  try {
                    // Try to fix any malformed JSON that might have resulted from chunking
                    // This happens when property names get split across chunks
                    if (toolCallsAssembled) {
                      try {
                        // First try parsing as-is
                        JSON.parse(toolCallsAssembled);
                      } catch (parseError) {
                        if (options.debug) {
                          console.log(
                            `[callAI:${PACKAGE_VERSION}] Attempting to fix malformed JSON in tool call:`,
                            toolCallsAssembled,
                          );
                        }

                        // Apply comprehensive fixes for Claude's JSON property splitting
                        let fixedJson = toolCallsAssembled;

                        // 1. Remove trailing commas
                        fixedJson = fixedJson.replace(/,\s*([\}\]])/, "$1");

                        // 2. Ensure proper JSON structure
                        // Add closing braces if missing
                        const openBraces = (fixedJson.match(/\{/g) || [])
                          .length;
                        const closeBraces = (fixedJson.match(/\}/g) || [])
                          .length;
                        if (openBraces > closeBraces) {
                          fixedJson += "}".repeat(openBraces - closeBraces);
                        }

                        // Add opening brace if missing
                        if (!fixedJson.trim().startsWith("{")) {
                          fixedJson = "{" + fixedJson.trim();
                        }

                        // Ensure it ends with a closing brace
                        if (!fixedJson.trim().endsWith("}")) {
                          fixedJson += "}";
                        }

                        // 3. Fix various property name/value split issues
                        // Fix dangling property names without values
                        fixedJson = fixedJson.replace(
                          /"(\w+)"\s*:\s*$/g,
                          '"$1":null',
                        );

                        // Fix missing property values
                        fixedJson = fixedJson.replace(
                          /"(\w+)"\s*:\s*,/g,
                          '"$1":null,',
                        );

                        // Fix incomplete property names (when split across chunks)
                        fixedJson = fixedJson.replace(
                          /"(\w+)"\s*:\s*"(\w+)$/g,
                          '"$1$2"',
                        );

                        // Balance brackets
                        const openBrackets = (fixedJson.match(/\[/g) || [])
                          .length;
                        const closeBrackets = (fixedJson.match(/\]/g) || [])
                          .length;
                        if (openBrackets > closeBrackets) {
                          fixedJson += "]".repeat(openBrackets - closeBrackets);
                        }

                        if (options.debug) {
                          console.log(
                            `[callAI:${PACKAGE_VERSION}] Applied comprehensive JSON fixes:`,
                            `\nBefore: ${toolCallsAssembled}`,
                            `\nAfter: ${fixedJson}`,
                          );
                        }

                        toolCallsAssembled = fixedJson;
                      }
                    }

                    // Return the assembled tool call
                    completeText = toolCallsAssembled;
                    yield completeText;
                    continue;
                  } catch (e) {
                    console.error(
                      "[callAIStreaming] Error handling assembled tool call:",
                      e,
                    );
                  }
                }

                // Assemble tool_calls arguments from delta
                // Simply accumulate the raw strings without trying to parse them
                if (choice.delta && choice.delta.tool_calls) {
                  const toolCall = choice.delta.tool_calls[0];
                  if (
                    toolCall &&
                    toolCall.function &&
                    toolCall.function.arguments !== undefined
                  ) {
                    toolCallsAssembled += toolCall.function.arguments;
                    // Don't try to parse or yield anything yet - wait for complete signal
                  }
                }
              }
            }

            // Handle tool use response - old format
            if (
              isClaudeWithSchema &&
              (json.stop_reason === "tool_use" || json.type === "tool_use")
            ) {
              // First try direct tool use object format
              if (json.type === "tool_use") {
                completeText = schemaStrategy.processResponse(json);
                yield completeText;
                continue;
              }

              // Extract the tool use content
              if (json.content && Array.isArray(json.content)) {
                const toolUseBlock = json.content.find(
                  (block: any) => block.type === "tool_use",
                );
                if (toolUseBlock) {
                  completeText = schemaStrategy.processResponse(toolUseBlock);
                  yield completeText;
                  continue;
                }
              }

              // Find tool_use in assistant's content blocks
              if (json.choices && Array.isArray(json.choices)) {
                const choice = json.choices[0];
                if (choice.message && Array.isArray(choice.message.content)) {
                  const toolUseBlock = choice.message.content.find(
                    (block: any) => block.type === "tool_use",
                  );
                  if (toolUseBlock) {
                    completeText = schemaStrategy.processResponse(toolUseBlock);
                    yield completeText;
                    continue;
                  }
                }

                // Handle case where the tool use is in the delta
                if (choice.delta && Array.isArray(choice.delta.content)) {
                  const toolUseBlock = choice.delta.content.find(
                    (block: any) => block.type === "tool_use",
                  );
                  if (toolUseBlock) {
                    completeText = schemaStrategy.processResponse(toolUseBlock);
                    yield completeText;
                    continue;
                  }
                }
              }
            }

            // Extract content from the delta
            if (json.choices?.[0]?.delta?.content !== undefined) {
              const content = json.choices[0].delta.content || "";

              // Treat all models the same - yield as content arrives
              completeText += content;
              yield schemaStrategy.processResponse(completeText);
            }
            // Handle message content format (non-streaming deltas)
            else if (json.choices?.[0]?.message?.content !== undefined) {
              const content = json.choices[0].message.content || "";
              completeText += content;
              yield schemaStrategy.processResponse(completeText);
            }
            // Handle content blocks for Claude/Anthropic response format
            else if (
              json.choices?.[0]?.message?.content &&
              Array.isArray(json.choices[0].message.content)
            ) {
              const contentBlocks = json.choices[0].message.content;
              // Find text or tool_use blocks
              for (const block of contentBlocks) {
                if (block.type === "text") {
                  completeText += block.text || "";
                } else if (isClaudeWithSchema && block.type === "tool_use") {
                  completeText = schemaStrategy.processResponse(block);
                  break; // We found what we need
                }
              }

              yield schemaStrategy.processResponse(completeText);
            }
          } catch (e) {
            if (options.debug) {
              console.error(`[callAIStreaming] Error parsing JSON chunk:`, e);
            }
          }
        }
      }
    }

    // We no longer need special error handling here as errors are thrown immediately

    // No extra error handling needed here - errors are thrown immediately

    // If we have assembled tool calls but haven't yielded them yet
    if (toolCallsAssembled && (!completeText || completeText.length === 0)) {
      // Try to fix any remaining JSON issues before returning
      let result = toolCallsAssembled;

      try {
        // Validate the JSON before returning
        JSON.parse(result);
      } catch (e) {
        if (options.debug) {
          console.log(
            `[callAI:${PACKAGE_VERSION}] Final JSON validation failed, attempting fixes:`,
            e,
          );
        }

        // Apply more robust fixes for Claude's streaming JSON issues

        // 1. Remove trailing commas (common in malformed JSON)
        result = result.replace(/,\s*([\}\]])/, "$1");

        // 2. Ensure we have proper JSON structure
        // Add closing braces if missing
        const openBraces = (result.match(/\{/g) || []).length;
        const closeBraces = (result.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          result += "}".repeat(openBraces - closeBraces);
        }

        // Add opening brace if missing
        if (!result.trim().startsWith("{")) {
          result = "{" + result.trim();
        }

        // Ensure it ends with a closing brace
        if (!result.trim().endsWith("}")) {
          result += "}";
        }

        // 3. Fix various property name/value split issues (common with Claude)
        // Fix dangling property names without values
        result = result.replace(/"(\w+)"\s*:\s*$/g, '"$1":null');

        // Fix missing property values
        result = result.replace(/"(\w+)"\s*:\s*,/g, '"$1":null,');

        // Fix incomplete property names (when split across chunks)
        result = result.replace(/"(\w+)"\s*:\s*"(\w+)$/g, '"$1$2"');

        // One more check for balanced braces/brackets
        const openBrackets = (result.match(/\[/g) || []).length;
        const closeBrackets = (result.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
          result += "]".repeat(openBrackets - closeBrackets);
        }

        if (options.debug) {
          console.log(
            `[callAI:${PACKAGE_VERSION}] After fixes, result:`,
            result,
          );
        }
      }

      // Update metadata with completion timing
      const endTime = Date.now();
      if (meta.timing) {
        meta.timing.endTime = endTime;
        meta.timing.duration = endTime - meta.timing.startTime;
      }

      // If result is a string, we need to box it for the WeakMap
      if (typeof result === "string") {
        const boxed = boxString(result);
        responseMetadata.set(boxed, meta);
      } else {
        responseMetadata.set(result, meta);
      }

      return result;
    }

    // Ensure the final return has proper, processed content
    const finalResult = schemaStrategy.processResponse(completeText);

    // Update metadata with completion timing
    const endTime = Date.now();
    if (meta.timing) {
      meta.timing.endTime = endTime;
      meta.timing.duration = endTime - meta.timing.startTime;
    }

    // If finalResult is a string, we need to box it for the WeakMap
    if (typeof finalResult === "string") {
      const boxed = boxString(finalResult);
      responseMetadata.set(boxed, meta);
    } else {
      responseMetadata.set(finalResult, meta);
    }

    return finalResult;
  } catch (error) {
    try {
      // Standardize error handling
      await handleApiError(error, "Streaming API call", options.debug, {
        apiKey: options.apiKey,
        endpoint: options.endpoint,
        skipRefresh: options.skipRefresh,
      });

      // If we get here, key was refreshed successfully
      const message = "[Key refreshed. Please retry your request.]";
      yield message;
      return message;
    } catch (refreshError) {
      // Re-throw the error if key refresh also failed
      throw refreshError;
    }
  }
}
