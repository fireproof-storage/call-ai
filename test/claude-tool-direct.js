// Direct test for Claude tool mode via OpenRouter

require('dotenv').config();

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
  
  console.log('Testing Claude with direct tool call via OpenRouter:');
  
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
    
    console.log('Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make the API call directly
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Parse the response
    const responseText = await response.text();
    console.log('Raw Response:', responseText);
    
    try {
      const result = JSON.parse(responseText);
      console.log('Response:', JSON.stringify(result, null, 2));
      
      // Try to extract the tool_use data if present
      if (result.stop_reason === 'tool_use' && result.choices && result.choices.length > 0) {
        const choice = result.choices[0];
        
        if (choice.message && Array.isArray(choice.message.content)) {
          const toolUseBlock = choice.message.content.find(block => block.type === 'tool_use');
          
          if (toolUseBlock) {
            console.log('Tool use input:', JSON.stringify(toolUseBlock.input, null, 2));
          } else {
            console.log('No tool_use block found in content');
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse response JSON:', e);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 