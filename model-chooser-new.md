# Model Chooser Logic for Robust JSON Handling

Based on our testing, here's the strategy for reliable structured JSON output across different models:

## Strategy by Model Type

1. **OpenAI Models (GPT-4, GPT-3.5, etc.)**
   - Use native JSON schema support
   - Set `response_format` with `type: "json_object"` when available

2. **Google Gemini Models**
   - Use native JSON schema support
   - Format schema in OpenAI-compatible format

3. **Anthropic Claude Models**
   - Use tool mode approach (functions)
   - Force streaming mode for more reliable responses
   - Format schema as tool input_schema

4. **All Other Models (Llama, DeepSeek, etc.)**
   - Use system message approach
   - Include schema definition in the system prompt
   - Request strict JSON-only responses

## Implementation Pseudocode

```js
function chooseSchemaStrategy(model, schema) {
  // Extract model family from the full model name
  const modelFamily = getModelFamily(model);

  if (modelFamily === "openai") {
    return {
      strategy: "json_schema",
      schema: formatOpenAISchema(schema),
      response_format: { type: "json_object" },
    };
  }

  if (modelFamily === "gemini") {
    return {
      strategy: "json_schema",
      schema: formatOpenAISchema(schema), // Same format works for Gemini
    };
  }

  if (modelFamily === "anthropic") {
    return {
      strategy: "tool_mode",
      tools: [formatClaudeToolSchema(schema)],
      stream: true, // Force streaming for Claude
    };
  }

  // Default fallback for all other models
  return {
    strategy: "system_message",
    systemPrompt: formatSchemaAsSystemPrompt(schema),
  };
}
// end Pseudocode
```

## Benefits of This Approach

- **Maximum Compatibility**: Works across all major AI providers
- **Optimal Performance**: Uses each model's native strengths
- **Fallback Strategy**: System message approach works for any model
- **Future-Proof**: Easy to extend for new models by categorizing them into the appropriate family

## Implementation Notes

- For Claude models, tool mode produces more reliable structured output than using JSON schema or system messages
- Streaming must be enabled for Claude when using tool mode
- The system message approach works universally but may be less reliable than native schema support
- When adding new model support, categorize by provider first to inherit the optimal strategy

## Refactoring the Current Implementation

The current implementation in `index.ts` uses multiple conditional checks and flags to determine the schema strategy. This can be refactored to use the strategy pattern outlined above.

### Simplifying Model Detection

Current approach:

```typescript
// Multiple individual model detection flags
const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
const isGPT4TurboModel = options.model ? /gpt-4-turbo/i.test(options.model) : false;
const isGPT4oModel = options.model ? /gpt-4o/i.test(options.model) : false;
const isOpenAIModel = options.model ? /openai|gpt/i.test(options.model) : false;

// Derived strategy flags
const useToolMode = isClaudeModel && !!options.schema;
const useSystemMessageApproach = isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
const useJsonSchemaApproach = (isOpenAIModel || isGeminiModel) && options.schema;
```

Refactored approach:

```typescript
const schemaStrategy = chooseSchemaStrategy(options.model, options.schema);
// Use schemaStrategy.strategy to determine the approach
```

### Code That Would Be Simplified/Consolidated

1. **Model Detection Logic**: The individual model detection flags will be replaced with a single function.

2. **Strategy Selection Logic**: The complex if-else chains would be replaced with strategy-based handling:

   ```typescript
   // Before refactor
   if (useToolMode && schema) {
     // Process schema for tool use...
   } else if (schema && useSystemMessageApproach) {
     // Add system message...
   } else if (schema && useJsonSchemaApproach) {
     // Process schema for JSON schema...
   }
   ```

3. **Response Processing Logic**: Currently duplicated in both streaming and non-streaming functions:

   ```typescript
   // This duplicated logic would be consolidated
   // From processResponseContent:
   const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
   const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
   const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
   const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;

   if (needsJsonExtraction) { ... }
   ```

4. **Forced Streaming for Claude**: With the refactored approach, forced streaming for Claude with tools would be handled transparently:

   ```typescript
   // Current complex logic:
   if (isClaudeModel && options.schema && !options.stream) {
     // Force streaming for better reliability
     options.stream = true;
   }

   // Would be replaced with simpler strategy-based approach that HIDES implementation details
   if (schemaStrategy.strategy === "tool_mode" && schemaStrategy.stream && !options.stream) {
     // Internally use streaming but buffer results for the caller
     const originalStream = options.stream;
     options.stream = true; // Force streaming internally

     // If caller requested non-streaming, we need to buffer and return complete result
     if (!originalStream) {
       return bufferStreamingToSingleResponse(callAIInternal(prompt, options));
     }
   }
   ```

   This approach ensures that even when callers specify `stream: false` with Claude, we can:
   1. Internally use streaming mode for better reliability with tool use
   2. Buffer all streaming chunks internally
   3. Return only the final complete response to the caller
   4. Keep the forced streaming implementation detail hidden from API users

5. **Duplicate Tool Extraction Logic**: Currently repeated in both streaming and non-streaming functions:

   ```typescript
   // Logic like this appears in both callAINonStreaming and callAIStreaming
   if (useToolMode && result.stop_reason === "tool_use") {
     // Extract the tool use content...
   }
   ```

### Proposed Structure

The refactored code would follow this structure:

1. Define strategy selector
2. Implement each strategy as a separate function
3. Use the strategy to prepare request parameters
4. Use the same strategy to process responses

This approach would make the code more modular, easier to test, and simpler to extend with new models in the future.

## Core Values: Hiding Complexity from Callers

The fundamental purpose of `callAi` is to provide a simple, consistent interface that shields users from the underlying complexity of different AI models and their unique implementation requirements.

Key principles:

- **Simple API, Complex Implementation**: Users should have a straightforward experience while the library handles the intricate details.
- **Respecting User Options**: When a user specifies options like `stream: false`, the API contract should be honored even if implementation details (like using streaming internally) differ.
- **Consistent Results**: The same JSON schema should produce well-structured results across all supported models without requiring model-specific code from users.
- **Intelligent Defaults**: The library should automatically select the best approach for each model while allowing overrides when needed.

By refactoring to use the strategy pattern and properly abstracting the model-specific details, `callAi` can maintain its promise of simplicity while supporting an increasingly diverse ecosystem of AI models and their unique capabilities.
