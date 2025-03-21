import { callAI, Schema } from '../src/index';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => condition ? it : it.skip;

describe('callAI integration tests', () => {
  // This test will be skipped if no API key is available
  itif(!!haveApiKey)('should generate structured data with default model', async () => {
    // Define a schema for a book recommendation
    const schema: Schema = {
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        genre: { type: 'string' },
        summary: { type: 'string', maxLength: 200 },
        rating: { type: 'number', minimum: 1, maximum: 5 }
      },
      required: ['title', 'author', 'genre', 'summary', 'rating']
    };
    
    // Make the API call with structured output
    const result = await callAI(
      'Recommend a science fiction book and provide a brief summary.', 
      {
        apiKey: process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY,
        schema: schema
      }
    );
    
    // Parse the result and validate the structure
    const data = JSON.parse(result as string);
    
    // Verify the structure matches our schema
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('author');
    expect(data).toHaveProperty('genre');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('rating');
    
    // Verify constraints
    expect(typeof data.title).toBe('string');
    expect(typeof data.author).toBe('string');
    expect(typeof data.genre).toBe('string');
    expect(typeof data.summary).toBe('string');
    expect(typeof data.rating).toBe('number');
    expect(data.summary.length).toBeLessThanOrEqual(200);
    expect(data.rating).toBeGreaterThanOrEqual(1);
    expect(data.rating).toBeLessThanOrEqual(5);
    
    // Log the result for manual inspection
    console.log('Integration test result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call
  
  itif(!!haveApiKey)('should generate structured data with streaming', async () => {
    // Define a schema for a weather forecast
    const schema: Schema = {
      properties: {
        location: { type: 'string' },
        temperature: { type: 'number' },
        conditions: { type: 'string' },
        forecast: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string' },
              high: { type: 'number' },
              low: { type: 'number' },
              description: { type: 'string' }
            }
          }
        }
      }
    };
    
    // Make the API call with streaming and structured output
    const generator = callAI(
      'Provide a 3-day weather forecast for San Francisco.', 
      {
        apiKey: process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY,
        schema: schema,
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
    
    // Parse the final result and validate
    const data = JSON.parse(lastChunk);
    
    // Basic structure validation
    expect(data).toHaveProperty('location');
    expect(data).toHaveProperty('temperature');
    expect(data).toHaveProperty('conditions');
    expect(data).toHaveProperty('forecast');
    
    // Verify forecast is an array with expected length
    expect(Array.isArray(data.forecast)).toBe(true);
    expect(data.forecast.length).toBeGreaterThanOrEqual(1);
    
    // Verify types
    expect(typeof data.location).toBe('string');
    expect(typeof data.temperature).toBe('number');
    expect(typeof data.conditions).toBe('string');
    
    // Verify we received multiple chunks
    expect(chunkCount).toBeGreaterThan(1);
    
    console.log('Integration test streaming - received chunks:', chunkCount);
    console.log('Integration test streaming result:', data);
  }, 30000); // Increase timeout to 30 seconds for API call
}); 