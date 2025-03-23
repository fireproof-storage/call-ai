import dotenv from 'dotenv';
const TIMEOUT = 30000; // 30 second timeout

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

describe('Claude Direct API Tests', () => {
  beforeAll(() => {
    console.log('Running tests with API key available:', !!haveApiKey);
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
      console.log('Skipping test: No API key available');
      return;
    }

    console.log('🔍 Starting Claude tool mode direct test');
    console.time('claude-tool-mode-test');
    
    const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
    
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
    
    // Make the API call directly with tool mode
    console.log('⏳ Sending request to Claude API with tool mode...');
    const startTime = Date.now();
    
    const toolModeResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jchrisa/call-ai' // Helpful for OpenRouter to identify the source
      },
      body: JSON.stringify(toolModeRequestBody)
    });
    
    const endTime = Date.now();
    console.log(`⏱️ Response time: ${endTime - startTime}ms`);
    
    // Parse the response
    const toolModeResponseStatus = toolModeResponse.status;
    const toolModeResponseHeaders = Object.fromEntries([...toolModeResponse.headers.entries()]);
    const toolModeResponseText = await toolModeResponse.text();
    
    console.log('📥 Response status:', toolModeResponseStatus);
    console.log('📥 Response headers:', toolModeResponseHeaders);
    console.log('📥 Response preview:', toolModeResponseText.substring(0, 500) + '...');
    
    // Verify response structure
    expect(toolModeResponseStatus).toBe(200);
    
    try {
      const toolModeResult = JSON.parse(toolModeResponseText);
      expect(toolModeResult).toHaveProperty('choices');
      expect(toolModeResult.choices.length).toBeGreaterThan(0);
      
      console.log('📊 Parsed response structure:');
      
      // Log important response metadata
      if (toolModeResult.object) console.log(`- Object type: ${toolModeResult.object}`);
      if (toolModeResult.model) console.log(`- Model: ${toolModeResult.model}`);
      if (toolModeResult.id) console.log(`- Response ID: ${toolModeResult.id}`);
      if (toolModeResult.usage) console.log(`- Token usage:`, toolModeResult.usage);
      
      // Check for tool calls in the response
      const choice = toolModeResult.choices[0];
      if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        console.log('🛠️ Tool calls found in response');
        console.log(JSON.stringify(choice.message.tool_calls, null, 2));
        
        // Validate tool call data
        const toolCall = choice.message.tool_calls[0];
        expect(toolCall).toHaveProperty('function');
        expect(toolCall.function).toHaveProperty('name', 'book_recommendation');
        expect(toolCall.function).toHaveProperty('arguments');
        
        // Parse the arguments
        const args = JSON.parse(toolCall.function.arguments);
        expect(args).toHaveProperty('title');
        expect(args).toHaveProperty('author');
        expect(args).toHaveProperty('year');
        expect(args).toHaveProperty('genre');
        
        console.log('✅ Tool mode test passed with valid structured data');
      } else if (choice.message && Array.isArray(choice.message.content)) {
        // Alternative format sometimes used
        const toolUseBlock = choice.message.content.find(block => block.type === 'tool_use');
        
        if (toolUseBlock) {
          console.log('🛠️ Tool use block found in content array:');
          console.log(JSON.stringify(toolUseBlock, null, 2));
          
          // Validate tool use data
          expect(toolUseBlock).toHaveProperty('input');
          
          const input = toolUseBlock.input;
          expect(input).toHaveProperty('title');
          expect(input).toHaveProperty('author');
          expect(input).toHaveProperty('year');
          expect(input).toHaveProperty('genre');
          
          console.log('✅ Tool mode test passed with valid structured data (content array format)');
        } else {
          console.log('⚠️ No tool_use block found in content array');
          console.log('Full choice object:', choice);
          fail('No tool use data found in the response');
        }
      } else {
        console.log('⚠️ Unexpected response format');
        console.log('Full choice object:', choice);
        fail('Unexpected response format from Claude API');
      }
    } catch (e) {
      console.error('❌ Failed to parse response JSON:', e);
      fail(`Failed to parse response JSON: ${e.message}`);
    } finally {
      console.timeEnd('claude-tool-mode-test');
    }
  }, TIMEOUT);

  itif(!!haveApiKey)('Claude should respond to direct API call with system message', async () => {
    // Skip test explicitly if no API key
    if (!haveApiKey) {
      console.log('Skipping test: No API key available');
      return;
    }

    console.log('🔍 Starting Claude system message direct test');
    console.time('claude-system-message-test');
    
    const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
    
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
    
    // Make the API call directly with system message approach
    console.log('⏳ Sending request to Claude API with system message...');
    const startTime = Date.now();
    
    const systemMessageResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jchrisa/call-ai'
      },
      body: JSON.stringify(systemMessageRequestBody)
    });
    
    const endTime = Date.now();
    console.log(`⏱️ Response time: ${endTime - startTime}ms`);
    
    // Parse the response
    const systemMessageResponseStatus = systemMessageResponse.status;
    const systemMessageResponseHeaders = Object.fromEntries([...systemMessageResponse.headers.entries()]);
    const systemMessageResponseText = await systemMessageResponse.text();
    
    console.log('📥 Response status:', systemMessageResponseStatus);
    console.log('📥 Response headers:', systemMessageResponseHeaders);
    console.log('📥 Response preview:', systemMessageResponseText.substring(0, 500) + '...');
    
    // Verify response structure
    expect(systemMessageResponseStatus).toBe(200);
    
    try {
      const systemMessageResult = JSON.parse(systemMessageResponseText);
      expect(systemMessageResult).toHaveProperty('choices');
      expect(systemMessageResult.choices.length).toBeGreaterThan(0);
      
      // Log important response metadata
      if (systemMessageResult.object) console.log(`- Object type: ${systemMessageResult.object}`);
      if (systemMessageResult.model) console.log(`- Model: ${systemMessageResult.model}`);
      if (systemMessageResult.id) console.log(`- Response ID: ${systemMessageResult.id}`);
      if (systemMessageResult.usage) console.log(`- Token usage:`, systemMessageResult.usage);
      
      // Check the content
      const choice = systemMessageResult.choices[0];
      expect(choice).toHaveProperty('message');
      expect(choice.message).toHaveProperty('content');
      
      const content = choice.message.content;
      console.log('📄 Content:', content);
      
      // Try to parse as JSON (might be just raw JSON or have markdown)
      let parsedData;
      
      try {
        // Try direct JSON parse first
        parsedData = JSON.parse(content);
      } catch (e) {
        console.log('⚠️ Content is not direct JSON, trying to extract JSON from markdown/text');
        
        // Try to extract JSON from text response (code blocks, etc.)
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                      content.match(/```\s*([\s\S]*?)\s*```/) || 
                      content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          try {
            parsedData = JSON.parse(jsonContent);
            console.log('📊 Extracted and parsed JSON successfully from markdown');
          } catch (innerError) {
            console.error('❌ Could not parse extracted content as JSON:', innerError);
            fail(`Could not parse JSON from extracted content: ${innerError.message}`);
          }
        } else {
          console.error('❌ No JSON found in response');
          fail('No JSON found in Claude response');
        }
      }
      
      // Validate the parsed JSON
      expect(parsedData).toHaveProperty('title');
      expect(parsedData).toHaveProperty('author');
      expect(parsedData).toHaveProperty('year');
      expect(parsedData).toHaveProperty('genre');
      
      console.log('📊 Parsed JSON data:', parsedData);
      console.log('✅ System message test passed with valid structured data');
    } catch (e) {
      console.error('❌ Failed to parse response JSON:', e);
      fail(`Failed to parse response JSON: ${e.message}`);
    } finally {
      console.timeEnd('claude-system-message-test');
    }
  }, TIMEOUT);
}); 