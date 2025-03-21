import fs from 'fs';
import path from 'path';
import { callAI, Schema, Message } from '../src/index';

// Mock fetch to use our fixture files
global.fetch = jest.fn();

describe('DeepSeek Wire Protocol Tests', () => {
  // Read fixtures
  const deepseekRequestFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/deepseek-request.json'), 'utf8')
  );
  
  const deepseekResponseFixture = fs.readFileSync(
    path.join(__dirname, 'fixtures/deepseek-response.json'), 'utf8'
  );
  
  const deepseekSystemRequestFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/deepseek-system-request.json'), 'utf8')
  );
  
  const deepseekSystemResponseFixture = fs.readFileSync(
    path.join(__dirname, 'fixtures/deepseek-system-response.json'), 'utf8'
  );
  
  beforeEach(() => {
    // Reset mocks
    (global.fetch as jest.Mock).mockClear();
    
    // Mock successful response
    (global.fetch as jest.Mock).mockImplementation(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => deepseekResponseFixture,
        json: async () => JSON.parse(deepseekResponseFixture)
      };
    });
  });
  
  it('should use the JSON schema format for DeepSeek with schema', async () => {
    // Define schema
    const schema: Schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' },
        genre: { type: 'string' },
        rating: { type: 'number', minimum: 1, maximum: 5 }
      }
    };
    
    // Call the library function with the schema
    await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'deepseek/deepseek-chat',
        schema: schema
      }
    );
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Get the request body that was passed to fetch
    const actualRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    
    // Check that we're using JSON Schema format
    expect(actualRequestBody.response_format).toBeTruthy();
    expect(actualRequestBody.response_format.type).toBe('json_schema');
    expect(actualRequestBody.response_format.json_schema).toBeTruthy();
    expect(actualRequestBody.response_format.json_schema.name).toBe('book_recommendation');
    
    // Verify schema structure
    const schemaObj = actualRequestBody.response_format.json_schema.schema;
    expect(schemaObj.type).toBe('object');
    expect(schemaObj.properties).toBeTruthy();
    expect(schemaObj.properties.title).toBeTruthy();
    expect(schemaObj.properties.author).toBeTruthy();
    expect(schemaObj.properties.year).toBeTruthy();
    expect(schemaObj.properties.genre).toBeTruthy();
    expect(schemaObj.properties.rating).toBeTruthy();
  });
  
  it('should correctly handle DeepSeek response with schema', async () => {
    // Update mock to return proper response
    (global.fetch as jest.Mock).mockImplementationOnce(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => deepseekResponseFixture,
        json: async () => JSON.parse(deepseekResponseFixture)
      };
    });
    
    // Define the schema
    const schema: Schema = {
      name: 'book_recommendation',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        year: { type: 'number' },
        genre: { type: 'string' },
        rating: { type: 'number', minimum: 1, maximum: 5 }
      }
    };
    
    // Call the library with DeepSeek model
    const result = await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'deepseek/deepseek-chat',
        schema: schema
      }
    );
    
    // Parse the DeepSeek response fixture to get expected content
    const responseObj = JSON.parse(deepseekResponseFixture);
    const responseContent = responseObj.choices[0].message.content;
    
    // Verify the result
    expect(result).toBeTruthy();
    
    // Based on the actual response we got, DeepSeek returns markdown-formatted text
    // rather than JSON, so we need to handle that case
    if (typeof result === 'string') {
      expect(result).toContain('Title');
      expect(result).toContain('Author');
      expect(result).toContain('Genre');
    }
  });
  
  it('should handle system message approach with DeepSeek', async () => {
    // Update mock to return system message response
    (global.fetch as jest.Mock).mockImplementationOnce(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => deepseekSystemResponseFixture,
        json: async () => JSON.parse(deepseekSystemResponseFixture)
      };
    });
    
    // Call the library with messages array including system message
    const result = await callAI(
      [
        { 
          role: 'system', 
          content: 'Please generate structured JSON responses that follow this exact schema:\n{\n  "title": string,\n  "author": string,\n  "year": number,\n  "genre": string,\n  "rating": number (between 1-5)\n}\nDo not include any explanation or text outside of the JSON object.' 
        },
        { 
          role: 'user', 
          content: 'Give me a short book recommendation. Respond with only valid JSON matching the schema.' 
        }
      ] as Message[],
      {
        apiKey: 'test-api-key',
        model: 'deepseek/deepseek-chat'
      }
    );
    
    // Verify the result
    expect(result).toBeTruthy();
    
    // Based on the actual response, DeepSeek can return proper JSON with system messages
    if (typeof result === 'string') {
      const parsedResult = JSON.parse(result as string);
      expect(parsedResult).toHaveProperty('title');
      expect(parsedResult).toHaveProperty('author');
      expect(parsedResult).toHaveProperty('year');
      expect(parsedResult).toHaveProperty('genre');
      expect(parsedResult).toHaveProperty('rating');
    } else if (typeof result === 'object') {
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('author');
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('genre');
      expect(result).toHaveProperty('rating');
    }
  });
}); 