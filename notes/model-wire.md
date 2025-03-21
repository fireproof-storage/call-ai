# Model Wire Protocol Differences

This document captures the differences in how various LLM models handle structured output via JSON schema when using the OpenRouter API.

## OpenAI (GPT-4o)

### JSON Schema Support
- **Fully supports** the JSON schema format 
- Returns clean, valid JSON without any explanatory text
- Properly respects the schema structure including required fields and types
- Example response content:
  ```json
  {"title":"Where the Crawdads Sing","author":"Delia Owens","year":2018,"genre":"Mystery, Coming-of-age","rating":4.8}
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
  ```
  ```json
  {
    "title": "The Martian",
    "author": "Andy Weir",
    "year": 2011,
    "genre": "Science Fiction",
    "rating": 5
  }
  ```
  ```

## Recommendations

1. **For OpenAI models**:
   - Use the JSON schema format as designed
   - Streaming works well token by token

2. **For Claude models**:
   - Prefer using the system message approach
   - Include explicit instruction to return only JSON
   - Consider post-processing to extract JSON if using schema approach

3. **For Gemini models**:
   - Prefer using the JSON schema format
   - Apply post-processing to handle code fences if using system message approach

## Library Implementation

Our library should:
1. Detect the model type from the model string
2. For Claude: Add fallback to system message approach when schema is requested
3. Handle response post-processing based on model type:
   - OpenAI: Direct JSON parsing
   - Claude: Extract JSON from text or unwrap formatting
   - Gemini: Remove code fences if system message approach is used

## Implementation Details for Fixing Integration Tests

### Current Failures
We have two integration test failures:
1. **OpenAI Book Recommendation Schema Test**
2. **OpenAI Streaming Test**

### Code Changes Needed

1. **Fix the `prepareRequestParams` function to correctly handle schema for different models**:

```typescript
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions = {}
): { endpoint: string, requestOptions: RequestInit } {
  // ... existing code ...
  
  // Detect model type
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isOpenAIModel = !isClaudeModel && !isGeminiModel;
  
  // Prepare messages
  let messages: Message[] = []; 
  
  if (Array.isArray(prompt)) {
    messages = prompt;
  } else {
    // Create a single message
    messages = [{ role: 'user', content: prompt as string }];
  }
  
  // Handle schema for different models
  if (options.schema) {
    if (isClaudeModel) {
      // Use system message approach for Claude models
      const schemaProperties = Object.entries(options.schema.properties || {})
        .map(([key, value]) => {
          const type = (value as any).type || 'string';
          return `  "${key}": ${type}`;
        })
        .join(',\n');
      
      const systemMessage: Message = {
        role: 'system',
        content: `Please return your response as JSON following this schema exactly:\n{\n${schemaProperties}\n}\nDo not include any explanation or text outside of the JSON object.`
      };
      
      // Add system message at the beginning if none exists
      if (!messages.some(m => m.role === 'system')) {
        messages = [systemMessage, ...messages];
      }
    } else {
      // For OpenAI and Gemini, use the schema format
      requestParams.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.schema.name || 'response',
          schema: {
            type: 'object',
            properties: options.schema.properties || {},
            required: options.schema.required || Object.keys(options.schema.properties || {}),
            additionalProperties: options.schema.additionalProperties !== undefined 
              ? options.schema.additionalProperties 
              : false,
          }
        }
      };
    }
  }
  
  // ... rest of the function ...
}
```

2. **Fix the streaming handling in `callAIStreaming`**:

```typescript
async function* callAIStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {}
): AsyncGenerator<string, string, unknown> {
  try {
    const { endpoint, requestOptions } = prepareRequestParams(prompt, { ...options, stream: true });
    
    const response = await fetch(endpoint, requestOptions);
    
    // Handle streaming response
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) continue;
          
          try {
            // Handle OPENROUTER PROCESSING lines
            if (line.includes('OPENROUTER PROCESSING')) continue;
            
            const jsonLine = line.replace('data: ', '');
            if (!jsonLine.trim()) continue;
            
            const json = JSON.parse(jsonLine);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              text += content;
              yield text;
            }
          } catch (e) {
            console.error("Error parsing chunk:", e);
          }
        }
      }
    }
    return text;
  } catch (error) {
    console.error("AI call failed:", error);
    return JSON.stringify({ 
      error, 
      message: "Sorry, I couldn't process that request." 
    });
  }
}
```

3. **Improve JSON response handling in `callAINonStreaming`**:

```typescript
async function callAINonStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {}
): Promise<string> {
  try {
    const { endpoint, requestOptions } = prepareRequestParams(prompt, options);
    
    const response = await fetch(endpoint, requestOptions);
    const responseBody = await response.json();
    
    if (!responseBody.choices || !responseBody.choices.length) {
      throw new Error('Invalid response format from API');
    }
    
    const content = responseBody.choices[0].message.content;
    
    // Post-process content based on model type
    const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
    const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
    
    if (isClaudeModel || isGeminiModel) {
      // Try to extract JSON from content if it might be wrapped
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/```\s*([\s\S]*?)\s*```/) || 
                       [null, content];
      
      return jsonMatch[1] || content;
    }
    
    return content;
  } catch (error) {
    console.error("AI call failed:", error);
    return JSON.stringify({ 
      error, 
      message: "Sorry, I couldn't process that request." 
    });
  }
} 