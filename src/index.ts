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

/**
 * Strategy interface for handling different model types
 */
interface ModelStrategy {
  name: string;
  prepareRequest: (schema: Schema | null, messages: Message[]) => any;
  processResponse: (content: string | any) => string;
  shouldForceStream?: boolean;
}

/**
 * Schema strategies for different model types
 */
type SchemaStrategyType = 'json_schema' | 'tool_mode' | 'system_message' | 'none';

/**
 * Strategy selection result
 */
interface SchemaStrategy {
  strategy: SchemaStrategyType;
  model: string;
  prepareRequest: ModelStrategy['prepareRequest'];
  processResponse: ModelStrategy['processResponse'];
  shouldForceStream: boolean;
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
 * OpenAI/GPT strategy for handling JSON schema
 */
const openAIStrategy: ModelStrategy = {
  name: 'openai',
  prepareRequest: (schema, messages) => {
    if (!schema) return {};
    
    // Process schema for JSON schema approach
    const requiredFields = schema.required || Object.keys(schema.properties || {});
    
    const processedSchema = recursivelyAddAdditionalProperties({
      type: 'object',
      properties: schema.properties || {},
      required: requiredFields,
      additionalProperties: schema.additionalProperties !== undefined 
        ? schema.additionalProperties 
        : false,
      // Copy any additional schema properties
      ...Object.fromEntries(
        Object.entries(schema).filter(([key]) => 
          !['name', 'properties', 'required', 'additionalProperties'].includes(key)
        )
      )
    });
    
    return {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name || "result",
          strict: true,
          schema: processedSchema
        }
      }
    };
  },
  processResponse: (content) => {
    if (typeof content !== 'string') {
      return JSON.stringify(content);
    }
    return content;
  }
};

/**
 * Gemini strategy for handling JSON schema (similar to OpenAI)
 */
const geminiStrategy: ModelStrategy = {
  name: 'gemini',
  prepareRequest: openAIStrategy.prepareRequest,
  processResponse: (content) => {
    if (typeof content !== 'string') {
      return JSON.stringify(content);
    }
    
    // Try to extract JSON from content if it might be wrapped
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                   content.match(/```\s*([\s\S]*?)\s*```/) || 
                   content.match(/\{[\s\S]*\}/) ||
                   [null, content];
    
    return jsonMatch[1] || content;
  }
};

/**
 * Claude strategy using tool mode for structured output
 */
const claudeStrategy: ModelStrategy = {
  name: 'anthropic',
  shouldForceStream: true,
  prepareRequest: (schema, messages) => {
    if (!schema) return {};
    
    // Process schema for tool use
    const processedSchema = {
      type: 'object',
      properties: schema.properties || {},
      required: Object.keys(schema.properties || {}), // All fields required for Claude tools
      additionalProperties: schema.additionalProperties !== undefined 
        ? schema.additionalProperties 
        : false,
    };
    
    return {
      tools: [{
        type: 'function',
        name: schema.name || 'generate_structured_data',
        description: 'Generate data according to the required schema',
        input_schema: processedSchema
      }],
      tool_choice: {
        type: 'tool',
        name: schema.name || 'generate_structured_data'
      }
    };
  },
  processResponse: (content) => {
    // Handle tool use response
    if (typeof content === 'object' && content.type === 'tool_use') {
      return JSON.stringify(content.input);
    }
    
    if (typeof content !== 'string') {
      return JSON.stringify(content);
    }
    
    // Try to extract JSON from content if it might be wrapped
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                   content.match(/```\s*([\s\S]*?)\s*```/) || 
                   content.match(/\{[\s\S]*\}/) ||
                   [null, content];
    
    return jsonMatch[1] || content;
  }
};

/**
 * System message approach for other models (Llama, DeepSeek, etc.)
 */
const systemMessageStrategy: ModelStrategy = {
  name: 'system_message',
  prepareRequest: (schema, messages) => {
    if (!schema) return { messages };
    
    // Check if there's already a system message
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
      
      // Return modified messages array with system message prepended
      return { messages: [systemMessage, ...messages] };
    }
    
    return { messages };
  },
  processResponse: (content) => {
    if (typeof content !== 'string') {
      return JSON.stringify(content);
    }
    
    // Try to extract JSON from content if it might be wrapped
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                   content.match(/```\s*([\s\S]*?)\s*```/) || 
                   content.match(/\{[\s\S]*\}/) ||
                   [null, content];
    
    return jsonMatch[1] || content;
  }
};

