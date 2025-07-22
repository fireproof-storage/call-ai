# API Key Refresh Plan

## Problem Statement

When API calls receive a 403 Forbidden response, it often indicates an expired or invalid API key. Currently, the `handleApiError` function simply throws the error. We need to enhance this to attempt key refreshing before retrying the API call.

## Design Considerations

- Maintain the current public API without changes
- Support key refresh transparently without requiring caller to retry
- Manage API key state internally (no instance state)
- Focus only on single endpoint/keyset per process
- Support getting an initial key when no key exists
- Handle both key top-ups (keep using same key) and new key issuance
- Use separate authentication for key refresh service (CALL_AI_REFRESH_TOKEN)

## Implementation Plan

### 1. Add Utils for Key Error Detection

Create utility functions to avoid duplication:

```typescript
/**
 * Check if an error indicates we need a new API key
 * @param error The error to check
 * @param debug Whether to log debug information
 * @returns True if the error suggests we need a new key
 */
export function isNewKeyError(error: any, debug: boolean = false): boolean {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const is4xx = status >= 400 && status < 500;

  if (is4xx && debug) {
    console.log(`[callAi:debug] Key error detected: status=${status}, message=${String(error)}`);
  }

  return is4xx;
}
```

### 2. Add Internal Key Store

Create a module-level key store that can be updated without external changes:

```typescript
// Internal key store to keep track of the latest key
const keyStore = {
  // Default key from environment or config
  current: null as string | null,
  // The refresh endpoint URL
  refreshEndpoint: null as string | null,
  // Authentication token for refresh endpoint
  refreshToken: null as string | null,
  // Flag to prevent concurrent refresh attempts
  isRefreshing: false,
  // Timestamp of last refresh attempt (to prevent too frequent refreshes)
  lastRefreshAttempt: 0,
};

/**
 * Initialize key store with environment variables
 */
function initKeyStore() {
  // Initialize from environment variables if in Node.js context
  if (typeof process !== "undefined" && process.env) {
    keyStore.current = process.env.CALLAI_API_KEY || null;
    keyStore.refreshEndpoint = process.env.CALLAI_REFRESH_ENDPOINT || null;
    keyStore.refreshToken = process.env.CALL_AI_REFRESH_TOKEN || null;
  }
  // Initialize from window globals if in browser context
  else if (typeof window !== "undefined") {
    keyStore.current = (window as any).CALLAI_API_KEY || null;
    keyStore.refreshEndpoint = (window as any).CALLAI_REFRESH_ENDPOINT || null;
    keyStore.refreshToken = (window as any).CALL_AI_REFRESH_TOKEN || null;
  }
}

// Initialize on module load
initKeyStore();
```

### 2. Update the `prepareRequestParams` Function

Modify to check and use the key from keyStore when available:

```typescript
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions,
): {
  /* ... existing return type ... */
} {
  // Try options.apiKey first, then keyStore.current, then fallback mechanisms
  const apiKey =
    options.apiKey ||
    keyStore.current ||
    (typeof window !== "undefined" ? (window as any).CALLAI_API_KEY : null) ||
    (typeof process !== "undefined" && process.env ? process.env.CALLAI_API_KEY : null);

  // If key provided in options, update the store
  if (options.apiKey) {
    keyStore.current = options.apiKey;
  }

  // Rest of the existing function...
}
```

### 3. Enhance the `handleApiError` Function

Modify to handle 403 errors and refresh the key when possible:

```typescript
async function handleApiError(
  error: any,
  context: string,
  debug: boolean = false,
  options: { apiKey?: string; endpoint?: string } = {},
): Promise<void> {
  if (debug) {
    console.error(`[callAi:${context}]:`, error);
  }

  // Check if this error indicates we need a new key
  const needsNewKey = isNewKeyError(error, debug);
  const noKey = !options.apiKey && !keyStore.current;

  // Try to refresh key if (we need a new key OR we have no key) AND refreshEndpoint is configured
  if ((needsNewKey || noKey) && keyStore.refreshEndpoint) {
    // Don't try to refresh if we've tried too recently (unless we have no key at all)
    const now = Date.now();
    const minRefreshInterval = 5000; // 5 seconds

    if (!keyStore.isRefreshing && (noKey || now - keyStore.lastRefreshAttempt > minRefreshInterval)) {
      try {
        keyStore.isRefreshing = true;
        keyStore.lastRefreshAttempt = now;

        // Call refresh endpoint - pass current key if we have one
        const currentKey = options.apiKey || keyStore.current;
        const result = await refreshApiKey(currentKey, keyStore.refreshEndpoint, keyStore.refreshToken);

        // If the server indicated this is a top-up (and we already have a key), keep using our current key
        // Otherwise use the new key that was returned
        if (!result.topup) {
          // Update the key in our store with the new key
          keyStore.current = result.apiKey;

          // If we're in a Node.js environment, also update process.env
          if (typeof process !== "undefined" && process.env) {
            process.env.CALLAI_API_KEY = result.apiKey;
          }

          // If we're in a browser, also update window
          if (typeof window !== "undefined") {
            (window as any).CALLAI_API_KEY = result.apiKey;
          }
        }

        // Signal that key refresh was attempted (whether top-up or new key)
        return; // This will allow the caller to retry
      } catch (refreshError) {
        console.error(`Key refresh failed: ${String(refreshError)}`);
        // Continue to throw the original error
      } finally {
        keyStore.isRefreshing = false;
      }
    }
  }

  // If we reach here, either key refresh failed or wasn't attempted
  throw new Error(`${context}: ${String(error)}`);
}
```

