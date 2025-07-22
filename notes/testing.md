# Testing Approach for call-ai

This document outlines the approach for testing the `call-ai` library, particularly focusing on integration tests with AI models.

## Debugging Integration Tests

### 1. Isolate Individual Failures

When faced with multiple test failures, narrow down to a single failing test case:

```bash
# Run a specific test by name
npx jest test/callai.integration.test.ts -t "should handle streaming with gpt4turbo model" --verbose
```

Benefits:

- Faster feedback loop
- Clearer error messages
- Easier to analyze one problem at a time

### 2. Add Strategic Debug Logging

When a test fails, add targeted debug logging to understand what's happening:

```javascript
// Log request parameters
console.log(`[DEBUG] Full request parameters:`, JSON.stringify(requestParams, null, 2));

// Log response data
console.log(`[DEBUG] Response status:`, response.status);
console.log(`[DEBUG] Response headers:`, Object.fromEntries([...response.headers.entries()]));

// For streaming responses, log each chunk
console.log(`[DEBUG] Raw chunk #${rawChunkCount}:`, chunk.substring(0, 100) + (chunk.length > 100 ? "..." : ""));
```

Look for:

- What exact request are we sending?
- What exact response are we receiving?
- For streaming, what are the individual chunks?

### 3. Test Multiple Times

AI models can have inconsistent responses. Run the same test multiple times to identify patterns:

```bash
# Run the same test 3 times in a row
for i in {1..3}; do npx jest test/callai.integration.test.ts -t "should handle streaming with gpt4turbo model"; done
```

This helps distinguish between:

- Genuine code issues
- Transient API issues
- Model inconsistency in responses

### 4. Address Root Causes

Based on our debugging, we identified several types of root causes:

1. **Schema Compatibility Issues**: Different AI models interpret schema validation differently.
   - Solution: Implement recursive schema validation that handles nested objects properly.

2. **Field Name Inconsistency**: Models sometimes use variations of field names (e.g., `high_temp` vs `high`).
   - Solution: Either make tests flexible enough to handle variations or make schema validation stricter.

3. **API Streaming Limitations**: Some models don't support schema validation with streaming properly.
   - Solution: Add appropriate error handling or fall back to non-streaming for those models.

## Testing Best Practices

### Balance Strictness and Flexibility

- **Tests should be strict** to catch real issues
- **But not so strict** that they fail due to acceptable variations in AI responses
- Consider allowing for field name flexibility in a controlled way

### Handle Non-Determinism

AI model responses are inherently non-deterministic, which can lead to flaky tests:

1. Use explicit retry logic for tests interacting with external AI APIs
2. Or use seed values/fixed prompts that are more likely to produce consistent results
3. Consider writing tests that validate the structure rather than the exact content

### Comprehensive Test Coverage

Ensure tests cover:

- Different models (OpenAI, Claude, Gemini, etc.)
- Different modes (streaming vs. non-streaming)
- Various schema complexities (simple, nested, arrays)
- Error handling scenarios

## Test Automation

Consider implementing:

- Nightly full test runs against actual APIs
- Limited test suites for PR validation
- Mocked responses for unit tests to avoid API costs

By following these practices, we can maintain a reliable test suite despite the inherent variability of AI model responses.
