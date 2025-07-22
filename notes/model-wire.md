# Model Wire Protocol Differences

This document captures the differences in how various LLM models handle structured output via JSON schema when using the OpenRouter API.

## OpenAI (GPT-4o)

### JSON Schema Support

- **Fully supports** the JSON schema format
- Returns clean, valid JSON without any explanatory text
- Properly respects the schema structure including required fields and types
- Example response content:
  ```json
  {
    "title": "Where the Crawdads Sing",
    "author": "Delia Owens",
    "year": 2018,
    "genre": "Mystery, Coming-of-age",
    "rating": 4.8
  }
  ```

### Streaming

- Streams the output token by token
- Each chunk contains a small part of the JSON string
- First chunk initializes the structure `{"`, then builds the JSON incrementally
- Chunks build syntactically valid JSON fragments
- Example of chunked response (initial chunks):
  ```
  {"
  title
  ":"
  The
   Night
   Circus
  ```

## Claude (Claude 3 Sonnet)

### JSON Schema Support

- **Partial support** for the JSON schema format
- When using the `json_schema` parameter, Claude often adds explanatory text
- Example response with schema:

  ```
  Sure, here's a short book recommendation in the requested format:

  Title: The Alchemist
  Author: Paulo Coelho
  Genre: Fiction, Allegorical novel
  Description: "The Alchemist" by Paulo Coelho is a beautiful and inspiring story...
  ```

- The response doesn't follow the JSON schema format and includes extra information.

### System Message Approach

- **Works well** with the system message approach
- Returns clean, valid JSON when instructed via the system message
- Example system message response:
  ```json
  {
    "title": "The Little Prince",
    "author": "Antoine de Saint-Exupéry",
    "year": 1943,
    "genre": "Novella",
    "rating": 5
  }
  ```

## Gemini (Gemini 2.0 Flash)

### JSON Schema Support

- **Fully supports** the JSON schema format
- Returns clean, valid JSON without any explanatory text
- Properly follows the schema constraints for fields and types
- Example response:
  ```json
  {
    "author": "Ursula K. Le Guin",
    "genre": "Science Fiction",
    "rating": 4.5,
    "title": "The Left Hand of Darkness",
    "year": 1969
  }
  ```

### System Message Approach

