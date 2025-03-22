import { callAI, Schema } from '../src/index';
import dotenv from 'dotenv';
const TIMEOUT = 30000;

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it.concurrent : it.skip;

// Test models based on the OpenRouter documentation
const supportedModels = {
  openAI: 'openai/gpt-4o-mini',
  claude: 'anthropic/claude-3-sonnet',
  gemini: 'google/gemini-2.0-flash-001',
  llama3: 'meta-llama/llama-3.3-70b-instruct',
  deepseek: 'deepseek/deepseek-chat',
  gpt4turbo: 'openai/gpt-4-turbo'
};

// Define the model names as an array for looping
const modelEntries = Object.entries(supportedModels);

describe('callAI integration tests', () => {
  
  // Test basic schema with all models
  describe('Schema-based structured data generation', () => {
    // Define the todo list schema
    const todoSchema: Schema = {
      name: 'todo',
      properties: {
        todos: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    };
    
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should generate structured todo list data with ${modelName} model`, async () => {
        // Make the API call with structured output
        const result = await callAI(
          'Create a todo list for learning programming', 
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId,
            schema: todoSchema
          }
        );
        
        console.log(`${modelName} response:`, result);
        
        // Check if we got an error response
        if (typeof result === 'string' && result.includes('"error"')) {
          throw new Error(`API returned an error response: ${result}`);
        }
        
        // Extract JSON if wrapped in code blocks (for Claude and Gemini)
        const content = result as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        
        // Parse the result and validate the structure - let any JSON parse errors propagate
        const data = JSON.parse(jsonContent);
        
        // Verify the structure matches our schema
        expect(data).toHaveProperty('todos');
        expect(Array.isArray(data.todos)).toBe(true);
        expect(data.todos.length).toBeGreaterThan(0);
        
        // Log the result for manual inspection
        console.log(`${modelName} structured data result:`, data);
      }, TIMEOUT); // Increase timeout to 30 seconds for API call
    });
  });
  
  // Test complex schema with all models
  describe('Complex schema handling', () => {
    // Define book recommendation schema
    const bookSchema: Schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' },
        genre: { type: 'string' },
        rating: { type: 'number' }
      }
    };
    
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should format book recommendation schema correctly for ${modelName}`, async () => {
        // Make the API call with structured output
        const result = await callAI(
          'Give me a short book recommendation in the requested format.', 
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId,
            schema: bookSchema
          }
        );
        
        console.log(`${modelName} book recommendation response:`, result);
        
        // Check if we got an error response
        if (typeof result === 'string' && result.includes('"error"')) {
          throw new Error(`API returned an error response: ${result}`);
        }
        
        // Extract JSON if wrapped in code blocks (for Claude and Gemini)
        const content = result as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        
        // Parse the result and validate the structure - let any JSON parse errors propagate
        const data = JSON.parse(jsonContent);
        
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
        
        // Log the result for manual inspection
        console.log(`${modelName} book recommendation result:`, data);
      }, TIMEOUT); // Increase timeout to 30 seconds for API call
    });
  });
  
  // Test streaming with all models
  describe('Streaming support', () => {
    // Define weather forecast schema
    const weatherSchema: Schema = {
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
    
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should handle streaming with ${modelName} model`, async () => {
        // For OpenAI models in the test, provide a valid dummy result to test the parsing logic
        // This is needed because the API requires authentication and we want to test the parsing logic
        
        console.log(`Starting streaming test for model: ${modelName} (${modelId})`);
        
        // Add direct fetch test before callAI test
        console.log(`Testing direct fetch for ${modelName} first`);
        const apiKey = process.env.CALLAI_API_KEY;
        const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        
        // Create the same payload that callAI would use
        const requestBody = {
          model: modelId, 
          stream: true,
          messages: [
            { role: 'user', content: 'Give me a weather forecast for New York in the requested format.' }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: weatherSchema.name,
              schema: {
                type: 'object',
                properties: weatherSchema.properties,
                required: Object.keys(weatherSchema.properties),
                additionalProperties: false
              }
            }
          }
        };
        
        console.log(`Direct fetch payload for ${modelName}:`, JSON.stringify(requestBody, null, 2));
        
        // Make direct fetch call
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log(`Direct fetch response status for ${modelName}:`, response.status);
        
        // Process streaming response directly
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let directFetchChunks = 0;
        let allText = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          console.log(`Direct fetch chunk for ${modelName}:`, chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''));
          
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              if (line.includes('[DONE]')) continue;
              
              try {
                const json = JSON.parse(line.replace('data: ', ''));
                const content = json.choices?.[0]?.delta?.content || '';
                allText += content;
                directFetchChunks++;
              } catch (e) {
                console.error(`Error parsing direct fetch chunk for ${modelName}:`, e);
              }
            }
          }
        }
        
        console.log(`Direct fetch received ${directFetchChunks} chunks for ${modelName}`);
        console.log(`Direct fetch final text for ${modelName}:`, allText);
        
        // Make the API call with streaming and structured output
        const generator = callAI(
          'Give me a weather forecast for New York in the requested format.', 
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId,
            schema: weatherSchema,
            stream: true
          }
        ) as AsyncGenerator<string, string, unknown>;
        
        // Collect all chunks
        let lastChunk = '';
        let chunkCount = 0;
        let debugChunks: string[] = [];
        
        // Log before looping through chunks
        console.log(`${modelName} - Starting to collect chunks`);
        
        for await (const chunk of generator) {
          console.log(`${modelName} - Received chunk ${chunkCount}:`, chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''));
          if (chunkCount < 3) {
            debugChunks.push(chunk); // Store first few chunks for debugging
          }
          lastChunk = chunk;
          chunkCount++;
        }
        
        console.log(`${modelName} - First few chunks:`, debugChunks);
        console.log(`${modelName} - Complete response:`, lastChunk);
        console.log(`${modelName} - Total chunks received: ${chunkCount}`);
        
        // Verify we received at least one chunk
        expect(chunkCount).toBeGreaterThan(0);
        console.log(`${modelName} streaming test - received chunks:`, chunkCount);
        
        // Only try to parse JSON if we have actual content
        if (lastChunk && lastChunk.trim() !== '') {
          // Extract JSON if wrapped in code blocks (for Claude and Gemini)
          const content = lastChunk;
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                          content.match(/```\s*([\s\S]*?)\s*```/) || 
                          [null, content];
          
          const jsonContent = jsonMatch[1] || content;
          
          // Parse the final result and validate - let any JSON parse errors propagate
          const data = JSON.parse(jsonContent);
          
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
          
          console.log(`${modelName} streaming test result:`, data);
        } else {
          throw new Error(`No valid content received from ${modelName} streaming`);
        }
      }, TIMEOUT);
    });
  });
  
  // Test system message approach
  describe('System message structured output', () => {
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should generate structured data with ${modelName} using system message`, async () => {
        // Using messages array with system message for structured output
        const result = await callAI(
          [
            { 
              role: 'system', 
              content: `Please generate structured JSON responses that follow this exact schema:
{
  "title": string,
  "author": string,
  "year": number,
  "genre": string,
  "rating": number
}
Do not include any explanation or text outside of the JSON object.`
            },
            { 
              role: 'user', 
              content: 'Give me a short book recommendation. Respond with only valid JSON matching the schema.' 
            }
          ],
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId
          }
        );
        
        console.log(`${modelName} system message response:`, result);
        
        // Extract JSON from response - Models may include markdown code blocks
        const content = result as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        let jsonContent = jsonMatch[1] || content;
        
        // Parse the result and validate - let any JSON parse errors propagate
        const data = JSON.parse(jsonContent);
        
        // Verify the structure follows our request
        expect(data).toHaveProperty('title');
        expect(data).toHaveProperty('author');
        expect(data).toHaveProperty('genre');
        
        // Log the result for manual inspection
        console.log(`${modelName} system message result:`, data);
      }, TIMEOUT); // Increase timeout to 30 seconds for API call
    });
  });
}); 