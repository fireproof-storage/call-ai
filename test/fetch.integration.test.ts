import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

describe('OpenRouter API wire protocol tests', () => {
  // This test will be skipped if no API key is available
  itif(!!haveApiKey)('should validate the exact OpenRouter schema format', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Create payload with the exact format from OpenRouter docs
    const requestBody = {
      model: 'openai/gpt-4o', // Using gpt-4o as mentioned in current docs
      messages: [
        { role: 'user', content: 'Create a todo list for learning programming' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'todo',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              todos: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['todos'],
            additionalProperties: false
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
    console.log('Response body:', responseBody);
    
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
      model: 'openai/gpt-4o', // Using gpt-4o which supports structured output
      messages: [
        { role: 'user', content: 'Give me a short book recommendation in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'book_recommendation',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              author: { type: 'string' },
              year: { type: 'number' },
              genre: { type: 'string' },
              rating: { type: 'number', minimum: 1, maximum: 5 }
            },
            required: ['title', 'author', 'genre']
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
    console.log('Response body:', responseBody);
    
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
  
  itif(!!haveApiKey)('should handle streaming with our schema format', async () => {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Use our standard schema format for the implementation
    const requestBody = {
      model: 'openai/gpt-4o', // Using gpt-4o which supports structured output
      stream: true,
      messages: [
        { role: 'user', content: 'Give me a weather forecast for New York in the requested format.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'weather_forecast',
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
            },
            required: ['location', 'current_temp', 'conditions', 'tomorrow']
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
}); 