/**
 * Default strategy for models without schema
 */
const defaultStrategy: ModelStrategy = {
  name: 'default',
  prepareRequest: () => ({}),
  processResponse: (content) => typeof content === 'string' ? content : JSON.stringify(content)
};

/**
 * Choose the appropriate schema strategy based on model and schema
 */
function chooseSchemaStrategy(model: string | undefined, schema: Schema | null): SchemaStrategy {
  // Default model if not provided
  const resolvedModel = model || (schema ? 'openai/gpt-4o' : 'openrouter/auto');
  
  // No schema case - use default strategy
  if (!schema) {
    return {
      strategy: 'none',
      model: resolvedModel,
      prepareRequest: defaultStrategy.prepareRequest,
      processResponse: defaultStrategy.processResponse,
      shouldForceStream: false
    };
  }
  
  // Check for Claude models
  if (/claude/i.test(resolvedModel)) {
    return {
      strategy: 'tool_mode',
      model: resolvedModel,
      prepareRequest: claudeStrategy.prepareRequest,
      processResponse: claudeStrategy.processResponse,
      shouldForceStream: !!claudeStrategy.shouldForceStream
    };
  }
  
  // Check for Gemini models
  if (/gemini/i.test(resolvedModel)) {
    return {
      strategy: 'json_schema',
      model: resolvedModel,
      prepareRequest: geminiStrategy.prepareRequest,
      processResponse: geminiStrategy.processResponse,
      shouldForceStream: !!geminiStrategy.shouldForceStream
    };
  }
  
  // Check for OpenAI models
  if (/openai|gpt/i.test(resolvedModel)) {
    return {
      strategy: 'json_schema',
      model: resolvedModel,
      prepareRequest: openAIStrategy.prepareRequest,
      processResponse: openAIStrategy.processResponse,
      shouldForceStream: !!openAIStrategy.shouldForceStream
    };
  }
  
  // Check for other specific models that need system message approach
  if (/llama-3|deepseek|gpt-4-turbo/i.test(resolvedModel)) {
    return {
      strategy: 'system_message',
      model: resolvedModel,
      prepareRequest: systemMessageStrategy.prepareRequest,
      processResponse: systemMessageStrategy.processResponse,
      shouldForceStream: !!systemMessageStrategy.shouldForceStream
    };
  }
  
  // Default to system message approach for unknown models with schema
  return {
    strategy: 'system_message',
    model: resolvedModel,
    prepareRequest: systemMessageStrategy.prepareRequest,
    processResponse: systemMessageStrategy.processResponse,
    shouldForceStream: !!systemMessageStrategy.shouldForceStream
  };
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
  // Check if we need to force streaming based on model strategy
  const schemaStrategy = chooseSchemaStrategy(options.model, options.schema || null);
  
  // Handle special case: Claude with tools requires streaming
  if (!options.stream && schemaStrategy.shouldForceStream) {
    // Buffer streaming results into a single response
    return bufferStreamingResults(prompt, options);
  }
  
  // Handle normal non-streaming mode
  if (options.stream !== true) {
    return callAINonStreaming(prompt, options);
  }
  
  // Handle streaming mode
  return callAIStreaming(prompt, options);
}

/**
 * Buffer streaming results into a single response for cases where
 * we need to use streaming internally but the caller requested non-streaming
 */
async function bufferStreamingResults(
  prompt: string | Message[],
  options: CallAIOptions
): Promise<string> {
  // Create a copy of options with streaming enabled
  const streamingOptions = {
    ...options,
    stream: true
  };
  
  // Get streaming generator
  const generator = callAIStreaming(prompt, streamingOptions);
  
  // Buffer all chunks
  let finalResult = '';
  for await (const chunk of generator) {
    finalResult = chunk; // Each chunk contains the full accumulated text
  }
  
  return finalResult;
}

