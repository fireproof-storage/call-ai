/**
 * call-ai: A lightweight library for making AI API calls
 */

export type Message = {
  role: 'user' | 'system' | 'assistant';
  content: string;
};

export interface Schema {
  /**
   * Optional schema name - will be sent to OpenRouter if provided
   * If not specified, defaults to "result"
   */
  name?: string;
  /**
   * Properties defining the structure of your schema
   */
  properties: Record<string, any>;
  /**
   * Fields that are required in the response (defaults to all properties)
   */
  required?: string[];
  /**
   * Whether to allow fields not defined in properties (defaults to false)
   */
  additionalProperties?: boolean;
  /**
   * Any additional schema properties to pass through
   */
  [key: string]: any;
}

export interface CallAIOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  stream?: boolean;
  schema?: Schema | null;
  [key: string]: any;
}

// Note: When using schema, we recommend using openai/gpt-4o which fully supports structured output
export interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

/**
 * Make an AI API call with the given options
 * @param prompt User prompt as string or an array of message objects
 * @param options Configuration options including optional schema for structured output
 * @returns A Promise that resolves to the complete response string when streaming is disabled,
 *          or an AsyncGenerator that yields partial responses when streaming is enabled
 */
export function callAI(
  prompt: string | Message[],
  options: CallAIOptions = {}
): Promise<string> | AsyncGenerator<string, string, unknown> {
  // Handle non-streaming mode (default)
  if (options.stream !== true) {
    return callAINonStreaming(prompt, options);
  }
  
  // Handle streaming mode
  return callAIStreaming(prompt, options);
}

/**
 * Prepare request parameters common to both streaming and non-streaming calls
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions
): { apiKey: string, model: string, endpoint: string, requestOptions: RequestInit } {
  const apiKey = options.apiKey || (typeof window !== 'undefined' ? (window as any).CALLAI_API_KEY : null);
  
  // Detect model types
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
  const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
  const isGPT4TurboModel = options.model ? /gpt-4-turbo/i.test(options.model) : false;
  const isGPT4oModel = options.model ? /gpt-4o/i.test(options.model) : false;
  
  // Models that should use system message approach for structured output
  const useSystemMessageApproach = isClaudeModel || isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
  
  // Default to appropriate model based on schema and model type
  const model = options.model || (options.schema ? (isClaudeModel ? 'anthropic/claude-3-sonnet' : 'openai/gpt-4o') : 'openrouter/auto');
  
  const endpoint = options.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  const schema = options.schema || null;
  
  if (!apiKey) {
    throw new Error('API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY');
  }
  
  // Handle both string prompts and message arrays for backward compatibility
  let messages = Array.isArray(prompt) 
    ? prompt 
    : [{ role: 'user', content: prompt }];
  
  // Build request parameters
  const requestParams: any = {
    model: model,
    stream: options.stream === true,
    messages: messages,
  };
  
  // For models that need schema as system message
  if (schema && (useSystemMessageApproach)) {
    // Prepend a system message with schema instructions
    const hasSystemMessage = messages.some(m => m.role === 'system');
    
    if (!hasSystemMessage) {
      // Build a schema description
      const schemaProperties = Object.entries(schema.properties || {})
        .map(([key, value]) => {
          const type = (value as any).type || 'string';
          const description = (value as any).description ? ` // ${(value as any).description}` : '';
          return `  "${key}": ${type}${description}`;
        })
        .join(',\n');
      
      const systemMessage: Message = {
        role: 'system',
        content: `Please return your response as JSON following this schema exactly:\n{\n${schemaProperties}\n}\nDo not include any explanation or text outside of the JSON object.`
      };
      
      messages = [systemMessage, ...messages];
      requestParams.messages = messages;
    }
  }
  
  // For models that support JSON schema format
  if (schema && (!useSystemMessageApproach)) {
    requestParams.response_format = {
      type: 'json_schema',
      json_schema: {
        // Always include name, with default "result" if not provided in schema
        name: schema.name || "result",
        // Add strict mode for better enforcement
        strict: true,
        // Schema definition for OpenAI compatibility
        schema: {
          type: 'object',
          properties: schema.properties || {},
          required: schema.required || Object.keys(schema.properties || {}),
          additionalProperties: schema.additionalProperties !== undefined 
            ? schema.additionalProperties 
            : false,
          // Copy any additional schema properties (excluding properties we've already handled)
          ...Object.fromEntries(
            Object.entries(schema).filter(([key]) => 
              !['name', 'properties', 'required', 'additionalProperties'].includes(key)
            )
          )
        }
      }
    };
  }
  
  // Add any other options provided, but exclude internal keys
  Object.entries(options).forEach(([key, value]) => {
    if (!['apiKey', 'model', 'endpoint', 'stream', 'schema'].includes(key)) {
      requestParams[key] = value;
    }
  });
  
  const requestOptions = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestParams)
  };

  return { apiKey, model, endpoint, requestOptions };
}

/**
 * Process response content based on model type and extract JSON if needed
 */