### 4. Add Key Refresh Function

```typescript
/**
 * Refreshes the API key by calling the specified endpoint
 * @param currentKey The current API key (may be null for initial key request)
 * @param endpoint The endpoint to call for key refresh
 * @param refreshToken Authentication token for the refresh endpoint
 * @returns Object containing the API key and topup flag
 */
async function refreshApiKey(
  currentKey: string | null,
  endpoint: string,
  refreshToken: string | null,
): Promise<{ apiKey: string; topup: boolean }> {
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
    }

    // Make request to refresh endpoint
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "refresh",
        currentKey: currentKey || undefined, // only send if we have one
      }),
    });

    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for required fields in the response
    if (!data.apiKey) {
      throw new Error("API key not found in refresh response");
    }

    // Return both the API key and whether this was a top-up
    return {
      apiKey: data.apiKey,
      topup: Boolean(data.topup), // convert to boolean in case it's truthy but not boolean
    };
  } catch (error) {
    throw new Error(`Key refresh failed: ${String(error)}`);
  }
}
```

### 5. Update the API Calling Functions

Modify the main callAi function to retry once with the new key:

```typescript
export async function callAi(prompt: string | Message[], options: CallAIOptions = {}): Promise<string> {
  // Try to get an initial key if we don't have one and refreshEndpoint is configured
  if (!options.apiKey && !keyStore.current && keyStore.refreshEndpoint && !keyStore.isRefreshing) {
    try {
      keyStore.isRefreshing = true;
      const result = await refreshApiKey(null, keyStore.refreshEndpoint, keyStore.refreshToken);
      keyStore.current = result.apiKey;

      // Update environment variables/globals with the new key
      if (typeof process !== "undefined" && process.env) {
        process.env.CALLAI_API_KEY = result.apiKey;
      }
      if (typeof window !== "undefined") {
        (window as any).CALLAI_API_KEY = result.apiKey;
      }

      // Now we have a key, so continue with the call
    } catch (initialKeyError) {
      console.error("Failed to get initial API key:", initialKeyError);
      // Continue with the call - it will likely fail, but the error will be clear
    } finally {
      keyStore.isRefreshing = false;
    }
  }

  // First attempt
  try {
    return await callAIInternal(prompt, options);
  } catch (error) {
    // Check if we need a new key
    const needsNewKey = isNewKeyError(error, options.debug || false);

    // Only attempt retry if we have a refreshEndpoint and either we need a new key or we have no key
    if (keyStore.refreshEndpoint && (needsNewKey || (!options.apiKey && !keyStore.current))) {
      // Attempt to refresh the key through handleApiError
      try {
        // This will throw if the refresh fails or can't be attempted
        await handleApiError(error, "callAi", options.debug || false, {
          apiKey: options.apiKey || keyStore.current,
          endpoint: options.endpoint,
        });

        // If we reach here, key refresh was successful - retry with potentially new key
        const retryOptions = { ...options, apiKey: keyStore.current };
        return await callAIInternal(prompt, retryOptions);
      } catch (refreshError) {
        // If we couldn't refresh, throw the original error
        throw error;
      }
    }

    // For other errors, just throw
    throw error;
  }
}

// Internal function that does the actual API call
async function callAIInternal(prompt: string | Message[], options: CallAIOptions = {}): Promise<string> {
  // Existing implementation...
}
```

### 6. Update Environment Configuration

Add support for the rekey endpoint and authentication token in .env or config:

```
# .env example
CALLAI_API_KEY=your-api-key
CALLAI_REFRESH_ENDPOINT=https://your-service.com/refresh-key
CALL_AI_REFRESH_TOKEN=your-refresh-service-authentication-token
```

The variables serve these purposes:

- `CALLAI_API_KEY`: The API key for making AI calls
- `CALLAI_REFRESH_ENDPOINT`: The endpoint to call when refreshing keys
- `CALL_AI_REFRESH_TOKEN`: Authentication token for the key refresh service (separate from the API key)

**Important Note on Refresh Token Management:**

The `CALL_AI_REFRESH_TOKEN` will be managed and refreshed by the owning page/application on a schedule we cannot predict. If the refresh token itself expires or becomes invalid, we need to clearly communicate this to the caller so they can handle refresh token renewal.

When the refresh endpoint returns a 401/403 error specifically indicating the refresh token is invalid (rather than the API key), we should throw a distinct error type that allows the caller to recognize this specific situation:

```typescript
// When detecting a refresh token error from the refresh endpoint
if (refreshError.status === 401 || refreshError.status === 403) {
  const refreshTokenError = new Error("Refresh token expired or invalid");
  refreshTokenError.name = "RefreshTokenError";
  refreshTokenError.originalError = refreshError;
  throw refreshTokenError;
}
```

This allows applications to implement their own refresh token renewal logic when needed.

## Benefits

1. No changes to public API - existing code continues to work
2. Automatic key refresh on 403 errors with one retry attempt
3. Updated keys are stored and used for future calls
4. No instance state, everything is module-level
5. Only one endpoint/keyset at a time (as specified)
