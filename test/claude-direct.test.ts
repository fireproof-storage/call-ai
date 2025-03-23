import dotenv from 'dotenv';
const TIMEOUT = 30000; // 30 second timeout

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

// Helper interfaces for type safety
interface MessageContent {
  type: string;
  input?: any;
  [key: string]: any;
}

interface ToolCall {
  function: {
    name: string;
    arguments: string;
  };
  [key: string]: any;
}

// Helper function to create a timeout promise
const createTimeoutPromise = (ms: number) => {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
};

// Helper function to make a fetch request with detailed logging and timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 15000) => {
  console.log(`⏱️ Starting fetch with ${timeoutMs}ms timeout to ${url}`);
  console.log(`🔧 Headers: ${JSON.stringify(Object.fromEntries(Object.entries(options.headers || {})))}`);
  
  const fetchPromise = fetch(url, options);
  const timeoutPromise = createTimeoutPromise(timeoutMs);
  
  try {
    // Use Promise.race to implement timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    console.log(`✅ Fetch completed successfully in under ${timeoutMs}ms`);
    return response;
  } catch (error) {
    console.error(`❌ Fetch error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

// Helper function to read response text with timeout
const readResponseTextWithTimeout = async (response: Response, timeoutMs: number = 10000) => {
  console.log(`⏱️ Starting to read response.text() with ${timeoutMs}ms timeout...`);
  
  const textPromise = response.text();
  const timeoutPromise = createTimeoutPromise(timeoutMs);
  
  try {
    // Use Promise.race to implement timeout for text reading
    const text = await Promise.race([textPromise, timeoutPromise]);
    console.log(`✅ Successfully read response.text() in under ${timeoutMs}ms`);
    return text;
  } catch (error) {
    console.error(`❌ Response.text() timeout: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Timeout reading response text after ${timeoutMs}ms - this is likely the issue with Claude API`);
  }
};

describe('Claude Direct API Tests', () => {
  // Increase Jest timeout for the entire describe block
  jest.setTimeout(TIMEOUT);
  
  beforeAll(() => {
    console.log('🧪 Starting Claude Direct API Tests');
    console.log(`🔑 API key available: ${!!haveApiKey}`);
    console.log(`⏱️ Test timeout: ${TIMEOUT}ms`);
    console.log('💻 Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      platform: process.platform,
      nodeVersion: process.version
    });
  });

  // Define a simple book recommendation schema (same as in the integration test)
  const bookSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      author: { type: 'string' },
      year: { type: 'number' },
      genre: { type: 'string' }
    },
    required: ['title', 'author', 'year', 'genre'],
    additionalProperties: false
  };

  itif(!!haveApiKey)('Claude should respond to direct API call with tool mode', async () => {
    // Skip test explicitly if no API key
    if (!haveApiKey) {
      console.log('⏩ Skipping test: No API key available');
      return;
    }

    console.log('🔍 Starting Claude tool mode direct test');
    console.time('claude-tool-mode-test');
    
    const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
    console.log(`🔑 Using API key: ${apiKey?.substring(0, 3)}...${apiKey?.substring(apiKey.length - 3)}`);
    
    const toolModeRequestBody = {
      model: 'anthropic/claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Give me a book recommendation about science fiction from the 1960s.' }
      ],
      tools: [
        {
          name: 'book_recommendation',
          description: 'Generate a book recommendation according to the required schema',
          input_schema: bookSchema
        }
      ],
      tool_choice: {
        type: 'tool',
        name: 'book_recommendation'
      }
    };
    
    console.log('📤 Request payload:', JSON.stringify(toolModeRequestBody, null, 2));
    
    try {
      // Make the API call directly with tool mode
      console.log('⏳ Sending request to Claude API with tool mode...');
      const startTime = Date.now();
      
      // Create request options
      const requestOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/jchrisa/call-ai' // Helpful for OpenRouter to identify the source
        },
        body: JSON.stringify(toolModeRequestBody)
      };
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting fetch with detailed timing logs...`);
      
      // Use our fetchWithTimeout helper
      const toolModeResponse = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions', 
        requestOptions,
        20000 // 20 second timeout
      );
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Fetch request completed, response received`);
      
      // Log the response details
      const toolModeResponseStatus = toolModeResponse.status;
      const toolModeResponseHeaders = Object.fromEntries([...toolModeResponse.headers.entries()]);
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Response status:`, toolModeResponseStatus);
      console.log(`⏱️ [${Date.now() - startTime}ms] Response headers:`, toolModeResponseHeaders);
      
      // Get the text response
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting to read response.text()...`);
      const toolModeResponseText = await readResponseTextWithTimeout(toolModeResponse, 10000);
      console.log(`⏱️ [${Date.now() - startTime}ms] Finished reading response.text()`);
      
      const endTime = Date.now();
      console.log(`⏱️ Total response time: ${endTime - startTime}ms`);
      
      // Log only the first 500 characters of the response for preview
      console.log('📥 Response preview:', toolModeResponseText.substring(0, 500) + '...');
      console.log(`📥 Response size: ${toolModeResponseText.length} characters`);
      
      // Verify response structure
      expect(toolModeResponseStatus).toBe(200);
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting to parse JSON...`);
      const toolModeResult = JSON.parse(toolModeResponseText);
      console.log(`⏱️ [${Date.now() - startTime}ms] JSON parsing complete`);
      
      expect(toolModeResult).toHaveProperty('choices');
      expect(toolModeResult.choices.length).toBeGreaterThan(0);
      
      console.log('📊 Parsed response structure:');
      console.log(`• id: ${toolModeResult.id || 'N/A'}`);
      console.log(`• model: ${toolModeResult.model || 'N/A'}`);
      console.log(`• object: ${toolModeResult.object || 'N/A'}`);
      
      if (toolModeResult.usage) {
        console.log('• usage:', {
          promptTokens: toolModeResult.usage.prompt_tokens,
          completionTokens: toolModeResult.usage.completion_tokens,
          totalTokens: toolModeResult.usage.total_tokens
        });
      }
      
      // Check for tool calls in the response
      const choice = toolModeResult.choices[0];
      console.log('• choice:', {
        finishReason: choice.finish_reason,
        index: choice.index
      });
      
      if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('🛠️ Tool calls found in response');
        console.log(JSON.stringify(choice.message.tool_calls, null, 2));
        
        // Validate tool call data
        const toolCall = choice.message.tool_calls[0] as ToolCall;
        expect(toolCall).toHaveProperty('function');
        expect(toolCall.function).toHaveProperty('name', 'book_recommendation');
        expect(toolCall.function).toHaveProperty('arguments');
        
        // Parse the arguments
        console.log(`⏱️ [${Date.now() - startTime}ms] Parsing tool call arguments...`);
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`⏱️ [${Date.now() - startTime}ms] Finished parsing tool call arguments`);
        
        console.log('📚 Book recommendation:', args);
        
        expect(args).toHaveProperty('title');
        expect(args).toHaveProperty('author');
        expect(args).toHaveProperty('year');
        expect(args).toHaveProperty('genre');
        
        console.log('✅ Tool mode test passed with valid structured data');
      } else if (choice.message && Array.isArray(choice.message.content)) {
        // Alternative format sometimes used
        console.log('🔎 Examining content array format...');
        console.log(`📋 Content array length: ${choice.message.content.length}`);
        console.log('📋 Content array types:', choice.message.content.map((block: any) => block.type).join(', '));
        
        const toolUseBlock = choice.message.content.find((block: MessageContent) => block.type === 'tool_use');
        
        if (toolUseBlock) {
          console.log('🛠️ Tool use block found in content array:');
          console.log(JSON.stringify(toolUseBlock, null, 2));
          
          // Validate tool use data
          expect(toolUseBlock).toHaveProperty('input');
          
          const input = toolUseBlock.input;
          console.log('📚 Book recommendation from tool_use block:', input);
          
          expect(input).toHaveProperty('title');
          expect(input).toHaveProperty('author');
          expect(input).toHaveProperty('year');
          expect(input).toHaveProperty('genre');
          
          console.log('✅ Tool mode test passed with valid structured data (content array format)');
        } else {
          console.log('⚠️ No tool_use block found in content array');
          console.log('Full message content:', JSON.stringify(choice.message.content, null, 2));
          console.log('Full choice object:', JSON.stringify(choice, null, 2));
          throw new Error('No tool use data found in the response');
        }
      } else {
        console.log('⚠️ Unexpected response format');
        console.log('Full choice object:', JSON.stringify(choice, null, 2));
        throw new Error('Unexpected response format from Claude API');
      }
    } catch (error: unknown) {
      console.error('❌ Tool mode test error:', error);
      console.error(`⏱️ Error occurred at ${new Date().toISOString()}`);
      
      if (error instanceof Error) {
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
      }
      
      throw new Error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      console.timeEnd('claude-tool-mode-test');
    }
  }, TIMEOUT);

  itif(!!haveApiKey)('Claude should respond to direct API call with system message', async () => {
    // Skip test explicitly if no API key
    if (!haveApiKey) {
      console.log('⏩ Skipping test: No API key available');
      return;
    }

    console.log('🔍 Starting Claude system message direct test');
    console.time('claude-system-message-test');
    
    const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
    console.log(`🔑 Using API key: ${apiKey?.substring(0, 3)}...${apiKey?.substring(apiKey.length - 3)}`);
    
    const systemMessageRequestBody = {
      model: 'anthropic/claude-3-sonnet',
      messages: [
        { 
          role: 'system', 
          content: `You are a helpful assistant that outputs JSON in the following format:
{
  "title": "string - the title of the book",
  "author": "string - the name of the author",
  "year": "number - the year the book was published",
  "genre": "string - the genre of the book"
}

Always respond with valid JSON matching this format. No explanations, just JSON.` 
        },
        { role: 'user', content: 'Give me a book recommendation about science fiction from the 1960s.' }
      ]
    };
    
    console.log('📤 Request payload:', JSON.stringify(systemMessageRequestBody, null, 2));
    
    try {
      // Make the API call directly with system message approach
      console.log('⏳ Sending request to Claude API with system message...');
      const startTime = Date.now();
      
      // Create request options
      const requestOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/jchrisa/call-ai'
        },
        body: JSON.stringify(systemMessageRequestBody)
      };
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting fetch with detailed timing logs...`);
      
      // Use our fetchWithTimeout helper
      const systemMessageResponse = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions', 
        requestOptions,
        20000 // 20 second timeout
      );
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Fetch request completed, response received`);
      
      // Log the response details
      const systemMessageResponseStatus = systemMessageResponse.status;
      const systemMessageResponseHeaders = Object.fromEntries([...systemMessageResponse.headers.entries()]);
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Response status:`, systemMessageResponseStatus);
      console.log(`⏱️ [${Date.now() - startTime}ms] Response headers:`, systemMessageResponseHeaders);
      
      // Get the text response
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting to read response.text()...`);
      const systemMessageResponseText = await readResponseTextWithTimeout(systemMessageResponse, 10000);
      console.log(`⏱️ [${Date.now() - startTime}ms] Finished reading response.text()`);
      
      const endTime = Date.now();
      console.log(`⏱️ Total response time: ${endTime - startTime}ms`);
      
      // Log only the first 500 characters of the response for preview
      console.log('📥 Response preview:', systemMessageResponseText.substring(0, 500) + '...');
      console.log(`📥 Response size: ${systemMessageResponseText.length} characters`);
      
      // Verify response structure
      expect(systemMessageResponseStatus).toBe(200);
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting to parse JSON...`);
      const systemMessageResult = JSON.parse(systemMessageResponseText);
      console.log(`⏱️ [${Date.now() - startTime}ms] JSON parsing complete`);
      
      expect(systemMessageResult).toHaveProperty('choices');
      expect(systemMessageResult.choices.length).toBeGreaterThan(0);
      
      console.log('📊 Parsed response structure:');
      console.log(`• id: ${systemMessageResult.id || 'N/A'}`);
      console.log(`• model: ${systemMessageResult.model || 'N/A'}`);
      console.log(`• object: ${systemMessageResult.object || 'N/A'}`);
      
      if (systemMessageResult.usage) {
        console.log('• usage:', {
          promptTokens: systemMessageResult.usage.prompt_tokens,
          completionTokens: systemMessageResult.usage.completion_tokens,
          totalTokens: systemMessageResult.usage.total_tokens
        });
      }
      
      // Check the content
      const choice = systemMessageResult.choices[0];
      console.log('• choice:', {
        finishReason: choice.finish_reason,
        index: choice.index
      });
      
      expect(choice).toHaveProperty('message');
      expect(choice.message).toHaveProperty('content');
      
      const content = choice.message.content;
      console.log('📄 Raw content:', content);
      
      // Try to parse as JSON (might be just raw JSON or have markdown)
      let parsedData;
      
      console.log(`⏱️ [${Date.now() - startTime}ms] Attempting to parse content as JSON...`);
      try {
        // Try direct JSON parse first
        parsedData = JSON.parse(content);
        console.log(`⏱️ [${Date.now() - startTime}ms] Successfully parsed content as direct JSON`);
      } catch (e) {
        console.log(`⏱️ [${Date.now() - startTime}ms] Direct JSON parse failed, trying to extract JSON from markdown/text`);
        
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      content.match(/```\s*([\s\S]*?)\s*```/) || 
                      content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          console.log('📄 Found JSON match in content:', jsonMatch[0]);
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          
          try {
            parsedData = JSON.parse(jsonContent);
            console.log(`⏱️ [${Date.now() - startTime}ms] Successfully extracted and parsed JSON from markdown`);
          } catch (innerError: unknown) {
            console.error('❌ Could not parse extracted content as JSON:', innerError);
            console.error('📄 Extracted content was:', jsonContent);
            throw new Error(`Could not parse JSON from extracted content: ${innerError instanceof Error ? innerError.message : String(innerError)}`);
          }
        } else {
          console.error('❌ No JSON found in response');
          console.error('📄 Full content:', content);
          throw new Error('No JSON found in Claude response');
        }
      }
      
      console.log('📚 Parsed book recommendation:', parsedData);
      
      // Validate the parsed JSON
      expect(parsedData).toHaveProperty('title');
      expect(parsedData).toHaveProperty('author');
      expect(parsedData).toHaveProperty('year');
      expect(parsedData).toHaveProperty('genre');
      
      console.log('✅ System message test passed with valid structured data');
    } catch (error: unknown) {
      console.error('❌ System message test error:', error);
      console.error(`⏱️ Error occurred at ${new Date().toISOString()}`);
      
      if (error instanceof Error) {
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
      }
      
      throw new Error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      console.timeEnd('claude-system-message-test');
    }
  }, TIMEOUT);
}); 