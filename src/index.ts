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
  // Default to openai/gpt-4o if schema is provided since it supports structured output
  const model = options.model || (options.schema ? 'openai/gpt-4o' : 'openrouter/auto');
  const endpoint = options.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  const schema = options.schema || null;
  
  if (!apiKey) {
    throw new Error('API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY');
  }
  
  // Handle both string prompts and message arrays for backward compatibility
  const messages = Array.isArray(prompt) 
    ? prompt 
    : [{ role: 'user', content: prompt }];
  
  const requestOptions = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      stream: options.stream === true,
      messages: messages,
      // Pass through any additional options like temperature, but exclude internal keys
      ...Object.fromEntries(
        Object.entries(options).filter(([key]) => !['apiKey', 'model', 'endpoint', 'stream', 'schema'].includes(key))
      ),
      // Handle schema if provided
      ...(schema && { 
        response_format: { 
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
        }
      })
    })
  };

  return { apiKey, model, endpoint, requestOptions };
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
    const content = result.choices[0]?.message?.content || '';
    return content;
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
            const json = JSON.parse(line.replace('data: ', ''));
            const content = json.choices[0]?.delta?.content || '';
            text += content;
            yield text;
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