# API Key Refresh Implementation Notes

## Netlify Edge Function Integration

Based on the provided frontend client and backend Netlify Edge Function code, here are specific implementation details for the call-ai key refresh mechanism.

## Key Observations from Existing Code

1. The backend uses a `create-key` endpoint to generate new OpenRouter API keys
2. Authentication is via a Bearer token in the Authorization header
3. The backend uses a provisioning key from environment variables
4. There's no explicit "top-up" endpoint yet, only creation of new keys
5. Keys have metadata including hash, name, label, limit, usage, etc.

## Implementation Approach

### 1. Updated Environment Variables

```
# .env example
CALLAI_API_KEY=your-api-key
CALLAI_REFRESH_ENDPOINT=https://example.com     # Full base URL, /api/callai/create-key will be appended internally
CALL_AI_REFRESH_TOKEN=temporary-auth-token     # Will be replaced with proper auth in production
```

### 2. Update the `refreshApiKey` Function

```typescript
async function refreshApiKey(
  currentKey: string | null, 
  endpoint: string,
  refreshToken: string | null
): Promise<{ apiKey: string; topup: boolean }> {
  try {
    // Prepare headers with authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Use the refresh token for authentication
    if (refreshToken) {
      headers['Authorization'] = `Bearer ${refreshToken}`;
    } else {
      throw new Error("Refresh token is required for key creation");
    }
    
    // Extract hash from current key if available (for potential future top-up capability)
    let keyHash = null;
    if (currentKey) {
      try {
        // Attempt to extract hash if it's stored in metadata
        // This would be implementation-specific based on how you store key metadata
        keyHash = getHashFromKey(currentKey);
      } catch (e) {
        // If we can't extract the hash, we'll just create a new key
        console.warn("Could not extract hash from current key, will create new key");
      }
    }
    
    // Determine if this might be a top-up request based on available hash
    const isTopupAttempt = Boolean(keyHash);
    
    // Create the request body
    const requestBody: any = {
      userId: 'anonymous', // Replace with actual user ID if available
      name: 'Session Key',
      label: `session-${Date.now()}`
    };
    
    // If we have a key hash and want to attempt top-up (for future implementation)
    if (isTopupAttempt) {
      requestBody.keyHash = keyHash;
      requestBody.action = 'topup'; // Signal that we're trying to top up existing key
    }
    
    // Append the specific API path to the base URL endpoint
    const fullEndpointUrl = `${endpoint}/api/callai/create-key`;
    
    // Make request to refresh endpoint
    const response = await fetch(fullEndpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
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
        `Failed to refresh key: ${errorData.error || response.statusText}`
      );
    }
    
    // Parse the response
    const data = await response.json();
    
    // Extract the key and relevant metadata
    if (!data.key) {
      throw new Error('API key not found in refresh response');
    }
    
    // Store the key metadata for potential future use
    // This would allow extracting the hash later for top-up attempts
    storeKeyMetadata(data);
    
    // For now, always return with topup=false since the backend doesn't support topup yet
    // When topup is implemented on the backend, this can be updated
    return {
      apiKey: data.key,
      topup: false // Will be true when backend supports top-up feature
    };
  } catch (error) {
    // Re-throw refresh token errors with specific type
    if (error.name === "RefreshTokenError") {
      throw error;
    }
    throw new Error(`Key refresh failed: ${String(error)}`);
  }
}

// Helper function to extract hash from key (implementation depends on how you store metadata)
function getHashFromKey(key: string): string | null {
  // This is a placeholder - actual implementation would depend on your metadata storage
  // Perhaps the hash is stored in localStorage, or in memory alongside the key
  const keyMetadata = keyStore.metadata?.[key];
  return keyMetadata?.hash || null;
}

// Helper function to store key metadata for future reference
function storeKeyMetadata(data: any): void {
  // Initialize metadata storage if needed
  if (!keyStore.metadata) {
    keyStore.metadata = {};
  }
  
  // Store the metadata with the key as the index
  keyStore.metadata[data.key] = {
    hash: data.hash,
    name: data.name,
    label: data.label,
    limit: data.limit,
    usage: data.usage,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}
```

### 3. Update the Key Store to Include Metadata

```typescript
// Enhanced key store to track metadata
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
  // Storage for key metadata (useful for future top-up implementation)
  metadata: {} as Record<string, any>
};
```

## Future Enhancements for Backend

1. **Add top-up endpoint**: Create a new endpoint specifically for topping up existing keys rather than always creating new ones. This would look like:

```typescript
// Function to top up credits for an existing key
async function handleTopupKey(requestData, provisioningKey) {
  try {
    const { keyHash, additionalAmount = 1.0 } = requestData;

    if (!keyHash) {
      return new Response(JSON.stringify({ error: 'Key hash is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add logic here to top up the key using OpenRouter API
    // This would depend on OpenRouter's API capabilities

    // Return success response with the same key but updated limits
    return new Response(JSON.stringify({
      topup: true,
      // Include other key metadata
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

2. **Improve authentication**: Replace the temporary auth token with a proper auth mechanism

3. **Add user context**: When available, include user context in key creation/top-up to personalize keys

## Implementation Checklist

1. [ ] Update key store to include metadata tracking
2. [ ] Implement `getHashFromKey` and `storeKeyMetadata` functions
3. [ ] Update `refreshApiKey` to work with the Netlify endpoint format
4. [ ] Test with the existing backend endpoint
5. [ ] Work with backend team to add top-up functionality if desired