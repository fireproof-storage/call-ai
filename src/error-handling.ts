/**
 * Error handling utilities for call-ai
 */
import {
  keyStore,
  globalDebug,
  isNewKeyError,
  refreshApiKey,
} from "./key-management";

// Standardized API error handler
// @param error The error object
// @param context Context description for error messages
// @param debug Whether to log debug information
// @param options Options for error handling including key refresh control
async function handleApiError(
  error: any,
  context: string,
  debug: boolean = globalDebug,
  options: { apiKey?: string; endpoint?: string; skipRefresh?: boolean } = {},
): Promise<void> {
  // Extract error details
  const errorMessage = error?.message || String(error);
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    (errorMessage.match(/status: (\d+)/i)?.[1] &&
      parseInt(errorMessage.match(/status: (\d+)/i)![1]));

  if (debug) {
    console.error(`[callAI:error] ${context} error:`, {
      message: errorMessage,
      status,
      name: error?.name,
      cause: error?.cause,
    });
  }

  // Don't attempt API key refresh if explicitly skipped
  if (options.skipRefresh) {
    throw error;
  }

  // Determine if this error suggests we need a new API key
  const needsNewKey = isNewKeyError(error, debug);

  // If the error suggests an API key issue, try to refresh the key
  if (needsNewKey) {
    if (debug) {
      console.log(
        `[callAI:key-refresh] Error suggests API key issue, attempting refresh...`,
      );
    }

    try {
      // Use provided key/endpoint or fallback to global configuration
      const currentKey = options.apiKey || keyStore.current;
      const endpoint = options.endpoint || keyStore.refreshEndpoint;

      // Refresh the API key
      const { apiKey, topup } = await refreshApiKey(
        currentKey,
        endpoint,
        keyStore.refreshToken,
        debug,
      );

      // Update the key in the store (if not already set by refreshApiKey)
      if (keyStore.current !== apiKey) {
        keyStore.current = apiKey;
      }

      if (debug) {
        console.log(
          `[callAI:key-refresh] ${topup ? "Topped up" : "Refreshed"} API key successfully`,
        );
      }

      // Return without throwing since we've successfully recovered
      return;
    } catch (refreshError) {
      // Log refresh failure but throw the original error
      if (debug) {
        console.error(
          `[callAI:key-refresh] API key refresh failed:`,
          refreshError,
        );
      }
      // Create a more detailed error from the original one
      const detailedError = new Error(
        `${errorMessage} (Key refresh failed: ${refreshError.message})`,
      );
      // Preserve error metadata from the original error
      (detailedError as any).originalError = error;
      (detailedError as any).refreshError = refreshError;
      (detailedError as any).status = status || 401;

      throw detailedError;
    }
  }

  // For non-key errors, create a detailed error object
  const detailedError = new Error(`${context}: ${errorMessage}`);
  (detailedError as any).originalError = error;
  (detailedError as any).status = status || 500;
  (detailedError as any).errorType = error?.name || "Error";

  throw detailedError;
}

// Helper to check if an error indicates invalid model and handle fallback
async function checkForInvalidModelError(
  response: Response,
  model: string,
  isRetry: boolean,
  skipRetry: boolean = false,
  debug: boolean = globalDebug,
): Promise<{ isInvalidModel: boolean; errorData?: any }> {
  // Only check 4xx errors (which could indicate invalid model)
  if (response.status < 400 || response.status >= 500) {
    return { isInvalidModel: false };
  }

  // Clone the response so we can still use the original later if needed
  const responseClone = response.clone();

  // Try to parse the response as JSON
  let errorData;
  try {
    errorData = await responseClone.json();
  } catch (e) {
    // If it's not JSON, get the text
    try {
      const text = await responseClone.text();
      errorData = { error: text };
    } catch (textError) {
      errorData = { error: `Error ${response.status}: ${response.statusText}` };
    }
  }

  // Check if the error indicates an invalid model
  const isInvalidModelError =
    // Status checks
    response.status === 404 ||
    response.status === 400 ||
    // Response content checks
    (errorData &&
      ((typeof errorData.error === "string" &&
        (errorData.error.toLowerCase().includes("model") ||
          errorData.error.toLowerCase().includes("engine") ||
          errorData.error.toLowerCase().includes("not found") ||
          errorData.error.toLowerCase().includes("invalid") ||
          errorData.error.toLowerCase().includes("unavailable"))) ||
        (errorData.error?.message &&
          typeof errorData.error.message === "string" &&
          (errorData.error.message.toLowerCase().includes("model") ||
            errorData.error.message.toLowerCase().includes("engine") ||
            errorData.error.message.toLowerCase().includes("not found") ||
            errorData.error.message.toLowerCase().includes("invalid") ||
            errorData.error.message.toLowerCase().includes("unavailable")))));

  if (debug && isInvalidModelError) {
    console.log(
      `[callAI:model-fallback] Detected invalid model error for "${model}":`,
      errorData,
    );
  }

  return { isInvalidModel: isInvalidModelError, errorData };
}

export { handleApiError, checkForInvalidModelError };
