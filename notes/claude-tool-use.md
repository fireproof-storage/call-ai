# Using Claude's Tool Use for Structured JSON Output

## Overview

This document explores the approach of using Claude's Tool Use functionality (also known as "function calling") for enforcing structured JSON responses. We've implemented this as the default method for Claude models in the call-ai library, replacing the previous system message approach.

## Evolution of Schema Enforcement Approaches for Claude

The library has gone through several approaches for getting structured output from Claude:

1. **System Message Approach** (previous default): Adding a system message instructing Claude to return JSON in a specific format.
   - Works reliably in practice
   - Simple implementation
   - Now replaced by tool mode

2. **JSON Schema Approach** (attempted): Using `response_format.json_schema`, similar to OpenAI's implementation.
   - Showed inconsistent behavior with Claude
   - Required special handling of required fields
   - Produced errors like: `Invalid schema for response_format 'person': In context=(), 'required' is required to be supplied and to be an array including every key in properties.`

3. **Tool Use Approach** (current default): Using Claude's tool use functionality for schema enforcement.
   - Now the automatic default for all Claude models when schema is provided
   - More "native" to Claude's capabilities
   - May have performance or compatibility considerations with some API providers

## How Tool Mode Works with Claude

The implementation now automatically uses tool mode whenever a Claude model is detected with a schema:

1. When a request is made to a Claude model with a schema, we:
   - Create a tool definition with the schema as its input_schema
   - Force Claude to use this tool via tool_choice
   - Extract the structured data from the tool_use response

2. The implementation handles both streaming and non-streaming responses:
   - For non-streaming, extracts data from the tool_use content block
   - For streaming, provides a warning that streaming with tools may be unreliable

## Implementation Details

The key change is in model detection and routing:

```typescript
// Detect model types
const isClaudeModel = options.model ? /claude/i.test(options.model) : false;

// Use tool mode for Claude when schema is provided
const useToolMode = isClaudeModel && options.schema;

// Models that should use system message approach for structured output
const useSystemMessageApproach = isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
```

With this change, Claude models automatically use tool mode when a schema is provided, OpenAI models use the JSON Schema approach, and other models use the system message approach.

## Model Switching Simplification

The current model switching could be simplified in several ways:

1. **Simplify Model Detection**: Replace multiple boolean flags with a single model category:

   ```typescript
   // Current approach with multiple flags
   const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
   const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
   const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
   // etc.

   // Simplified approach
   const modelCategory = getModelCategory(options.model);
   // Returns: 'claude', 'openai', 'gemini', 'llama', 'other', etc.
   ```

2. **Schema Strategy Map**: Define schema strategies by model category:

   ```typescript
   const schemaStrategies = {
     claude: "tool", // Uses tool mode
     openai: "json_schema", // Uses response_format.json_schema
     gemini: "system_message", // Uses system message approach
     llama: "system_message",
     default: "system_message",
   };

   const strategy = schemaStrategies[modelCategory] || schemaStrategies.default;
   ```

3. **Strategy Pattern**: Implement a strategy pattern for different schema approaches:

   ```typescript
   const schemaHandlers = {
     tool: applyToolMode,
     json_schema: applyJsonSchema,
     system_message: applySystemMessage,
   };

   // Then use the appropriate handler
   const handler = schemaHandlers[strategy];
   handler(requestParams, schema, messages);
   ```

This approach would make the codebase more maintainable and easier to extend with new models or schema strategies.

## Conclusion

Tool mode is now the default schema enforcement approach for Claude models in the call-ai library. This provides a more "native" way for Claude to generate structured outputs, though there may be considerations around API provider compatibility and performance.

The model detection and routing logic could be simplified with a more structured approach to categorizing models and their schema strategies, potentially making the codebase more maintainable.

## References

- [Anthropic Documentation: Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)
- [JSON Output with Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview#json-output)
- [JSON Schema Specification](https://json-schema.org/)