/**
 * Prepare request parameters common to both streaming and non-streaming calls
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions
): { apiKey: string, model: string, endpoint: string, requestOptions: RequestInit } {
  const apiKey = options.apiKey || (typeof window !== 'undefined' ? (window as any).CALLAI_API_KEY : null);
  const schema = options.schema || null;
  
  if (!apiKey) {
    throw new Error('API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY');
  }
  
  // Select the appropriate strategy based on model and schema
  const schemaStrategy = chooseSchemaStrategy(options.model, schema);
  const model = schemaStrategy.model;
  
  const endpoint = options.endpoint || 'https://openrouter.ai/api/v1/chat/completions';
  
  // Handle both string prompts and message arrays for backward compatibility
  const messages: Message[] = Array.isArray(prompt) 
    ? prompt 
    : [{ role: 'user', content: prompt }];
  
  // Build request parameters
  const requestParams: any = {
    model: model,
    stream: options.stream === true,
    messages: messages,
  };
  
  // Apply the strategy's request preparation
  const strategyParams = schemaStrategy.prepareRequest(schema, messages);
  
  // If the strategy returns custom messages, use those instead
  if (strategyParams.messages) {
    requestParams.messages = strategyParams.messages;
  }
  
  // Add all other strategy parameters
  Object.entries(strategyParams).forEach(([key, value]) => {
    if (key !== 'messages') {
      requestParams[key] = value;
    }
  });
  
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
 * Internal implementation for non-streaming API calls
 */
async function callAINonStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {}
): Promise<string> {
  try {
    const { endpoint, requestOptions, model } = prepareRequestParams(prompt, options);
    const schemaStrategy = chooseSchemaStrategy(model, options.schema || null);
    
    const response = await fetch(endpoint, requestOptions);
    
    let result;
    
    // For Claude, use text() instead of json() to avoid potential hanging
    if (/claude/i.test(model)) {
      // Create a timeout wrapper for text() to prevent hanging
      try {
        let textResponse: string;
        const textPromise = response.text();
        const timeoutPromise = new Promise<string>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Text extraction timed out after 5 seconds'));
          }, 5000);
        });

        try {
          textResponse = await Promise.race([textPromise, timeoutPromise]) as string;
        } catch (textError) {
          console.error(`Text extraction timed out or failed:`, textError);
          return JSON.stringify({
            error: true,
            message: "Claude response text extraction timed out. This is likely an issue with the Claude API's response format."
          });
        }

        try {
          result = JSON.parse(textResponse);
        } catch (err) {
          console.error(`Failed to parse Claude response as JSON:`, err);
          throw new Error(`Failed to parse Claude response as JSON: ${err}`);
        }
      } catch (error) {
        console.error(`Claude text extraction error:`, error);
        return JSON.stringify({
          error: true,
          message: `Claude API response processing failed: ${error}`
        });
      }
    } else {
      result = await response.json();
    }
    
    // Handle error responses
    if (result.error) {
      console.error("API returned an error:", result.error);
      return JSON.stringify({ 
        error: result.error, 
        message: result.error.message || "API returned an error" 
      });
    }
    
    // Find tool use content or normal content
    let content;
    
    // Extract tool use content if necessary
    if (schemaStrategy.strategy === 'tool_mode' && result.stop_reason === 'tool_use') {
      // Try to find tool_use block in different response formats
      if (result.content && Array.isArray(result.content)) {
        const toolUseBlock = result.content.find((block: any) => block.type === 'tool_use');
        if (toolUseBlock) {
          content = toolUseBlock;
        }
      }
      
      if (!content && result.choices && Array.isArray(result.choices)) {
        const choice = result.choices[0];
        if (choice.message && Array.isArray(choice.message.content)) {
          const toolUseBlock = choice.message.content.find((block: any) => block.type === 'tool_use');
          if (toolUseBlock) {
            content = toolUseBlock;
          }
        }
      }
    }
    
    // If no tool use content was found, use the standard message content
    if (!content) {
      if (!result.choices || !result.choices.length) {
        throw new Error('Invalid response format from API');
      }
      
      content = result.choices[0]?.message?.content || '';
    }
    
    // Process the content based on model type
    return schemaStrategy.processResponse(content);
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
    const schemaStrategy = chooseSchemaStrategy(model, options.schema || null);
    
    const response = await fetch(endpoint, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`API returned error ${response.status}: ${response.statusText}`);
    }
    
    // Handle streaming response
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let completeText = '';
    let chunkCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

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
            if (!jsonLine.trim()) {
              continue;
            }
            
            // Parse the JSON chunk
            const json = JSON.parse(jsonLine);
            
            // Handle tool use response
            if (schemaStrategy.strategy === 'tool_mode' && json.stop_reason === 'tool_use') {
              // Extract the tool use content
              if (json.content && Array.isArray(json.content)) {
                const toolUseBlock = json.content.find((block: any) => block.type === 'tool_use');
                if (toolUseBlock) {
                  completeText = schemaStrategy.processResponse(toolUseBlock);
                  yield completeText;
                  continue;
                }
              }
              
              // Find tool_use in assistant's content blocks
              if (json.choices && Array.isArray(json.choices)) {
                const choice = json.choices[0];
                if (choice.message && Array.isArray(choice.message.content)) {
                  const toolUseBlock = choice.message.content.find((block: any) => block.type === 'tool_use');
                  if (toolUseBlock) {
                    completeText = schemaStrategy.processResponse(toolUseBlock);
                    yield completeText;
                    continue;
                  }
                }
              }
            }
            
            // Extract content from the delta
            if (json.choices?.[0]?.delta?.content !== undefined) {
              const content = json.choices[0].delta.content || '';
              chunkCount++;
              
              // Treat all models the same - yield as content arrives
              completeText += content;
              yield schemaStrategy.processResponse(completeText);
            } 
            // Handle message content format (non-streaming deltas)
            else if (json.choices?.[0]?.message?.content !== undefined) {
              const content = json.choices[0].message.content || '';
              completeText += content;
              chunkCount++;
              yield schemaStrategy.processResponse(completeText);
            }
            // Handle content blocks for Claude/Anthropic response format
            else if (json.choices?.[0]?.message?.content && Array.isArray(json.choices[0].message.content)) {
              const contentBlocks = json.choices[0].message.content;
              // Find text or tool_use blocks
              for (const block of contentBlocks) {
                if (block.type === 'text') {
                  completeText += block.text || '';
                  chunkCount++;
                } else if (schemaStrategy.strategy === 'tool_mode' && block.type === 'tool_use') {
                  completeText = schemaStrategy.processResponse(block);
                  chunkCount++;
                  break; // We found what we need
                }
              }
              
              yield schemaStrategy.processResponse(completeText);
            }
          } catch (e) {
            console.error(`Error parsing JSON chunk:`, e);
          }
        }
      }
    }
    
    // Ensure the final return has proper, processed content
    return schemaStrategy.processResponse(completeText);
  } catch (error) {
    console.error("AI call failed:", error);
    return JSON.stringify({ 
      error: String(error), 
      message: "Sorry, I couldn't process that request." 
    });
  }
}

