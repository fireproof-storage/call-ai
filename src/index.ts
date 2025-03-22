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
  const isOpenAIModel = options.model ? /openai|gpt/i.test(options.model) : false;
  
  // Models use their optimal schema strategy
  // Claude: Use tool mode when schema is provided
  const useToolMode = isClaudeModel && options.schema;
  
  // System message approach for Llama, DeepSeek, and GPT-4 Turbo
  const useSystemMessageApproach = isLlama3Model || isDeepSeekModel || isGPT4TurboModel;
  
  // JSON Schema approach for OpenAI models (GPT, GPT-4o) and Gemini
  const useJsonSchemaApproach = (isOpenAIModel || isGeminiModel) && options.schema;
  
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
  
  // For Claude with tool mode
  if (useToolMode && schema) {
    console.log(`[DEBUG] Using tool mode for ${model}`);
    
    // Process schema for tool use
    const processedSchema = {
      type: 'object',
      properties: schema.properties || {},
      required: Object.keys(schema.properties || {}), // All fields required for Claude tools
      additionalProperties: schema.additionalProperties !== undefined 
        ? schema.additionalProperties 
        : false,
    };
    
    console.log(`[DEBUG] Tool input schema:`, JSON.stringify(processedSchema, null, 2));
    
    // Add tools parameter for Claude
    requestParams.tools = [{
      name: schema.name || 'generate_structured_data',
      description: 'Generate data according to the required schema',
      input_schema: processedSchema
    }];
    
    // Force Claude to use the tool
    requestParams.tool_choice = {
      type: 'tool',
      name: schema.name || 'generate_structured_data'
    };
  }
  // For models that need schema as system message
  else if (schema && useSystemMessageApproach) {
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
      
      // Debug log for system message approach
      console.log(`[DEBUG] Using system message approach for ${model}`);
      console.log(`[DEBUG] System message content: ${systemMessage.content}`);
    }
  }
  // For models that support JSON schema format (OpenAI and Gemini)
  else if (schema && useJsonSchemaApproach) {
    // Debug log the original schema
    console.log(`[DEBUG] Using json_schema approach for ${model}`);
    console.log(`[DEBUG] Original schema:`, JSON.stringify(schema, null, 2));
    
    // For Claude, ensure all fields are included in 'required'
    let requiredFields = schema.required || [];
    if (isClaudeModel) {
      // Claude requires ALL properties to be listed in required field
      requiredFields = Object.keys(schema.properties || {});
    } else {
      // For other models, default to all properties if required is not specified
      requiredFields = schema.required || Object.keys(schema.properties || {});
    }
    
    const processedSchema = recursivelyAddAdditionalProperties({
      type: 'object',
      properties: schema.properties || {},
      required: requiredFields,
      additionalProperties: schema.additionalProperties !== undefined 
        ? schema.additionalProperties 
        : false,
      // Copy any additional schema properties (excluding properties we've already handled)
      ...Object.fromEntries(
        Object.entries(schema).filter(([key]) => 
          !['name', 'properties', 'required', 'additionalProperties'].includes(key)
        )
      )
    });
    
    // Debug log the processed schema
    console.log(`[DEBUG] Processed schema:`, JSON.stringify(processedSchema, null, 2));
    
    requestParams.response_format = {
      type: 'json_schema',
      json_schema: {
        // Always include name, with default "result" if not provided in schema
        name: schema.name || "result",
        // Add strict mode for better enforcement
        strict: true,
        // Schema definition for OpenAI compatibility
        schema: processedSchema
      }
    };
    
    // Debug log the final response_format
    console.log(`[DEBUG] Final response_format:`, JSON.stringify(requestParams.response_format, null, 2));
  }
  
  // Add any other options provided, but exclude internal keys
  Object.entries(options).forEach(([key, value]) => {
    if (!['apiKey', 'model', 'endpoint', 'stream', 'schema'].includes(key)) {
      requestParams[key] = value;
    }
  });
  
  // Log the full request parameters for debugging
  // console.log('[DEBUG] Full request parameters:', JSON.stringify(requestParams, null, 2));
  
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
function processResponseContent(content: string | any, options: CallAIOptions = {}): string {
  // For tool use mode with Claude, handle differently
  if (typeof content === 'object' && content.type === 'tool_use') {
    return JSON.stringify(content.input);
  }

  if (!content || !options.schema) {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }

  // Detect model types
  const isClaudeModel = options.model ? /claude/i.test(options.model) : false;
  const isGeminiModel = options.model ? /gemini/i.test(options.model) : false;
  const isLlama3Model = options.model ? /llama-3/i.test(options.model) : false;
  const isDeepSeekModel = options.model ? /deepseek/i.test(options.model) : false;
  
  // Handle string content
  if (typeof content === 'string') {
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
  }
  
  return typeof content === 'string' ? content : JSON.stringify(content);
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
    const isClaudeModel = model ? /claude/i.test(model) : false;
    const useToolMode = isClaudeModel && options.schema;
    
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
    
    // Handle tool use response differently for Claude
    if (useToolMode && result.stop_reason === 'tool_use') {
      console.log(`[DEBUG] Received tool_use response:`, JSON.stringify(result, null, 2));
      
      // Extract the tool use content
      if (result.content && Array.isArray(result.content)) {
        const toolUseBlock = result.content.find((block: any) => block.type === 'tool_use');
        if (toolUseBlock) {
          return JSON.stringify(toolUseBlock.input);
        }
      }
      
      // Find tool_use in assistant's content blocks
      if (result.choices && Array.isArray(result.choices)) {
        const choice = result.choices[0];
        if (choice.message && Array.isArray(choice.message.content)) {
          const toolUseBlock = choice.message.content.find((block: any) => block.type === 'tool_use');
          if (toolUseBlock) {
            return JSON.stringify(toolUseBlock.input);
          }
        }
      }
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
    const isClaudeModel = model ? /claude/i.test(model) : false;
    const useToolMode = isClaudeModel && options.schema;
    
    // Note: Tool mode may not work well with streaming for Claude currently
    if (useToolMode) {
      console.log(`[WARN] Tool mode with streaming may not work as expected with Claude. Consider using non-streaming mode.`);
    }
    
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
            
            // Handle tool use response for Claude
            if (useToolMode && json.stop_reason === 'tool_use') {
              // Extract the tool use content
              if (json.content && Array.isArray(json.content)) {
                const toolUseBlock = json.content.find((block: any) => block.type === 'tool_use');
                if (toolUseBlock) {
                  completeText = JSON.stringify(toolUseBlock.input);
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
                    completeText = JSON.stringify(toolUseBlock.input);
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
              const processed = processResponseContent(completeText, options);
              yield processed;
            } 
            // Handle message content format (non-streaming deltas)
            else if (json.choices?.[0]?.message?.content !== undefined) {
              const content = json.choices[0].message.content || '';
              completeText += content;
              chunkCount++;
              const processed = processResponseContent(completeText, options);
              yield processed;
            }
            // Handle content blocks for Claude/Anthropic response format
            else if (json.choices?.[0]?.message?.content && Array.isArray(json.choices[0].message.content)) {
              const contentBlocks = json.choices[0].message.content;
              // Find text or tool_use blocks
              for (const block of contentBlocks) {
                if (block.type === 'text') {
                  completeText += block.text || '';
                  chunkCount++;
                } else if (useToolMode && block.type === 'tool_use') {
                  completeText = JSON.stringify(block.input);
                  chunkCount++;
                  break; // We found what we need
                }
              }
              
              const processed = processResponseContent(completeText, options);
              yield processed;
            }
          } catch (e) {
            console.error(`Error parsing JSON chunk:`, e);
          }
        }
      }
    }
    
    // Ensure the final return has proper, processed content
    return processResponseContent(completeText, options);
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