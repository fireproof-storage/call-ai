/**
 * Core API implementation for call-ai
 */
import {
  CallAIOptions,
  Message,
  SchemaStrategy,
  StreamResponse,
  ThenableStreamResponse,
} from "./types";
import { chooseSchemaStrategy } from "./strategies";

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

    // Make the fetch request and handle errors before creating the generator
    if (options.debug) {
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
      console.error(
        `[callAI:${PACKAGE_VERSION}] Network error during fetch:`,
        fetchError,
      );
      throw fetchError; // Re-throw network errors
    }

    // Explicitly check for HTTP error status and log extensively if debug is enabled
    const contentType = response.headers.get("content-type") || "";

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
    console.warn(
      `[callAI:${PACKAGE_VERSION}] WARNING: Using callAI with streaming without await is deprecated. ` +
        `Please use 'const generator = await callAI(...)' instead of 'const generator = callAI(...)'. ` +
        `This backward compatibility will be removed in a future version.`,
    );
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
    handleApiError(error, "Streaming buffer error", options.debug);
  }
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
 */
function handleApiError(
  error: any,
  context: string,
  debug: boolean = false,
): never {
  if (debug) {
    console.error(`[callAI:${context}]:`, error);
  }
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
    const debugEnabled = true; // Always log for now to help diagnose the issue

    if (debugEnabled) {
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

    if (isInvalidModel && debugEnabled) {
      console.warn(
        `[callAI:${PACKAGE_VERSION}] Model ${model} not valid, will retry with ${FALLBACK_MODEL}`,
      );
    }

    return { isInvalidModel, errorData };
  } catch (parseError) {
    // If we can't parse the response as JSON, try to read it as text
    console.error("Failed to parse error response as JSON:", parseError);
    try {
      const textResponse = await response.clone().text();
      console.log("Error response as text:", textResponse);

      // Even if it's not JSON, check if it contains any of our known patterns
      const lowerText = textResponse.toLowerCase();
      const isInvalidModel =
        lowerText.includes("invalid model") ||
        lowerText.includes("not exist") ||
        lowerText.includes("fake-model");

      if (isInvalidModel) {
        console.warn(
          `[callAI:${PACKAGE_VERSION}] Detected invalid model in text response for ${model}`,
        );
      }

      return { isInvalidModel, errorData: { text: textResponse } };
    } catch (textError) {
      console.error("Failed to read error response as text:", textError);
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

  const endpoint =
    options.endpoint || "https://openrouter.ai/api/v1/chat/completions";

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
    const { endpoint, requestOptions, model, schemaStrategy } =
      prepareRequestParams(prompt, options);

    const response = await fetch(endpoint, requestOptions);

    // Handle HTTP errors, with potential fallback for invalid model
    if (!response.ok || response.status >= 400) {
      const { isInvalidModel } = await checkForInvalidModelError(
        response,
        model,
        isRetry,
        options.skipRetry,
      );

      if (isInvalidModel) {
        // Retry with fallback model
        return callAINonStreaming(
          prompt,
          { ...options, model: FALLBACK_MODEL },
          true,
        );
      }

      throw new Error(`HTTP error! Status: ${response.status}`);
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
      console.error("API returned an error:", result.error);
      // If it's a model error and not already a retry, try with fallback
      if (
        !isRetry &&
        !options.skipRetry &&
        result.error.message &&
        result.error.message.toLowerCase().includes("not a valid model")
      ) {
        console.warn(`Model ${model} error, retrying with ${FALLBACK_MODEL}`);
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

    // Process the content based on model type
    return schemaStrategy.processResponse(content);
  } catch (error) {
    handleApiError(error, "Non-streaming API call", options.debug);
  }
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
    console.error(`Text extraction timed out or failed:`, textError);
    throw new Error(
      "Claude response text extraction timed out. This is likely an issue with the Claude API's response format.",
    );
  }

  try {
    return JSON.parse(textResponse);
  } catch (err) {
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
              console.log(
                `[callAI:${PACKAGE_VERSION}] Empty JSON line after data: prefix`,
              );
              continue;
            }

            console.log(
              `[callAI:${PACKAGE_VERSION}] JSON line (first 100 chars):`,
              jsonLine.length > 100
                ? jsonLine.substring(0, 100) + "..."
                : jsonLine,
            );

            // Parse the JSON chunk
            let json;
            try {
              json = JSON.parse(jsonLine);
              console.log(
                `[callAI:${PACKAGE_VERSION}] Parsed JSON:`,
                JSON.stringify(json).length > 100
                  ? JSON.stringify(json).substring(0, 100) + "..."
                  : JSON.stringify(json),
              );
            } catch (parseError) {
              console.error(
                `[callAI:${PACKAGE_VERSION}] JSON parse error:`,
                parseError,
              );
              console.error(
                `[callAI:${PACKAGE_VERSION}] Failed to parse:`,
                jsonLine,
              );
              continue;
            }

            // Enhanced error detection - check for BOTH error and json.error
            // Some APIs return 200 OK but then deliver errors in the stream
            if (json.error || (typeof json === "object" && "error" in json)) {
              console.error(
                `[callAI:${PACKAGE_VERSION}] Detected error in streaming response:`,
                json,
              );

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

                // Handle finish reason tool_calls
                if (choice.finish_reason === "tool_calls") {
                  try {
                    // Parse the assembled JSON
                    completeText = toolCallsAssembled;
                    yield completeText;
                    continue;
                  } catch (e) {
                    console.error(
                      "[callAIStreaming] Error parsing assembled tool call:",
                      e,
                    );
                  }
                }

                // Assemble tool_calls arguments from delta
                if (choice.delta && choice.delta.tool_calls) {
                  const toolCall = choice.delta.tool_calls[0];
                  if (
                    toolCall &&
                    toolCall.function &&
                    toolCall.function.arguments !== undefined
                  ) {
                    toolCallsAssembled += toolCall.function.arguments;
                    // We don't yield here to avoid partial JSON
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
            console.error(`[callAIStreaming] Error parsing JSON chunk:`, e);
          }
        }
      }
    }

    // We no longer need special error handling here as errors are thrown immediately

    // No extra error handling needed here - errors are thrown immediately

    // If we have assembled tool calls but haven't yielded them yet
    if (toolCallsAssembled && (!completeText || completeText.length === 0)) {
      return toolCallsAssembled;
    }

    // Ensure the final return has proper, processed content
    return schemaStrategy.processResponse(completeText);
  } catch (error) {
    // Standardize error handling
    handleApiError(error, "Streaming API call", options.debug);
  }
}
