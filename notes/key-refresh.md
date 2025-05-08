# OpenRouter API Key Refresh Documentation

This document outlines the API endpoints and patterns used for managing API keys in the Vibes.diy application. The system uses two primary API interactions:

1. Key creation via Cloudflare Function
2. Credit checking via OpenRouter API

## 1. Key Creation API

### Endpoint
```
POST ${API_ORIGIN}/api/keys
```
Where `API_ORIGIN` defaults to `https://vibecode.garden` or uses the local path `/api/keys` for same-origin requests.

### Request Headers
```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer temporary-auth-token'
}
```

### Request Body
```javascript
{
  userId: string | undefined,  // Optional user ID to associate with the key
  name: string,                // Name for the key (e.g., "User {userId} Session" or "Anonymous Session")
  label: string                // Label in format "session-{timestamp}"
}
```

### Response Format
```typescript
{
  key: string,          // The actual API key to use for OpenRouter
  hash: string,         // Hash representation of the key
  name: string,         // Name of the key
  label: string,        // Label for the key
  limit: number,        // Credit limit
  disabled: boolean,    // Whether the key is disabled
  usage: number,        // Current usage amount
  created_at: string,   // ISO timestamp of creation
  updated_at: string    // ISO timestamp of last update
}
```

### Error Response
```javascript
{
  error: string  // Error message describing what went wrong
}
```

### Implementation Notes
- The key is stored in localStorage with a timestamp to track its age
- Keys are considered valid for 7 days
- The system uses a module-level Promise to deduplicate simultaneous key creation requests
- Rate limiting is implemented with a 10-second backoff period

## 2. Credits Check API

### Endpoint
```
GET https://openrouter.ai/api/v1/auth/key
```

### Request Headers
```javascript
{
  'Authorization': `Bearer ${apiKey}`,  // The API key to check
  'Content-Type': 'application/json'
}
```

### Response Format
The raw response has varying structures, but is normalized to:
```typescript
{
  available: number,  // Available credits (limit - usage)
  usage: number,      // Current usage amount
  limit: number       // Total credit limit
}
```

### Error Handling
- 401 Unauthorized: The API key is invalid
- 429 Too Many Requests: Rate limited, need to implement backoff

### Implementation Notes
- The system warns when credits are running low (available < 0.2)
- Request deduplication is used to prevent multiple simultaneous credit checks
- Detailed error information is extracted from the response when available

## Usage Patterns

### Key Lifecycle
1. Check localStorage for existing valid key
2. If no valid key exists, create a new one via Edge Function
3. Store the key with timestamp in localStorage
4. Use the key for API requests to OpenRouter

### Managing Rate Limits
1. Track API request timestamps in localStorage
2. Implement backoff periods when rate limited (default: 10 seconds)
3. Clear backoff timers after successful requests

### Request Deduplication
Module-level Promise variables are used to track in-flight requests:
```javascript
let pendingKeyRequest: Promise<any> | null = null;
let pendingCreditsCheck: Promise<any> | null = null;
```

This ensures that multiple components requesting keys or checking credits will share the same network request, preventing unnecessary API calls and potential rate limiting.
