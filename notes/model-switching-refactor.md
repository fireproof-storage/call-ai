# Model Switching Logic Refactoring Proposal

## Current Implementation

The current model switching implementation uses a series of boolean flags to detect model types and determine which schema strategy to use. This approach works but has several limitations in terms of code maintainability and extensibility:

```typescript
// Current model detection pattern
const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
const isGPT4TurboModel = options.model ? /gpt-4-turbo/i.test(options.model) : false;
const isGPT4oModel = options.model ? /gpt-4o/i.test(options.model) : false;

// Current strategy selection pattern
const useToolMode = isClaudeModel && options.schema;
const useSystemMessageApproach = isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
```

## Proposed Refactoring

### 1. Unified Model Categorization

Replace the boolean flags with a single function that categorizes models:

```typescript
/**
 * Determine the model family from a model string
 */
function getModelFamily(modelString: string | undefined): "claude" | "openai" | "gemini" | "llama" | "deepseek" | "unknown" {
  if (!modelString) return "unknown";

  // Lowercase for case-insensitive comparison
  const model = modelString.toLowerCase();

  if (model.includes("claude")) return "claude";
  if (model.includes("gpt") || model.includes("openai")) return "openai";
  if (model.includes("gemini")) return "gemini";
  if (model.includes("llama")) return "llama";
  if (model.includes("deepseek")) return "deepseek";

  return "unknown";
}
```

### 2. Schema Strategy Map

Define a mapping of model families to schema strategies:

```typescript
/**
 * Schema strategy types supported by the library
 */
type SchemaStrategy = "tool" | "json_schema" | "system_message";

/**
 * Maps model families to their preferred schema strategies
 */
const modelSchemaStrategies: Record<string, SchemaStrategy> = {
  claude: "tool", // Claude uses tool mode
  openai: "json_schema", // OpenAI uses response_format.json_schema
  gemini: "system_message", // Gemini uses system message
  llama: "system_message", // Llama uses system message
  deepseek: "system_message", // Deepseek uses system message
  unknown: "system_message", // Default to system message for unknown models
};

// Get the appropriate strategy for a model
const modelFamily = getModelFamily(options.model);
const schemaStrategy = options.forceJsonSchema ? "json_schema" : modelSchemaStrategies[modelFamily];
```

### 3. Strategy Pattern Implementation

Extract the schema application logic into separate functions for each strategy:

