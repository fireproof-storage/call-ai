# Decorated String API Goal

## Problem Statement

The `callAi` function returns either a string or a streaming response (AsyncGenerator), but we want to make the raw/internal API response object available to users without changing the API signature.

## Requirements

1. **Keep backwards compatibility**: The API should continue to return a `Promise<string | StreamResponse>` without any breaking changes
2. **Expose raw response**: Advanced users should be able to access the internal response data when needed
3. **Consistent behavior**: The solution must work the same way in all environments (tests, production, etc.)
4. **Non-obtrusive**: Regular users who only want the string response shouldn't have to deal with complexity
5. **Transparent**: The solution shouldn't require special handling by consumers

## Implementation Approach

Since we can successfully add properties to AsyncGenerator objects (they're proper objects), but can't reliably add properties to string primitives, we've decided to:

1. Decorate AsyncGenerator results with a non-enumerable `rawResponse` property
2. For string results, we don't modify the primitive (keeping tests working)
3. Document the approach for users who want to access the raw response

## Usage for Developers

```typescript
// Regular usage - returns a string as before
const result = await callAi("What's the weather?", { model: "gpt-4" });
console.log(result); // "The weather is sunny today."

// AsyncGenerator usage with rawResponse
const stream = await callAi("Count to 10", { stream: true });
// Now has a non-enumerable rawResponse property
console.log(stream.rawResponse); // Full response object with headers, etc.

// Consuming the stream works as before
for await (const chunk of stream) {
  console.log(chunk);
}
```

## Implementation Notes

We only attempt to attach the property on objects, not primitives. This means:

- AsyncGenerator results have the property
- String results don't have the property attached

This is a trade-off to maintain compatibility with existing code while still providing the feature where it's reliable.
