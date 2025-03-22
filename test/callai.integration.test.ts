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
        
        for await (const chunk of generator) {
          if (chunkCount < 3) {
            debugChunks.push(chunk); // Store first few chunks for debugging
          }
          lastChunk = chunk;
          chunkCount++;
        }
        
        console.log(`${modelName} - First few chunks:`, debugChunks);
        console.log(`${modelName} - Complete response:`, lastChunk);
        console.log(`${modelName} - Total chunks received: ${chunkCount}`);
        
        // For OpenAI with strict schema, it might not yield chunks
        // if (modelName === 'openAI' && chunkCount === 0) {
        //   console.log(`Note: OpenAI streaming yielded 0 chunks with strict schema validation`);
        // } else {
          // Verify we received at least one chunk for other models
          expect(chunkCount).toBeGreaterThan(0);
          console.log(`${modelName} streaming test - received chunks:`, chunkCount);
        // }
        
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
          
          // Verify the structure allows for variations in field names
          const hasLocation = data.hasOwnProperty('location');
          expect(hasLocation).toBe(true);
          
          // Check for temperature (models might use current_temp, _temp, temperature, etc.)
          const hasTemp = data.hasOwnProperty('current_temp') || 
                          data.hasOwnProperty('_temp') || 
                          data.hasOwnProperty('temperature');
          expect(hasTemp).toBe(true);
          
          // Check for weather conditions
          const hasConditions = data.hasOwnProperty('conditions') || 
                               data.hasOwnProperty('weather');
          expect(hasConditions).toBe(true);
          
          // Check for tomorrow forecast
          const hasTomorrow = data.hasOwnProperty('tomorrow') || 
                             data.hasOwnProperty('forecast');
          expect(hasTomorrow).toBe(true);
          
          // Get the tomorrow object (or equivalent)
          const tomorrow = data.tomorrow || data.forecast;
          expect(typeof tomorrow).toBe('object');
          
          // The tomorrow object should have high/low temp and conditions
          // but field names might vary
          if (tomorrow) {
            const hasHigh = tomorrow.hasOwnProperty('high') || 
                          tomorrow.hasOwnProperty('high_temp');
            const hasLow = tomorrow.hasOwnProperty('low') || 
                         tomorrow.hasOwnProperty('low_temp');
            const hasForecast = tomorrow.hasOwnProperty('conditions') || 
                              tomorrow.hasOwnProperty('weather');
                              
            // Only verify if the tomorrow field exists (as some models might omit it)
            if (Object.keys(tomorrow).length > 0) {
              expect(hasHigh || hasLow || hasForecast).toBe(true);
            }
          }
          
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