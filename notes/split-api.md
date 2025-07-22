# API Refactoring Challenges

## Background

We're working on refactoring `src/api.ts` by splitting it into multiple modules for better maintainability. The goal is to have a pure mechanical refactor with zero behavioral changes. We want the unit tests to pass with both implementations to validate equivalence.

## Current Challenges

The refactoring got stuck on two main issues:

1. **No-await pattern compatibility**: The original implementation in `src/api.ts` supported a dual-interface pattern where `callAi()` could be used without awaiting it, and the result would directly provide AsyncGenerator methods (`next`, `throw`, `return`). The tests that rely on this pattern are failing with our refactored implementation in `src/api-core.ts`.

   ```typescript
   // This pattern works in the original implementation but fails in our refactored version
   const generator = callAi(prompt, options) as unknown as AsyncGenerator<string, string, unknown>;
   await generator.next(); // Fails with "generator.next is not a function"
   ```

2. **Network error propagation**: The original implementation correctly propagates network errors from the fetch call through the Promise chain in streaming mode. Our refactored implementation isn't correctly propagating these errors, causing the following test to fail:

   ```typescript
   // This test passes with the original implementation but fails with our refactored version
   it("should handle errors during API call for streaming", async () => {
     (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

     try {
       const options = { apiKey: "test-api-key", stream: true };
       await callAi("Hello", options);
       fail("Expected an error to be thrown");
     } catch (error) {
       expect((error as Error).message).toContain("Network error");
     }
   });
   ```

## Implementation Details to Match

To fix these issues, we need to ensure that `api-core.ts` precisely mimics how `api.ts` handles:

1. **Dual interface objects**: The original implementation creates objects that act as both Promises and AsyncGenerators by using a special proxy pattern.

2. **Error propagation**: The original implementation uses a specific Promise chain structure to ensure network errors are properly caught and propagated.

3. **Method exposure**: AsyncGenerator methods must be directly accessible on the returned object to support the no-await pattern used in the tests.

Note that this maintains the same approach established in the v0.7.0 refactoring, which explicitly focused on supporting both await and no-await patterns while enhancing error handling.

## Next Steps

1. Study the exact implementation of the streaming proxy pattern in `api.ts`
2. Ensure our refactored version precisely matches this behavior
3. Validate both with unit tests to ensure no behavioral changes

The goal is to split the codebase while maintaining 100% backward compatibility with existing code.
