// Direct test for Claude tool mode via OpenRouter with improved error handling

require('dotenv').config();

// Helper function to create a timeout promise
const createTimeoutPromise = (ms) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
};

// Helper function to read response text with timeout
const readResponseTextWithTimeout = async (response, timeoutMs = 10000) => {
  console.log(`⏱️ Starting to read response.text() with ${timeoutMs}ms timeout...`);
  
  // Store the start time
  const startTime = Date.now();
  
  // Create a timeout promise to race against
  const textPromise = response.text();
  const timeoutPromise = createTimeoutPromise(timeoutMs);
  
  try {
    // Use Promise.race to implement timeout for text reading
    const text = await Promise.race([textPromise, timeoutPromise]);
    const endTime = Date.now();
    console.log(`✅ Successfully read response.text() in ${endTime - startTime}ms`);
    return text;
  } catch (error) {
    const endTime = Date.now();
    console.error(`❌ Response.text() error after ${endTime - startTime}ms: ${error.message}`);
    
    // Try to get response details, which might help diagnose issues
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
    
    throw new Error(`Failed to read response text: ${error.message}`);
  }
};

// Helper function for fetch with detailed logging
const fetchWithLogging = async (url, options) => {
  console.log(`📤 Making request to ${url}`);
  console.log('Headers:', JSON.stringify(options.headers, null, 2));
  
  const requestStartTime = Date.now();
  let responseEndTime;
  
  try {
    const response = await fetch(url, options);
    responseEndTime = Date.now();
    
    console.log(`📥 Response received in ${responseEndTime - requestStartTime}ms`);
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries([...response.headers.entries()]));
    
    return response;
  } catch (error) {
    console.error(`❌ Fetch error after ${Date.now() - requestStartTime}ms:`, error);
    throw error;
  }
};

async function main() {
  // Get API key from environment, trying both variables
  const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.error('Error: No API key found. Please set CALLAI_API_KEY or OPENROUTER_API_KEY in your .env file.');
    process.exit(1);
  }

  // Define a simple todo list schema
  const todoSchema = {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['todos'],
    additionalProperties: false
  };
  
  console.log('🔍 Testing Claude with direct tool call via OpenRouter:');
  console.log(`🔑 Using API key: ${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`);
  
  // Set up timers for performance tracking
  console.time('total-execution');
  
  try {
    // Create the request body
    const requestBody = {
      model: 'anthropic/claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Create a todo list for a productive day' }
      ],
      tools: [
        {
          name: 'todo_list',
          description: 'Generate a todo list according to the required schema',
          input_schema: todoSchema
        }
      ],
      tool_choice: {
        type: 'tool',
        name: 'todo_list'
      }
    };
    
    console.log('📤 Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make the API call with improved error handling
    console.time('fetch-request');
    const response = await fetchWithLogging('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jchrisa/call-ai'
      },
      body: JSON.stringify(requestBody)
    });
    console.timeEnd('fetch-request');
    
    // Try to read the response with timeout protection
    console.time('response-text');
    let responseText;
    try {
      responseText = await readResponseTextWithTimeout(response, 15000);
      console.log(`📥 Response size: ${responseText.length} characters`);
      console.log('📥 Response preview:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
    } catch (error) {
      console.error('⚠️ Could not read response text:', error.message);
      console.error('⚠️ This matches the timeout issue we see in the test!');
      console.timeEnd('response-text');
      console.timeEnd('total-execution');
      return;
    }
    console.timeEnd('response-text');
    
    console.time('json-parse');
    try {
      const result = JSON.parse(responseText);
      console.log('✅ Successfully parsed JSON response');
      console.log('📊 Response structure:', {
        id: result.id,
        model: result.model,
        object: result.object,
        usage: result.usage,
        choices: result.choices ? result.choices.length : 0
      });
      
      // Try to extract the tool call data if present
      if (result.choices && result.choices.length > 0) {
        const choice = result.choices[0];
        console.log('📋 Choice:', {
          index: choice.index,
          finishReason: choice.finish_reason
        });
        
        if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          // Handle OpenAI-style tool calls
          console.log('🛠️ Tool calls found in response');
          const toolCall = choice.message.tool_calls[0];
          console.log('🛠️ Tool call:', {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function?.name,
              arguments: toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : null
            }
          });
        } else if (choice.message && Array.isArray(choice.message.content)) {
          // Handle Anthropic-style content array
          console.log('📄 Content array format detected');
          const contentTypes = choice.message.content.map(block => block.type).join(', ');
          console.log('📄 Content types:', contentTypes);
          
          const toolUseBlock = choice.message.content.find(block => block.type === 'tool_use');
          if (toolUseBlock) {
            console.log('🛠️ Tool use block found:', toolUseBlock);
            console.log('🛠️ Tool input:', toolUseBlock.input);
          } else {
            console.log('❌ No tool_use block found in content array');
            console.log('📄 Full content:', JSON.stringify(choice.message.content, null, 2));
          }
        } else if (choice.message && choice.message.content) {
          // Handle plain text content
          console.log('📝 Plain text content:', choice.message.content);
        } else {
          console.log('❓ Unexpected message format:', choice.message);
        }
      } else {
        console.log('❌ No choices found in the response');
      }
    } catch (e) {
      console.error('❌ Failed to parse response JSON:', e.message);
      console.error('❌ Raw response:', responseText);
    }
    console.timeEnd('json-parse');
  } catch (error) {
    console.error('❌ Error during execution:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    console.timeEnd('total-execution');
  }
}

main(); 