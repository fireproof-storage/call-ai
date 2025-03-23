// Direct test for Claude via OpenRouter using fetch
// This test bypasses the CallAI library to directly probe the API

require('dotenv').config();

async function main() {
  // Get API key from environment
  const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.error('Error: No API key found. Please set CALLAI_API_KEY or OPENROUTER_API_KEY in your .env file.');
    process.exit(1);
  }

  // Define a simple book recommendation schema (same as in the test)
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
  
  console.log('🔍 Testing Claude direct fetch via OpenRouter:');
  
  // Measure time
  console.time('claude-direct-fetch');
  
  try {
    // Test 1: Using tool mode
    console.log('\n🔧 TEST 1: Tool Mode');
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
    console.time('claude-tool-mode');
    console.log('⏳ Sending request to Claude API with tool mode...');
    const toolModeResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jchrisa/call-ai' // Helpful for OpenRouter to identify the source
      },
      body: JSON.stringify(toolModeRequestBody)
    });
    
    // Parse the response for tool mode
    const toolModeResponseStatus = toolModeResponse.status;
    const toolModeResponseHeaders = Object.fromEntries([...toolModeResponse.headers.entries()]);
    const toolModeResponseText = await toolModeResponse.text();
    console.timeEnd('claude-tool-mode');
    
    console.log('📥 Response status:', toolModeResponseStatus);
    console.log('📥 Response headers:', toolModeResponseHeaders);
    console.log('📥 Response text:', toolModeResponseText);
    
    try {
      const toolModeResult = JSON.parse(toolModeResponseText);
      console.log('📊 Parsed response:', JSON.stringify(toolModeResult, null, 2));
      
      // Try to extract the tool_use data if present
      if (toolModeResult.choices && toolModeResult.choices.length > 0) {
        const choice = toolModeResult.choices[0];
        
        if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          console.log('🛠️ Tool calls:', JSON.stringify(choice.message.tool_calls, null, 2));
        } else if (choice.message && Array.isArray(choice.message.content)) {
          const toolUseBlock = choice.message.content.find(block => block.type === 'tool_use');
          
          if (toolUseBlock) {
            console.log('🛠️ Tool use input:', JSON.stringify(toolUseBlock.input, null, 2));
          } else {
            console.log('⚠️ No tool_use block found in content');
          }
        }
      }
    } catch (e) {
      console.error('❌ Failed to parse response JSON:', e);
    }
    
    // Test 2: Using system message approach
    console.log('\n📝 TEST 2: System Message Approach');
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
    console.time('claude-system-message');
    console.log('⏳ Sending request to Claude API with system message...');
    const systemMessageResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jchrisa/call-ai'
      },
      body: JSON.stringify(systemMessageRequestBody)
    });
    
    // Parse the response for system message approach
    const systemMessageResponseStatus = systemMessageResponse.status;
    const systemMessageResponseHeaders = Object.fromEntries([...systemMessageResponse.headers.entries()]);
    const systemMessageResponseText = await systemMessageResponse.text();
    console.timeEnd('claude-system-message');
    
    console.log('📥 Response status:', systemMessageResponseStatus);
    console.log('📥 Response headers:', systemMessageResponseHeaders);
    console.log('📥 Response text:', systemMessageResponseText);
    
    try {
      const systemMessageResult = JSON.parse(systemMessageResponseText);
      console.log('📊 Parsed response:', JSON.stringify(systemMessageResult, null, 2));
      
      if (systemMessageResult.choices && systemMessageResult.choices.length > 0) {
        const content = systemMessageResult.choices[0].message.content;
        console.log('📄 Content:', content);
        
        try {
          // Try to parse the content as JSON
          const parsedContent = JSON.parse(content);
          console.log('📊 Parsed JSON content:', parsedContent);
        } catch (e) {
          console.log('⚠️ Content is not valid JSON:', e.message);
        }
      }
    } catch (e) {
      console.error('❌ Failed to parse response JSON:', e);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.timeEnd('claude-direct-fetch');
  }
}

// Run the tests
main(); 