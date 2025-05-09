/**
 * Key management functionality for call-ai
 */

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
    const statusMatch = errorMessage.match(/status:\\s*(\\d+)/i);
    if (statusMatch && statusMatch[1]) {
      status = parseInt(statusMatch[1], 10);
    }
  }

  const is4xx = status >= 400 && status < 500;

  // Check for various error types that indicate key issues
  const isAuthError =
    status === 401 ||
    status === 403 ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("api key") ||
    errorMessage.includes("apikey") ||
    errorMessage.includes("auth");

  // More specific message checks, especially for common API providers
  const isInvalidKeyError =
    errorMessage.includes("invalid api key") ||
    errorMessage.includes("invalid key") ||
    errorMessage.includes("incorrect api key") ||
    errorMessage.includes("incorrect key") ||
    errorMessage.includes("authentication failed") ||
    errorMessage.includes("not authorized");

  // Check for OpenAI specific error patterns
  const isOpenAIKeyError =
    errorMessage.includes("openai") &&
    (errorMessage.includes("api key") ||
      errorMessage.includes("authentication"));

  // Check for rate limit errors which might indicate a key top-up is needed
  const isRateLimitError =
    status === 429 ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests") ||
    errorMessage.includes("quota") ||
    errorMessage.includes("exceed");

  // Check for billing or payment errors
  const isBillingError =
    errorMessage.includes("billing") ||
    errorMessage.includes("payment") ||
    errorMessage.includes("subscription") ||
    errorMessage.includes("account");

  // Simple heuristic: if it's a 4xx error with any key-related terms, likely needs key refresh
  const needsNewKey =
    is4xx &&
    (isAuthError ||
      isInvalidKeyError ||
      isOpenAIKeyError ||
      isRateLimitError ||
      isBillingError);

  if (debug && needsNewKey) {
    console.log(
      `[callAI:key-refresh] Detected error requiring key refresh: ${errorMessage}`,
    );
  }

  return needsNewKey;
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
  // Ensure we have an endpoint and refreshToken
  if (!endpoint) {
    throw new Error("No API key refresh endpoint specified");
  }

  if (!refreshToken) {
    throw new Error("No API key refresh token specified");
  }

  // Check if we're already in the process of refreshing (to prevent parallel refreshes)
  if (keyStore.isRefreshing) {
    if (debug) {
      console.log("API key refresh already in progress, waiting...");
    }
    // Wait for refresh to complete (simple polling)
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!keyStore.isRefreshing && keyStore.current) {
          clearInterval(checkInterval);
          resolve({ apiKey: keyStore.current, topup: false });
        }
      }, 100);
    });
  }

  // Rate limit key refresh to prevent overloading the service
  const now = Date.now();
  const timeSinceLastRefresh = now - keyStore.lastRefreshAttempt;
  const minRefreshInterval = 2000; // 2 seconds minimum interval between refreshes

  if (timeSinceLastRefresh < minRefreshInterval) {
    if (debug) {
      console.log(
        `Rate limiting key refresh, last attempt was ${timeSinceLastRefresh}ms ago`,
      );
    }
    // If we've refreshed too recently, wait a bit
    await new Promise((resolve) =>
      setTimeout(resolve, minRefreshInterval - timeSinceLastRefresh),
    );
  }

  // Set refreshing flag and update last attempt timestamp
  keyStore.isRefreshing = true;
  keyStore.lastRefreshAttempt = Date.now();

  // Process API paths
  let apiPath = "/api/keys";

  // Normalize endpoint URL to remove any trailing slashes
  const baseUrl = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;

  // Construct the full URL
  const url = `${baseUrl}${apiPath}`;

  if (debug) {
    console.log(`Refreshing API key from: ${url}`);
  }

  try {
    // Make the request
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshToken}`,
      },
      body: JSON.stringify({
        key: currentKey,
        hash: currentKey ? getHashFromKey(currentKey) : null,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `API key refresh failed: ${response.status} ${response.statusText}`,
      );
    }

    // Parse the response
    const data = await response.json();
    if (!data.key) {
      throw new Error(
        "Invalid response from key refresh endpoint: missing key",
      );
    }

    if (debug) {
      console.log("API key refreshed successfully");
    }

    // Store metadata for potential future use (like top-up)
    if (data.metadata) {
      storeKeyMetadata(data.metadata);
    }

    // Update the key store
    keyStore.current = data.key;

    // Determine if this was a top-up (using existing key) or new key
    const isTopup =
      currentKey && data.hash && data.hash === getHashFromKey(currentKey);

    // Reset refreshing flag
    keyStore.isRefreshing = false;

    return {
      apiKey: data.key,
      topup: isTopup,
    };
  } catch (error) {
    // Reset refreshing flag
    keyStore.isRefreshing = false;
    throw error;
  }
}

/**
 * Helper function to extract hash from key (implementation depends on how you store metadata)
 */
function getHashFromKey(key: string): string | null {
  if (!key) return null;
  // Simple implementation: just look up in our metadata store
  const metaKey = Object.keys(keyStore.metadata).find((k) => k === key);
  return metaKey ? keyStore.metadata[metaKey].hash || null : null;
}

/**
 * Helper function to store key metadata for future reference
 */
function storeKeyMetadata(data: any): void {
  if (!data || !data.key) return;

  // Store metadata with the key as the dictionary key
  keyStore.metadata[data.key] = {
    hash: data.hash || null,
    created: data.created || Date.now(),
    expires: data.expires || null,
    remaining: data.remaining || null,
    limit: data.limit || null,
  };
}

export {
  keyStore,
  globalDebug,
  initKeyStore,
  isNewKeyError,
  refreshApiKey,
  getHashFromKey,
  storeKeyMetadata,
};
