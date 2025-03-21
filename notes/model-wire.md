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
  \`\`\`json
  {
    "title": "The Martian",
    "author": "Andy Weir",
    "year": 2011,
    "genre": "Science Fiction",
    "rating": 5
  }
  \`\`\`
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