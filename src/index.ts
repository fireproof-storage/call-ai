/**
 * call-ai: A lightweight library for making AI API calls
 */

export type Message = {
  role: 'user' | 'system' | 'assistant';
  content: string;
};

export interface Schema {
  name?: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface CallAIOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  stream?: boolean;
  [key: string]: any;
}

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
 * @param schema Optional JSON schema for structured output
 * @param options Configuration options
 * @returns A Promise that resolves to the complete response string when streaming is disabled,
 *          or an AsyncGenerator that yields partial responses when streaming is enabled
 */
export function callAI(
  prompt: string | Message[],
  schema: Schema | null = null,
  options: Record<string, any> = {}
): Promise<string> | AsyncGenerator<string, string, unknown> {
  // Handle non-streaming mode (default)
  if (options.stream !== true) {
    return callAINonStreaming(prompt, schema, options);
  }
  
  // Handle streaming mode
  return callAIStreaming(prompt, schema, options);
}

/**
 * Prepare request parameters common to both streaming and non-streaming calls
 */
function prepareRequestParams(
  prompt: string | Message[],
  schema: Schema | null,
  options: Record<string, any>
): { apiKey: string, model: string, endpoint: string, requestOptions: RequestInit } {
  const apiKey = options.apiKey || (typeof window !== 'undefined' ? (window as any).CALLAI_API_KEY : null);
  const model = options.model || 'openrouter/auto';
  const endpoint = options.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  
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
      // For schema requests, add provider requirement to ensure JSON schema support
      ...(schema && { provider: { require_parameters: true } }),
      // Pass through any additional options like temperature, but exclude internal keys
      ...Object.fromEntries(
        Object.entries(options).filter(([key]) => !['apiKey', 'model', 'endpoint', 'stream'].includes(key))
      ),
      // Handle schema if provided
      ...(schema && { response_format: { 
        type: 'json_schema', 
        json_schema: {
          name: schema.name || 'response',
          strict: true,
          schema: {
            type: 'object',
            properties: schema.properties || {},
            required: schema.required || Object.keys(schema.properties || {}),
            additionalProperties: schema.additionalProperties !== undefined 
              ? schema.additionalProperties 
              : false
          }
        }
      }})
    })
  };

  return { apiKey, model, endpoint, requestOptions };
}

/**
 * Internal implementation for non-streaming API calls
 */
async function callAINonStreaming(
  prompt: string | Message[],
  schema: Schema | null = null,
  options: Record<string, any> = {}
): Promise<string> {
  try {
    const { endpoint, requestOptions } = prepareRequestParams(prompt, schema, options);
    
    const response = await fetch(endpoint, requestOptions);
    const result = await response.json();
    const content = result.choices[0]?.message?.content || '';
    return content;
  } catch (error) {
    console.error("AI call failed:", error);
    return "Sorry, I couldn't process that request.";
  }
}

/**
 * Internal implementation for streaming API calls
 */
async function* callAIStreaming(
  prompt: string | Message[],
  schema: Schema | null = null,
  options: Record<string, any> = {}
): AsyncGenerator<string, string, unknown> {
  try {
    const { endpoint, requestOptions } = prepareRequestParams(prompt, schema, { ...options, stream: true });
    
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
    return "Sorry, I couldn't process that request.";
  }
} 