# Model Selection and Logic Branching

This document describes how call-ai selects and handles different AI models and the branching logic used for each model type.

## Model Selection Logic

- **User-specified Model**: If the user provides `options.model`, that exact model is always used
- **Default Model** (when no model specified):
  - With schema: `openai/gpt-4o` is used
  - Without schema: `openrouter/auto` (OpenRouter's auto-routing)

- **API Key**: Required via `options.apiKey` or global `window.CALLAI_API_KEY`

- **Endpoint**: Defaults to OpenRouter API at `https://openrouter.ai/api/v1/chat/completions`

## Model Detection Logic

Model types are detected using regex patterns:

```javascript
const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
const isGPT4TurboModel = options.model ? /gpt-4-turbo/i.test(options.model) : false;
const isGPT4oModel = options.model ? /gpt-4o/i.test(options.model) : false;
const isOpenAIModel = options.model ? /openai|gpt/i.test(options.model) : false;
```

## Branching Logic for Schema Handling

The library uses three main approaches for handling schemas with different models:

### 1. Tool Mode (For Claude Models)

```javascript
const useToolMode = isClaudeModel && !!options.schema;
```

When using Claude with a schema, the library uses Claude's tool use capability:

- Converts schema to a tool definition with function type
- Sets `tool_choice` to force Claude to use the tool
- Schema properties are converted to a proper JSON schema format
- All properties are set as required for Claude's tool mode

### 2. System Message Approach

```javascript
const useSystemMessageApproach = isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
```

For models that don't fully support JSON schema:

- Used for Llama 3, DeepSeek, and GPT-4 Turbo
- Injects schema into a system message as instructions
- Formats schema as text with property types and descriptions
- Adds this system message to the beginning of the messages array

### 3. JSON Schema Approach

```javascript
const useJsonSchemaApproach = (isOpenAIModel || isGeminiModel) && options.schema;
```

For models with native schema support (OpenAI/GPT and Gemini):

- Uses OpenAI's `response_format` with `json_schema` type
- Processes schema for compatibility
- Recursively adds `additionalProperties: false` to all nested objects
- Ensures all required fields are properly specified
- Sets model-specific required fields behavior (Claude needs all properties in required array)

## Response Processing Logic

The library handles responses differently based on model type and whether streaming is enabled:

### Non-streaming Mode

- For Claude with tool use: extracts JSON from tool use blocks
- For all models with schema: processes content based on model type and extracts JSON
- Applies special handling for models that might wrap JSON in markdown code blocks

### Streaming Mode

- Assembles partial responses incrementally
- Handles model-specific streaming formats
- For Claude with tool use in streaming: shows warning that it may not work optimally
- Processes each chunk to ensure properly formatted JSON responses

## Model-specific JSON Extraction

```javascript
const needsJsonExtraction = isClaudeModel || isGeminiModel || isLlama3Model || isDeepSeekModel;
```

For models that might return formatted text instead of direct JSON:

- Extracts JSON from markdown code blocks
- Handles various wrapper formats (`json, `, or raw JSON objects)
- Returns the extracted JSON or falls back to the original content

## Schema Processing

The library recursively processes schemas to ensure all nested objects have appropriate properties:

- Sets `additionalProperties: false` by default
- Ensures all nested objects have required fields properly defined
- Handles arrays of objects by processing their item schemas
- Maintains compatibility with different model requirements