function processResponseContent(content: string, options: CallAIOptions = {}): string {
  if (!content || !options.schema) {
    return content;
  }

  // Detect model types
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
  const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
  
  // For models that might return formatted text instead of JSON
  const needsJsonExtraction = isClaudeModel || isGeminiModel || isLlama3Model || isDeepSeekModel;
  
  if (needsJsonExtraction) {
    // Try to extract JSON from content if it might be wrapped
    // Look for code blocks or JSON objects within the text
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/```\s*([\s\S]*?)\s*```/) || 
                     content.match(/\{[\s\S]*\}/) ||
                     [null, content];
    
    return jsonMatch[1] || content;
  }
  
  return content;
}

/**
 * Internal implementation for non-streaming API calls
 */
async function callAINonStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {}
): Promise<string> {
  try {
    const { endpoint, requestOptions } = prepareRequestParams(prompt, options);
    
    const response = await fetch(endpoint, requestOptions);
    const result = await response.json();
    
    // Handle error responses
    if (result.error) {
      console.error("API returned an error:", result.error);
      return JSON.stringify({ 
        error: result.error, 
        message: result.error.message || "API returned an error" 
      });
    }
    
    if (!result.choices || !result.choices.length) {
      throw new Error('Invalid response format from API');
    }
    
    const content = result.choices[0]?.message?.content || '';
    
    // Process the content based on model type
    return processResponseContent(content, options);
  } catch (error) {
    console.error("AI call failed:", error);
    return JSON.stringify({ 
      error, 
      message: "Sorry, I couldn't process that request." 
    });
  }
}

/**
 * Internal implementation for streaming API calls
 */
async function* callAIStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {}
): AsyncGenerator<string, string, unknown> {
  try {
    const { endpoint, requestOptions, model } = prepareRequestParams(prompt, { ...options, stream: true });
    
    // Detect model type for specialized handling
    const isOpenAIModel = model ? /openai/i.test(model) : false;
    
    const response = await fetch(endpoint, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`API returned error ${response.status}: ${response.statusText}`);
    }
    
    // Handle streaming response
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let chunkCount = 0;
    let accumulatedJSON = '';
    let jsonComplete = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          // Skip [DONE] marker or OPENROUTER PROCESSING lines
          if (line.includes('[DONE]') || line.includes('OPENROUTER PROCESSING')) {
            continue;
          }
          
          try {
            const jsonLine = line.replace('data: ', '');
            if (!jsonLine.trim()) continue;
            
            // Parse the JSON chunk
            const json = JSON.parse(jsonLine);
            
            // Extract content from the delta
            if (json.choices?.[0]?.delta?.content !== undefined) {
              const content = json.choices[0].delta.content;
              
              // For OpenAI models with schema, we're building a JSON response
              if (isOpenAIModel && options.schema) {
                accumulatedJSON += content || '';
                chunkCount++;
                
                // Only yield if we have what appears to be complete JSON
                if (accumulatedJSON.trim().startsWith('{') && 
                    accumulatedJSON.trim().endsWith('}') && 
                    !jsonComplete) {
                  try {
                    // Test if it's valid JSON
                    JSON.parse(accumulatedJSON);
                    text = accumulatedJSON;
                    yield text;
                    jsonComplete = true;
                  } catch (e) {
                    // Not complete JSON yet, continue accumulating
                  }
                }
              } else {
                // For regular text responses
                text += content || '';
                chunkCount++;
                yield processResponseContent(text, options);
              }
            } 
            // Handle message content format
            else if (json.choices?.[0]?.message?.content !== undefined) {
              const content = json.choices[0].message.content;
              text += content || '';
              chunkCount++;
              yield processResponseContent(text, options);
            }
          } catch (e) {
            console.error("Error parsing chunk:", e, "Line:", line);
          }
        }
      }
    }
    
    // If we've reached the end but haven't yielded any JSON yet (e.g. if the JSON wasn't valid),
    // do a final yield with whatever we've accumulated
    if (isOpenAIModel && options.schema && accumulatedJSON && !jsonComplete) {
      try {
        // Try to fix and parse the JSON as a last resort
        const cleanedJSON = accumulatedJSON.trim();
        // If it ends with a comma, remove it and add a closing brace
        const fixedJSON = cleanedJSON.endsWith(',') 
          ? cleanedJSON.slice(0, -1) + '}'
          : cleanedJSON.endsWith('}') 
            ? cleanedJSON 
            : cleanedJSON + '}';
            
        text = fixedJSON;
        return processResponseContent(text, options);
      } catch (e) {
        // If all else fails, return what we have
        console.error("Failed to yield valid JSON:", e);
        return accumulatedJSON;
      }
    }
    
    // Ensure the final return has proper, processed content
    return processResponseContent(text, options);
  } catch (error) {
    console.error("AI call failed:", error);
    return JSON.stringify({ 
      error: String(error), 
      message: "Sorry, I couldn't process that request." 
    });
  }
} 