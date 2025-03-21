import fs from 'fs';
import path from 'path';
import { callAI, Schema, Message } from '../src/index';

// Mock fetch to use our fixture files
global.fetch = jest.fn();

describe('Llama3 Wire Protocol Tests', () => {
  // Read fixtures
  const llama3RequestFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/llama3-request.json'), 'utf8')
  );
  
  const llama3ResponseFixture = fs.readFileSync(
    path.join(__dirname, 'fixtures/llama3-response.json'), 'utf8'
  );
  
  const llama3SystemRequestFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/llama3-system-request.json'), 'utf8')
  );
  
  const llama3SystemResponseFixture = fs.readFileSync(
    path.join(__dirname, 'fixtures/llama3-system-response.json'), 'utf8'
  );
  
  beforeEach(() => {
    // Reset mocks
    (global.fetch as jest.Mock).mockClear();
    
    // Mock successful response
    (global.fetch as jest.Mock).mockImplementation(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => llama3ResponseFixture,
        json: async () => JSON.parse(llama3ResponseFixture)
      };
    });
  });
  
  it('should use the JSON schema format for Llama3 with schema', async () => {
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
        model: 'meta-llama/llama-3.3-70b-instruct',
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
  
  it('should correctly handle Llama3 response with schema', async () => {
    // Update mock to return proper response
    (global.fetch as jest.Mock).mockImplementationOnce(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => llama3ResponseFixture,
        json: async () => JSON.parse(llama3ResponseFixture)
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
    
    // Call the library with Llama3 model
    const result = await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'meta-llama/llama-3.3-70b-instruct',
        schema: schema
      }
    );
    
    // Parse the Llama3 response fixture to get expected content
    const responseObj = JSON.parse(llama3ResponseFixture);
    const responseContent = responseObj.choices[0].message.content;
    
    // Verify the result
    expect(result).toBeTruthy();
    
    // Based on the actual response we got, Llama3 returns markdown-formatted text
    // rather than JSON, so we need to handle that case
    if (typeof result === 'string') {
      expect(result).toContain('Title');
      expect(result).toContain('Author');
      expect(result).toContain('Genre');
    }
  });
  
  it('should handle system message approach with Llama3', async () => {
    // Update mock to return system message response
    (global.fetch as jest.Mock).mockImplementationOnce(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => llama3SystemResponseFixture,
        json: async () => JSON.parse(llama3SystemResponseFixture)
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
        model: 'meta-llama/llama-3.3-70b-instruct'
      }
    );
    
    // Verify the result
    expect(result).toBeTruthy();
    
    // Based on the actual response, Llama3 can return proper JSON with system messages
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