- **Works well** but adds code fences around the JSON
- Returns code-fenced JSON when instructed via system message:

  ````
  ```json
  {
    "title": "The Martian",
    "author": "Andy Weir",
    "year": 2011,
    "genre": "Science Fiction",
    "rating": 5
  }
  ````

  ```

  ```

## Llama3 (Meta Llama 3.3 70B Instruct)

### JSON Schema Support

- **Does not properly support** the JSON schema format
- Returns markdown-formatted text descriptions instead of JSON
- Ignores the JSON schema structure and provides detailed text explanations
- Example response:
  ```
  **Title:** "The Hitchhiker's Guide to the Galaxy"
  **Author:** Douglas Adams
  **Genre:** Science Fiction, Comedy
  **Description:** An comedic adventure through space following the misadventures of an unwitting human and his alien friend after Earth's destruction.
  **Why Read:** Unique blend of humor and science fiction, with witty observations on human society and the universe.
  ```

### System Message Approach

- **Works well** with the system message approach
- Returns clean, valid JSON when instructed via system message
- Example system message response:
  ```json
  {
    "title": "The Alchemist",
    "author": "Paulo Coelho",
    "year": 1988,
    "genre": "Fantasy",
    "rating": 4
  }
  ```

## DeepSeek (DeepSeek Chat)

### JSON Schema Support

- **Does not properly support** the JSON schema format
- Similar to Llama3, returns markdown-formatted text descriptions
- Ignores the JSON schema structure and provides text explanations
- Example response:
  ```
  **Title:** *The Alchemist*
  **Author:** Paulo Coelho
  **Genre:** Fiction, Inspirational
  **Why I Recommend It:** A timeless tale of self-discovery and pursuing one's dreams, *The Alchemist* is both simple and profound. Its allegorical style and universal themes make it a quick yet impactful read, perfect for anyone seeking motivation or a fresh perspective on life.
  ```

### System Message Approach

- **Works well** with the system message approach
- Returns clean, valid JSON when instructed via system message
- Example system message response:
  ```json
  {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "year": 1925,
    "genre": "Tragedy",
    "rating": 4.5
  }
  ```

## GPT-4 Turbo (OpenAI GPT-4 Turbo)

### JSON Schema Support

- **Does not support** the JSON schema format
- Returns an error when response_format.json_schema is used:
  ```
  "error": { "message": "Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model" }
  ```

### System Message Approach

- **Works very well** with the system message approach
- Returns clean, properly formatted JSON when instructed via system message
- Example system message response:
  ```json
  {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "year": 1925,
    "genre": "Novel",
    "rating": 4.5
  }
  ```

## Recommendations

1. **For OpenAI GPT-4o and Gemini models**:
   - Use the JSON schema format as designed
   - Streaming works well token by token with GPT-4o

2. **For Claude, Llama3, DeepSeek, and GPT-4 Turbo models**:
   - Prefer using the system message approach
   - Include explicit instruction to return only JSON

3. **Model-specific handling**:
   - OpenAI GPT-4o: JSON schema format works well
   - Claude: System message approach is more reliable
   - Gemini: Either approach works, but may need to strip code fences
   - Llama3: Only use system message approach
   - DeepSeek: Only use system message approach
   - GPT-4 Turbo: Only use system message approach (json_schema not supported)

## Library Implementation

Our library should:

1. Detect the model type from the model string
2. For Claude, Llama3, DeepSeek, and GPT-4 Turbo: Add fallback to system message approach when schema is requested
3. Handle response post-processing based on model type:
   - OpenAI GPT-4o: Direct JSON parsing
   - Claude: Extract JSON from text or unwrap formatting
   - Gemini: Remove code fences if system message approach is used
   - Llama3: Extract JSON from text or unwrap formatting
   - DeepSeek: Extract JSON from text or unwrap formatting
   - GPT-4 Turbo: Direct JSON parsing

## Implementation Details for Fixing Integration Tests

### Current Failures

We have tests failing for the following reasons:

1. Llama3, DeepSeek and GPT-4 Turbo models return markdown-formatted text or errors when using JSON schema format
2. Our implementation doesn't automatically use system message approach for these models

### Code Changes Needed

1. **Update the `prepareRequestParams` function to detect more model types**:

```typescript
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions = {},
): { endpoint: string; requestOptions: RequestInit } {
  // ... existing code ...

  // Detect model type
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
  const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
  const isGPT4TurboModel = options.model ? /gpt-4-turbo/i.test(options.model) : false;

  // Models that should use system message approach for structured output
  const useSystemMessageApproach = isClaudeModel || isLlama3Model || isDeepSeekModel || isGPT4TurboModel;

  // Prepare messages
  let messages: Message[] = [];

  if (Array.isArray(prompt)) {
    messages = prompt;
  } else {
    // Create a single message
    messages = [{ role: "user", content: prompt as string }];
  }

  // Handle schema for different models
  if (options.schema) {
    if (useSystemMessageApproach || options.forceSystemMessage) {
      // Use system message approach for models that need it
      const schemaProperties = Object.entries(options.schema.properties || {})
        .map(([key, value]) => {
          const type = (value as any).type || "string";
          return `  "${key}": ${type}`;
        })
        .join(",\n");

      const systemMessage: Message = {
        role: "system",
        content: `Please return your response as JSON following this schema exactly:\n{\n${schemaProperties}\n}\nDo not include any explanation or text outside of the JSON object.`,
      };

      // Add system message at the beginning if none exists
      if (!messages.some((m) => m.role === "system")) {
        messages = [systemMessage, ...messages];
      }
    } else {
      // For OpenAI GPT-4o and Gemini, use the schema format
      requestParams.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.schema.name || "response",
          schema: {
            type: "object",
            properties: options.schema.properties || {},
            required: options.schema.required || Object.keys(options.schema.properties || {}),
            additionalProperties: options.schema.additionalProperties !== undefined ? options.schema.additionalProperties : false,
          },
        },
      };
    }
  }

  // ... rest of the function ...
}
```

2. **Update response handling to detect and process model-specific formats**:

````typescript
async function processResponseContent(content: string, options: CallAIOptions = {}): Promise<string> {
  // Detect model type
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
  const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;

  // For models that might return formatted text instead of JSON
  const needsJsonExtraction = isClaudeModel || isGeminiModel || isLlama3Model || isDeepSeekModel;

  if (needsJsonExtraction && options.schema) {
    // Try to extract JSON from content if it might be wrapped
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/) ||
      content.match(/\{[\s\S]*\}/) || [null, content];

    return jsonMatch[1] || content;
  }

  return content;
}
````