```typescript
/**
 * Apply tool mode schema strategy to request parameters
 */
function applyToolModeStrategy(requestParams: any, schema: Schema, messages: Message[]): void {
  console.log(`[DEBUG] Using tool mode for ${requestParams.model}`);

  // Process schema for tool use
  const processedSchema = {
    type: "object",
    properties: schema.properties || {},
    required: Object.keys(schema.properties || {}),
    additionalProperties: schema.additionalProperties !== undefined ? schema.additionalProperties : false,
  };

  // Add tools parameter
  requestParams.tools = [
    {
      name: schema.name || "generate_structured_data",
      description: "Generate data according to the required schema",
      input_schema: processedSchema,
    },
  ];

  // Force use of the tool
  requestParams.tool_choice = {
    type: "tool",
    name: schema.name || "generate_structured_data",
  };
}

/**
 * Apply JSON schema strategy to request parameters
 */
function applyJsonSchemaStrategy(requestParams: any, schema: Schema, messages: Message[], modelFamily: string): void {
  console.log(`[DEBUG] Using json_schema approach for ${requestParams.model}`);

  // For Claude, ensure all fields are included in 'required'
  let requiredFields = schema.required || [];
  if (modelFamily === "claude") {
    requiredFields = Object.keys(schema.properties || {});
  } else {
    requiredFields = schema.required || Object.keys(schema.properties || {});
  }

  const processedSchema = recursivelyAddAdditionalProperties({
    type: "object",
    properties: schema.properties || {},
    required: requiredFields,
    additionalProperties: schema.additionalProperties !== undefined ? schema.additionalProperties : false,
    ...Object.fromEntries(
      Object.entries(schema).filter(([key]) => !["name", "properties", "required", "additionalProperties"].includes(key)),
    ),
  });

  requestParams.response_format = {
    type: "json_schema",
    json_schema: {
      name: schema.name || "result",
      strict: true,
      schema: processedSchema,
    },
  };
}

/**
 * Apply system message strategy to request parameters
 */
function applySystemMessageStrategy(requestParams: any, schema: Schema, messages: Message[]): void {
  console.log(`[DEBUG] Using system message approach for ${requestParams.model}`);

  // Only add system message if one doesn't already exist
  const hasSystemMessage = messages.some((m) => m.role === "system");

  if (!hasSystemMessage) {
    // Build a schema description
    const schemaProperties = Object.entries(schema.properties || {})
      .map(([key, value]) => {
        const type = (value as any).type || "string";
        const description = (value as any).description ? ` // ${(value as any).description}` : "";
        return `  "${key}": ${type}${description}`;
      })
      .join(",\n");

    const systemMessage: Message = {
      role: "system",
      content: `Please return your response as JSON following this schema exactly:\n{\n${schemaProperties}\n}\nDo not include any explanation or text outside of the JSON object.`,
    };

    // Update messages and request params
    const updatedMessages = [systemMessage, ...messages];
    requestParams.messages = updatedMessages;
  }
}
```

### 4. Integrated Approach in prepareRequestParams

Putting it all together:

```typescript
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions,
): {
  apiKey: string;
  model: string;
  endpoint: string;
  requestOptions: RequestInit;
} {
  // ... existing code ...

  // Determine model family and schema strategy
  const modelFamily = getModelFamily(options.model);
  const schemaStrategy = options.forceJsonSchema ? "json_schema" : modelSchemaStrategies[modelFamily];

  // Handle both string prompts and message arrays
  let messages = Array.isArray(prompt) ? prompt : [{ role: "user", content: prompt }];

  // Build request parameters
  const requestParams: any = {
    model: model,
    stream: options.stream === true,
    messages: messages,
  };

  // Apply schema strategy if schema is provided
  if (schema) {
    switch (schemaStrategy) {
      case "tool":
        applyToolModeStrategy(requestParams, schema, messages);
        break;
      case "json_schema":
        applyJsonSchemaStrategy(requestParams, schema, messages, modelFamily);
        break;
      case "system_message":
      default:
        applySystemMessageStrategy(requestParams, schema, messages);
        break;
    }
  }

  // ... rest of existing code ...
}
```

## Benefits of the Proposed Approach

1. **Improved Maintainability**: The code becomes more modular with clear separation of concerns.

2. **Enhanced Extensibility**: Adding support for new models only requires updating the `getModelFamily` function and possibly the `modelSchemaStrategies` map.

3. **Better Readability**: The strategy selection logic is more explicit and easier to understand.

4. **Reduced Duplication**: Strategy-specific code is extracted into dedicated functions.

5. **Testability**: Each strategy function can be unit tested independently.

## Implementation Plan

1. **Create Utility Functions**: Implement `getModelFamily` and the schema strategy functions.

2. **Define Strategy Map**: Create the `modelSchemaStrategies` mapping.

3. **Refactor prepareRequestParams**: Update the function to use the new strategy pattern.

4. **Update Response Processing**: Ensure `processResponseContent` considers the strategy used.

5. **Update Tests**: Modify tests to cover the new approach and ensure backward compatibility.

## Conclusion

This refactoring would significantly improve the maintainability and extensibility of the model switching logic in the call-ai library. It provides a more structured approach to handling different models and schema strategies, making it easier to add support for new models in the future.

By implementing this refactoring, we'll reduce code complexity, improve readability, and make the library more robust against changes in model behavior or new model additions.
