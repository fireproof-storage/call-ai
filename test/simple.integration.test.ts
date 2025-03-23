import { callAI } from '../src/index';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Configure retry settings for flaky tests
jest.retryTimes(3, { logErrorsBeforeRetry: true });

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it.concurrent : it.skip;

// Timeout for tests
const TIMEOUT = 30000;

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

describe('Simple callAI integration tests', () => {
  // Test basic non-structured requests with all models
  describe('Non-structured text generation', () => {
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      // Test without streaming
      itif(!!haveApiKey)(`should generate text with ${modelName} model without streaming`, async () => {
        // Make a simple non-structured API call
        const result = await callAI(
          'Write a short joke about programming.',
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId
          }
        );
        
        // Verify response
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect((result as string).length).toBeGreaterThan(10);
      }, TIMEOUT);
      
      // Test with streaming
      itif(!!haveApiKey)(`should generate text with ${modelName} model with streaming`, async () => {
        // Make a simple non-structured API call with streaming
        const generator = callAI(
          'Write a short joke about programming.',
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId,
            stream: true
          }
        ) as AsyncGenerator<string, string, unknown>;
        
        // Collect all chunks
        let lastChunk = '';
        let chunkCount = 0;
        
        for await (const chunk of generator) {
          lastChunk = chunk;
          chunkCount++;
        }
        
        // Verify streaming response
        expect(chunkCount).toBeGreaterThan(0);
        expect(lastChunk).toBeTruthy();
        expect(lastChunk.length).toBeGreaterThan(10);
      }, TIMEOUT);
    });
  });

  // Test with message array input format
  describe('Message array input format', () => {
    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should handle message array input with ${modelName} model`, async () => {
        // Make the API call with message array
        const result = await callAI(
          [
            { role: 'system', content: 'You are a helpful and concise assistant.' },
            { role: 'user', content: 'What is the capital of France?' }
          ],
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId
          }
        );
        
        // Verify response contains the expected answer
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
        expect((result as string).toLowerCase()).toContain('paris');
      }, TIMEOUT);
    });
  });

  // Test basic schema functionality
  describe('Basic schema support', () => {
    // Define a simple schema
    const simpleSchema = {
      name: 'country',
      properties: {
        name: { type: 'string' },
        capital: { type: 'string' },
        population: { type: 'number' }
      }
    };

    // Loop through each model
    modelEntries.forEach(([modelName, modelId]) => {
      itif(!!haveApiKey)(`should generate structured data with ${modelName} model using schema`, async () => {
        // Make the API call with schema
        const result = await callAI(
          'Provide information about France.',
          {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId,
            schema: simpleSchema
          }
        );
        
        // Extract JSON if wrapped in code blocks
        const content = result as string;
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/```\s*([\s\S]*?)\s*```/) || 
                       [null, content];
        
        const jsonContent = jsonMatch[1] || content;
        
        // Parse and verify the result
        const data = JSON.parse(jsonContent);
        expect(data).toHaveProperty('name');
        expect(data).toHaveProperty('capital');
        expect(data).toHaveProperty('population');
        expect(typeof data.name).toBe('string');
        expect(typeof data.capital).toBe('string');
        expect(typeof data.population).toBe('number');
        expect(data.name.toLowerCase()).toContain('france');
        expect(data.capital.toLowerCase()).toContain('paris');
      }, TIMEOUT);
    });
  });
}); 