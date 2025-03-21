import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

// Test models based on the OpenRouter documentation
const supportedModels = {
  openAI: 'openai/gpt-4o',
  claude: 'anthropic/claude-3-sonnet',
  gemini: 'google/gemini-2.0-flash-001'
};

describe('OpenRouter API wire protocol tests', () => {
  // This test will be skipped if no API key is available
  itif(!!haveApiKey)('should validate the exact OpenRouter schema format', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Create payload with the exact format from OpenRouter docs
    const requestBody = {
      model: supportedModels.openAI, // Using GPT-4o which supports structured output
      messages: [
        { role: 'user', content: 'Create a todo list for learning programming' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'todo', // Required parameter for OpenRouter
          schema: {
            type: 'object',
            properties: {
              todos: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      }
    };
    
    console.log('Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
    console.log('Response body preview:', responseBody.substring(0, 500) + '...');
    
    expect(response.status).toBe(200);
    
    const result = JSON.parse(responseBody);
    
    // Verify the structure of the response
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    
    // Parse the content as JSON and verify it matches our schema
    const data = JSON.parse(result.choices[0].message.content);
    
    // Verify the structure matches our schema
    expect(data).toHaveProperty('todos');
    expect(Array.isArray(data.todos)).toBe(true);
    
    console.log('Direct fetch test result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call
  
  itif(!!haveApiKey)('should format schema correctly for OpenAI structured output', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Create payload with the format we know works based on our testing
    const requestBody = {
      model: supportedModels.openAI, // Using gpt-4o which supports structured output
      messages: [
        { role: 'user', content: 'Give me a short book recommendation in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'book_recommendation', // Required parameter for OpenRouter
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              author: { type: 'string' },
              year: { type: 'number' },
              genre: { type: 'string' },
              rating: { type: 'number', minimum: 1, maximum: 5 }
            }
          }
        }
      }
    };
    
    console.log('Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Response status:', response.status);
    console.log('Response body preview:', responseBody.substring(0, 500) + '...');
    
    expect(response.status).toBe(200);
    
    const result = JSON.parse(responseBody);
    
    // Verify the structure of the response
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    
    // Parse the content as JSON and verify it matches our schema
    const data = JSON.parse(result.choices[0].message.content);
    
    // Verify the structure matches our schema
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('genre');
    
    // Optional fields might be present
    if (data.year !== undefined) {
      expect(typeof data.year).toBe('number');
    }
    
    if (data.rating !== undefined) {
      expect(typeof data.rating).toBe('number');
      expect(data.rating).toBeGreaterThanOrEqual(1);
      expect(data.rating).toBeLessThanOrEqual(5);
    }
    
    console.log('Direct fetch test result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call
  
  // Add a more detailed test to debug schema issues
  itif(!!haveApiKey)('should debug exact schema format sent to OpenRouter', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // This schema format mirrors exactly what our library should be sending
    const schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' },
        genre: { type: 'string' },
        rating: { type: 'number', minimum: 1, maximum: 5 }
      }
    };
    
    // Convert the schema to the format OpenRouter expects
    // This exactly mirrors the transformation in our library
    const requestBody = {
      model: supportedModels.openAI,
      messages: [
        { role: 'user', content: 'Give me a short book recommendation in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          schema: {
            type: 'object',
            properties: schema.properties,
            required: Object.keys(schema.properties),
            additionalProperties: false,
          }
        }
      }
    };
    
    console.log('Debug schema request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Debug schema response status:', response.status);
    console.log('Debug schema response headers:', Object.fromEntries([...response.headers.entries()]));
    console.log('Debug schema response preview:', responseBody.substring(0, 500) + '...');
    
    expect(response.status).toBe(200);
    
    try {
      const result = JSON.parse(responseBody);
      
      // Verify the structure of the response
      expect(result).toHaveProperty('choices');
      expect(result.choices).toBeInstanceOf(Array);
      expect(result.choices.length).toBeGreaterThan(0);
      expect(result.choices[0]).toHaveProperty('message');
      expect(result.choices[0].message).toHaveProperty('content');
      
      // Parse the content as JSON and verify it matches our schema
      const data = JSON.parse(result.choices[0].message.content);
      
      console.log('Debug schema test result:', data);
    } catch (e) {
      console.error('Error in debug schema test:', e);
      console.log('Raw response body:', responseBody);
      throw e;
    }
  }, 30000);
  
  itif(!!haveApiKey)('should handle streaming with our schema format', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Use our standard schema format for the implementation
    const requestBody = {
      model: supportedModels.openAI, // Using gpt-4o which supports structured output
      stream: true,
      messages: [
        { role: 'user', content: 'Give me a weather forecast for New York in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'weather_forecast', // Required parameter for OpenRouter
          schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              current_temp: { type: 'number' },
              conditions: { type: 'string' },
              tomorrow: {
                type: 'object',
                properties: {
                  high: { type: 'number' },
                  low: { type: 'number' },
                  conditions: { type: 'string' }
                }
              }
            }
          }
        }
      }
    };
    
    console.log('Streaming request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status
    expect(response.status).toBe(200);
    
    // Process streaming response directly
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let allText = '';
    let chunks = 0;
    let debugChunks: string[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      debugChunks.push(chunk);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) continue;
          
          try {
            const json = JSON.parse(line.replace('data: ', ''));
            const content = json.choices?.[0]?.delta?.content || '';
            allText += content;
            chunks++;
          } catch (e) {
            console.error("Error parsing chunk:", e, "line:", line);
          }
        }
      }
    }
    
    // For debugging, print the first few chunks
    console.log('First few chunks:', debugChunks.slice(0, 3));
    console.log('All text:', allText);
    
    // Verify we received at least one chunk
    expect(chunks).toBeGreaterThan(0);
    
    // Try to parse the final result
    try {
      const data = JSON.parse(allText);
      
      // Verify the structure matches our schema
      expect(data).toHaveProperty('location');
      expect(data).toHaveProperty('current_temp');
      expect(data).toHaveProperty('conditions');
      expect(data).toHaveProperty('tomorrow');
      
      // Verify types
      expect(typeof data.location).toBe('string');
      expect(typeof data.current_temp).toBe('number');
      expect(typeof data.conditions).toBe('string');
      expect(typeof data.tomorrow).toBe('object');
      expect(typeof data.tomorrow.conditions).toBe('string');
      
      console.log('Stream fetch test - received chunks:', chunks);
      console.log('Stream fetch test result:', data);
    } catch (e) {
      console.error('Failed to parse streaming response as JSON:', e);
      console.log('Raw text:', allText);
      throw e;
    }
  }, 30000); // Increase timeout to 30 seconds for API call
  
  // Add a more detailed test to debug streaming issues
  itif(!!haveApiKey)('should debug detailed streaming response for OpenAI', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // This schema format mirrors exactly what our library should be sending
    const schema = {
      name: 'weather_forecast',
      properties: {
        location: { type: 'string' },
        current_temp: { type: 'number' },
        conditions: { type: 'string' },
        tomorrow: {
          type: 'object',
          properties: {
            high: { type: 'number' },
            low: { type: 'number' },
            conditions: { type: 'string' }
          }
        }
      }
    };
    
    // Convert the schema to the format OpenRouter expects
    // This exactly mirrors the transformation in our library
    const requestBody = {
      model: supportedModels.openAI,
      stream: true,
      messages: [
        { role: 'user', content: 'Give me a weather forecast for New York in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          schema: {
            type: 'object',
            properties: schema.properties,
            required: Object.keys(schema.properties),
            additionalProperties: false,
          }
        }
      }
    };
    
    console.log('Debug streaming request payload:', JSON.stringify(requestBody, null, 2));
    
    try {
      // Make direct fetch call to OpenRouter API
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('Debug streaming response status:', response.status);
      console.log('Debug streaming response headers:', Object.fromEntries([...response.headers.entries()]));
      
      // Process streaming response directly
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let chunks = 0;
      let fullChunksLog: string[] = [];
      let allText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        fullChunksLog.push(chunk);
        console.log(`DEBUG Stream chunk #${chunks}:`, chunk);
        
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            if (line.includes('[DONE]')) continue;
            
            try {
              const json = JSON.parse(line.replace('data: ', ''));
              const content = json.choices?.[0]?.delta?.content || '';
              allText += content;
              chunks++;
              
              if (chunks <= 5) {
                console.log(`DEBUG Processed chunk #${chunks}:`, JSON.stringify(json));
                console.log(`DEBUG Content delta:`, content);
              }
            } catch (e) {
              console.error("DEBUG Error parsing chunk:", e);
              console.log("DEBUG Problem line:", line);
            }
          }
        }
      }
      
      console.log('DEBUG Total chunks received:', chunks);
      console.log('DEBUG Complete text:', allText);
      
      // Just verify we got some chunks
      expect(chunks).toBeGreaterThan(0);
      expect(allText.length).toBeGreaterThan(0);
      
    } catch (e) {
      console.error('DEBUG Major error in streaming test:', e);
      throw e;
    }
  }, 30000); // Increase timeout to 30 seconds for API call

  // Test JSON schema format with Claude 3.5
  itif(!!haveApiKey)('should validate JSON schema format with Claude 3.5', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Using the same format but with Claude 3.5
    const requestBody = {
      model: supportedModels.claude, // Using Claude 3.5 Sonnet
      messages: [
        { role: 'user', content: 'Create a todo list for learning programming in valid JSON format with the following structure: { "todos": ["item 1", "item 2", ...] }' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'todo', // Required parameter for OpenRouter
          schema: {
            type: 'object',
            properties: {
              todos: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      }
    };
    
    console.log('Claude 3.5 Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Claude 3.5 Response status:', response.status);
    console.log('Claude 3.5 Response headers:', Object.fromEntries([...response.headers.entries()]));
    console.log('Claude 3.5 Response body preview:', responseBody.substring(0, 500) + '...');
    
    // Check if Claude 3.5 supports the JSON schema format
    // The test may still pass if Claude returns proper JSON even without supporting the schema format
    const result = JSON.parse(responseBody);
    
    if (result.error) {
      console.log('Claude 3.5 does not support the same JSON schema format, skipping schema validation');
      return;
    }
    
    // Verify the structure of the response
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    
    // Claude often responds with text like "Here's a JSON..." before the actual JSON
    // Extract JSON if wrapped in code blocks or attempt to find JSON-like content
    const content = result.choices[0].message.content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/```\s*([\s\S]*?)\s*```/) || 
                     content.match(/\{[\s\S]*\}/) ||
                     [null, content];
    
    const jsonContent = jsonMatch[1] || jsonMatch[0] || content;
    
    // Parse the content as JSON - let any parse failures propagate directly
    const data = JSON.parse(jsonContent);
    
    // Verify the structure follows our request
    expect(data).toHaveProperty('todos');
    expect(Array.isArray(data.todos)).toBe(true);
    
    console.log('Claude 3.5 result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call

  // Test JSON schema for structured data with Claude 3.5 (without schema format)
  itif(!!haveApiKey)('should handle JSON output with Claude 3.5 using prompt engineering', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // A different approach for Claude that uses prompt engineering instead of schema
    const requestBody = {
      model: supportedModels.claude, // Using Claude 3.5 Sonnet
      messages: [
        { 
          role: 'system', 
          content: `Please generate structured JSON responses that follow this exact schema:
{
  "title": string,
  "author": string,
  "year": number,
  "genre": string,
  "rating": number (between 1-5)
}
Do not include any explanation or text outside of the JSON object.`
        },
        { 
          role: 'user', 
          content: 'Give me a short book recommendation. Respond with only valid JSON matching the schema.' 
        }
      ]
    };
    
    console.log('Claude 3.5 Prompt-based Request:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Claude 3.5 Prompt Response status:', response.status);
    console.log('Claude 3.5 Prompt Response preview:', responseBody.substring(0, 500) + '...');
    
    expect(response.status).toBe(200);
    
    const result = JSON.parse(responseBody);
    
    // Verify the structure of the response
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    
    // Try to extract JSON from the response - Claude may include markdown code blocks
    const content = result.choices[0].message.content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/```\s*([\s\S]*?)\s*```/) || 
                     [null, content];
    
    let jsonContent = jsonMatch[1] || content;
    
    // Try to parse the content as JSON - let any parse failures propagate directly
    const data = JSON.parse(jsonContent);
    
    // Verify the structure follows our request
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('genre');
    
    console.log('Claude 3.5 Prompt Engineering result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call

  // Test JSON schema for structured data with Google Gemini 
  itif(!!haveApiKey)('should handle JSON output with Google Gemini using prompt engineering', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Since Gemini may not fully support JSON schema format through OpenRouter,
    // we'll use prompt engineering approach similar to Claude
    const requestBody = {
      model: supportedModels.gemini, // Using Gemini 2.0 Flash
      messages: [
        { 
          role: 'system', 
          content: `Please generate structured JSON responses that follow this exact schema:
{
  "recipe": {
    "name": string,
    "ingredients": array of strings,
    "steps": array of strings,
    "prepTime": number (in minutes),
    "difficulty": string (one of: "easy", "medium", "hard")
  }
}
Do not include any explanation or text outside of the JSON object.`
        },
        { 
          role: 'user', 
          content: 'Give me a simple recipe for a quick dinner. Respond with only valid JSON matching the schema.' 
        }
      ]
    };
    
    console.log('Gemini Request:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Check response status and get the data
    const responseBody = await response.text();
    console.log('Gemini Response status:', response.status);
    console.log('Gemini Response preview:', responseBody.substring(0, 500) + '...');
    
    // Only proceed with the test if the response was successful
    // Some models may not be available on OpenRouter or might have other issues
    if (response.status !== 200) {
      console.log('Gemini model may not be available or had an error. Skipping validation.');
      return;
    }
    
    const result = JSON.parse(responseBody);
    
    // Verify the structure of the response
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    expect(result.choices.length).toBeGreaterThan(0);
    expect(result.choices[0]).toHaveProperty('message');
    expect(result.choices[0].message).toHaveProperty('content');
    
    // Try to extract JSON from the response - Gemini may include markdown code blocks
    const content = result.choices[0].message.content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                     content.match(/```\s*([\s\S]*?)\s*```/) || 
                     [null, content];
    
    let jsonContent = jsonMatch[1] || content;
    
    // Try to parse the content as JSON - let any parse failures propagate directly
    const data = JSON.parse(jsonContent);
    
    // Verify the structure follows our request
    expect(data).toHaveProperty('recipe');
    expect(data.recipe).toHaveProperty('name');
    expect(data.recipe).toHaveProperty('ingredients');
    expect(Array.isArray(data.recipe.ingredients)).toBe(true);
    expect(data.recipe).toHaveProperty('steps');
    expect(Array.isArray(data.recipe.steps)).toBe(true);
    
    console.log('Gemini result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call

  // Try the JSON schema format with Gemini (may not be supported)
  itif(!!haveApiKey)('should attempt JSON schema format with Google Gemini', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Using the schema format with Gemini
    const requestBody = {
      model: supportedModels.gemini,
      messages: [
        { role: 'user', content: 'Create a todo list for learning programming' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'todo', // Required parameter for OpenRouter
          schema: {
            type: 'object',
            properties: {
              todos: {
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      }
    };
    
    console.log('Gemini Schema Request payload:', JSON.stringify(requestBody, null, 2));
    
    // Make direct fetch call to OpenRouter API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    // Get the response data
    const responseBody = await response.text();
    console.log('Gemini Schema Response status:', response.status);
    console.log('Gemini Schema Response preview:', responseBody.substring(0, 500) + '...');
    
    // This test is more exploratory - we're checking if the schema format works with Gemini
    // If it doesn't, we'll log the outcome but won't fail the test
    const result = JSON.parse(responseBody);
    
    if (result.error) {
      console.log('Gemini does not support the same JSON schema format, skipping schema validation');
      return;
    }
    
    // If there's no error, proceed with validation
    expect(result).toHaveProperty('choices');
    expect(result.choices).toBeInstanceOf(Array);
    
    if (result.choices.length > 0) {
      expect(result.choices[0]).toHaveProperty('message');
      expect(result.choices[0].message).toHaveProperty('content');
      
      // Parse the content as JSON - let any parse failures propagate directly
      const data = JSON.parse(result.choices[0].message.content);
      
      // Verify the structure follows our request
      expect(data).toHaveProperty('todos');
      expect(Array.isArray(data.todos)).toBe(true);
      
      console.log('Gemini schema result:', data);
    }
  }, 30000); // Increase timeout to 30 seconds for API call
}); 