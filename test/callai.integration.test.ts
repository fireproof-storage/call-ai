import { callAI, Schema } from '../src/index';
import dotenv from 'dotenv';
const TIMEOUT = 30000;

// Load environment variables from .env file if present
dotenv.config();

jest.retryTimes(3, { logErrorsBeforeRetry: true });

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
            high_temp: { type: 'number' },
            low_temp: { type: 'number' },
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
          
          // Verify the structure matches our schema strictly
          expect(data).toHaveProperty('location');
          expect(data).toHaveProperty('current_temp');
          expect(data).toHaveProperty('conditions');
          expect(data).toHaveProperty('tomorrow');
          
          // Verify types
          expect(typeof data.location).toBe('string');
          expect(typeof data.current_temp).toBe('number');
          expect(typeof data.conditions).toBe('string');
          expect(typeof data.tomorrow).toBe('object');
          
          // Verify tomorrow object properties
          expect(data.tomorrow).toHaveProperty('high_temp');
          expect(data.tomorrow).toHaveProperty('low_temp');
          expect(data.tomorrow).toHaveProperty('conditions');
          expect(typeof data.tomorrow.high_temp).toBe('number');
          expect(typeof data.tomorrow.low_temp).toBe('number');
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

  // Debug test to compare system message vs json_schema approaches
  describe('Debug: System message vs JSON Schema comparison', () => {
    // Define a simple test schema
    const testSchema: Schema = {
      name: 'person',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        email: { type: 'string' }
      }
      // required: ['name', 'age', 'email']
    };

    // Test with Claude
    itif(!!haveApiKey)('should compare Claude with system message and json_schema approaches', async () => {
      const modelId = 'anthropic/claude-3-sonnet';
      
      console.log('===== CLAUDE: SYSTEM MESSAGE APPROACH =====');
      // Use system message approach with explicit system message
      const systemResult = await callAI(
        [
          { 
            role: 'system', 
            content: `Please generate structured JSON responses that follow this exact schema:
{
  "name": string,
  "age": number,
  "email": string
}
The name and age fields are required. The email field is optional.
Do not include any explanation or text outside of the JSON object.`
          },
          { 
            role: 'user', 
            content: 'Generate contact information for a fictional person using valid JSON.' 
          }
        ],
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: modelId
        }
      );
      
      console.log('Claude system message response:', systemResult);
      console.log('Response type:', typeof systemResult);
      
      // Try to parse the system message approach result
      try {
        const content = systemResult as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        const data = JSON.parse(jsonContent);
        console.log('Claude system message parsed result:', data);
      } catch (error) {
        console.error('Error parsing Claude system message response:', error);
      }
      
      console.log('===== CLAUDE: JSON SCHEMA APPROACH =====');
      // Use json_schema approach
      const schemaResult = await callAI(
        'Generate contact information for a fictional person.',
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: modelId,
          schema: testSchema
        }
      );
      
      console.log('Claude json_schema response:', schemaResult);
      console.log('Response type:', typeof schemaResult);
      
      // Try to parse the json_schema approach result
      try {
        const content = schemaResult as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        const data = JSON.parse(jsonContent);
        console.log('Claude json_schema parsed result:', data);
      } catch (error) {
        console.error('Error parsing Claude json_schema response:', error);
      }
    }, TIMEOUT);
    
    // Test with GPT-4o
    itif(!!haveApiKey)('should compare GPT-4o with system message and json_schema approaches', async () => {
      const modelId = 'openai/gpt-4o';
      
      console.log('===== GPT-4o: SYSTEM MESSAGE APPROACH =====');
      // Use system message approach with explicit system message
      const systemResult = await callAI(
        [
          { 
            role: 'system', 
            content: `Please generate structured JSON responses that follow this exact schema:
{
  "name": string,
  "age": number,
  "email": string
}
The name and age fields are required. The email field is optional.
Do not include any explanation or text outside of the JSON object.`
          },
          { 
            role: 'user', 
            content: 'Generate contact information for a fictional person using valid JSON.' 
          }
        ],
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: modelId
        }
      );
      
      console.log('GPT-4o system message response:', systemResult);
      console.log('Response type:', typeof systemResult);
      
      // Try to parse the system message approach result
      try {
        const content = systemResult as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        const data = JSON.parse(jsonContent);
        console.log('GPT-4o system message parsed result:', data);
      } catch (error) {
        console.error('Error parsing GPT-4o system message response:', error);
      }
      
      console.log('===== GPT-4o: JSON SCHEMA APPROACH =====');
      // Use json_schema approach
      const schemaResult = await callAI(
        'Generate contact information for a fictional person.',
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: modelId,
          schema: testSchema
        }
      );
      
      console.log('GPT-4o json_schema response:', schemaResult);
      console.log('Response type:', typeof schemaResult);
      
      // Try to parse the json_schema approach result
      try {
        const content = schemaResult as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) || 
                        [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        const data = JSON.parse(jsonContent);
        console.log('GPT-4o json_schema parsed result:', data);
      } catch (error) {
        console.error('Error parsing GPT-4o json_schema response:', error);
      }
    }, TIMEOUT);
  });

  // Test OpenAI models with tool mode
  describe('OpenAI with tool mode', () => {
    itif(!!haveApiKey)('should support tool mode with OpenAI models when enabled', async () => {
      // Define schema
      const schema: Schema = {
        name: 'book_recommendation',
        properties: {
          title: { type: 'string' },
          author: { type: 'string' },
          year: { type: 'number' },
          genre: { type: 'string' },
          rating: { type: 'number' }
        }
      };
      
      // Make API call with the useToolMode option
      const result = await callAI(
        'Give me a short book recommendation about science fiction.',
        {
          apiKey: process.env.CALLAI_API_KEY,
          model: supportedModels.openAI,
          schema: schema,
          useToolMode: true // Enable tool mode for OpenAI
        }
      );
      
      console.log('OpenAI tool mode result:', result);
      
      // Check if we got an error response
      if (typeof result === 'string' && result.includes('"error"')) {
        const parsed = JSON.parse(result);
        // Skip the test if the API doesn't support tool mode yet
        if (parsed.error && parsed.error.message && parsed.error.message.includes('tool')) {
          console.log('OpenAI tool mode not supported by this model yet, skipping validation');
          return;
        }
        throw new Error(`API returned an error response: ${result}`);
      }
      
      // Verify the data structure, whether it came from tool mode or json_schema
      if (typeof result === 'string') {
        const parsed = JSON.parse(result);
        expect(parsed).toHaveProperty('title');
        expect(parsed).toHaveProperty('author');
        expect(parsed).toHaveProperty('year');
        expect(parsed).toHaveProperty('genre');
        expect(parsed).toHaveProperty('rating');
      }
    }, TIMEOUT);
  });
}); 