/**
 * Recursively adds additionalProperties: false to all object types in a schema
 * This is needed for OpenAI's strict schema validation in streaming mode
 */
function recursivelyAddAdditionalProperties(schema: any): any {
  // Clone to avoid modifying the original
  const result = { ...schema };

  // If this is an object type, ensure it has additionalProperties: false
  if (result.type === 'object') {
    // Set additionalProperties if not already set
    if (result.additionalProperties === undefined) {
      result.additionalProperties = false;
    }

    // Process nested properties if they exist
    if (result.properties) {
      result.properties = { ...result.properties };
      
      // Set required if not already set - OpenAI requires this for all nested objects
      if (result.required === undefined) {
        result.required = Object.keys(result.properties);
      }
      
      // Check each property
      Object.keys(result.properties).forEach(key => {
        const prop = result.properties[key];
        
        // If property is an object or array type, recursively process it
        if (prop && typeof prop === 'object') {
          result.properties[key] = recursivelyAddAdditionalProperties(prop);
          
          // For nested objects, ensure they also have all properties in their required field
          if (prop.type === 'object' && prop.properties) {
            prop.required = Object.keys(prop.properties);
          }
        }
      });
    }
  }
  
  // Handle nested objects in arrays
  if (result.type === 'array' && result.items && typeof result.items === 'object') {
    result.items = recursivelyAddAdditionalProperties(result.items);
    
    // If array items are objects, ensure they have all properties in required
    if (result.items.type === 'object' && result.items.properties) {
      result.items.required = Object.keys(result.items.properties);
    }
  }

  return result;
} 