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
  
  if (modelFamily === 'openai') {
    return {
      strategy: 'json_schema',
      schema: formatOpenAISchema(schema),
      response_format: { type: 'json_object' }
    };
  }
  
  if (modelFamily === 'gemini') {
    return {
      strategy: 'json_schema',
      schema: formatOpenAISchema(schema) // Same format works for Gemini
    };
  }
  
  if (modelFamily === 'anthropic') {
    return {
      strategy: 'tool_mode',
      tools: [formatClaudeToolSchema(schema)],
      stream: true // Force streaming for Claude
    };
  }
  
  // Default fallback for all other models
  return {
    strategy: 'system_message',
    systemPrompt: formatSchemaAsSystemPrompt(schema)
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