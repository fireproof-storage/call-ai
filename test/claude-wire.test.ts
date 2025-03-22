import fs from 'fs';
import path from 'path';
import { callAI, Schema, Message } from '../src/index';

// Mock fetch to use our fixture files
global.fetch = jest.fn();

describe('Claude Wire Protocol Tests', () => {
  // Read fixtures
  const claudeSystemRequestFixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/claude-system-request.json'), 'utf8')
  );
  
  const claudeSystemResponseFixture = fs.readFileSync(
    path.join(__dirname, 'fixtures/claude-system-response.json'), 'utf8'
  );
  
  beforeEach(() => {
    // Reset mocks
    (global.fetch as jest.Mock).mockClear();
    
    // Mock successful response
    (global.fetch as jest.Mock).mockImplementation(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => claudeSystemResponseFixture,
        json: async () => JSON.parse(claudeSystemResponseFixture)
      };
    });
  });
  
  it('should use the system message approach for Claude with schema', async () => {
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
        model: 'anthropic/claude-3-sonnet',
        schema: schema
      }
    );
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Get the request body that was passed to fetch
    const actualRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    
    // Check that we're using the system message approach by default
    expect(actualRequestBody.messages).toBeTruthy();
    expect(actualRequestBody.messages.length).toBeGreaterThanOrEqual(1);
    
    // Verify first message is a system message with schema info
    const firstMessage = actualRequestBody.messages[0];
    expect(firstMessage.role).toBe('system');
    expect(firstMessage.content).toContain('title');
    expect(firstMessage.content).toContain('author');
    expect(firstMessage.content).toContain('year');
    expect(firstMessage.content).toContain('rating');
    
    // Verify user message is included
    const userMessage = actualRequestBody.messages.find((m: any) => m.role === 'user');
    expect(userMessage).toBeTruthy();
    expect(userMessage.content).toBe('Give me a short book recommendation in the requested format.');
    
    // Claude with schema by default should NOT use response_format
    expect(actualRequestBody.response_format).toBeUndefined();
  });
  
  it('should use native tool mode with Claude for schema handling', async () => {
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
    
    // Call the library function with schema
    await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'anthropic/claude-3-sonnet',
        schema: schema
      }
    );
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Get the request body that was passed to fetch
    const actualRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    
    // Claude should use tool mode for schema handling
    expect(actualRequestBody.tools).toBeTruthy();
    expect(actualRequestBody.tool_choice).toBeTruthy();
    expect(actualRequestBody.tools[0].name).toBe('book_recommendation');
    expect(actualRequestBody.tools[0].input_schema).toBeTruthy();
    expect(actualRequestBody.tools[0].input_schema.properties.title).toBeTruthy();
  });
  
  it('should handle Claude JSON response correctly', async () => {
    // Override the mock for this specific test to use the different response
    (global.fetch as jest.Mock).mockImplementationOnce(async (url, options) => {
      return {
        ok: true,
        status: 200,
        text: async () => claudeSystemResponseFixture,
        json: async () => JSON.parse(claudeSystemResponseFixture)
      };
    });
    
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
    
    // Call the library with Claude model
    const result = await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'anthropic/claude-3-sonnet',
        schema: schema
      }
    );
    
    // Claude might return content with code blocks, additional text, etc.
    if (typeof result === 'string') {
      const responseText = result as string;
      
      // Handle different response formats that Claude might return
      let jsonData;
      
      // First try direct JSON parse
      try {
        jsonData = JSON.parse(responseText);
      } catch (e) {
        // If that fails, try to extract JSON from markdown or text
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                        responseText.match(/```\s*([\s\S]*?)\s*```/) || 
                        responseText.match(/\{[\s\S]*\}/);
                        
        if (jsonMatch) {
          const jsonContent = jsonMatch[0].replace(/```json|```/g, '').trim();
          try {
            jsonData = JSON.parse(jsonContent);
          } catch (innerError) {
            // If we still can't parse it, the test should fail
            fail(`Could not parse JSON from Claude response: ${responseText}`);
          }
        } else {
          fail(`No JSON found in Claude response: ${responseText}`);
        }
      }
      
      // Now verify the JSON data
      expect(jsonData).toBeTruthy();
      expect(jsonData).toHaveProperty('title');
      expect(jsonData).toHaveProperty('author');
      expect(jsonData).toHaveProperty('year');
      expect(jsonData).toHaveProperty('genre');
      expect(jsonData).toHaveProperty('rating');
    } else if (typeof result === 'object') {
      // If it returns an object directly
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('author');
      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('genre');
      expect(result).toHaveProperty('rating');
    } else {
      fail(`Unexpected result type: ${typeof result}`);
    }
  });
  
  it('should correctly handle Claude response with schema', async () => {
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
    
    // Call the library with Claude model
    const result = await callAI(
      'Give me a short book recommendation in the requested format.',
      {
        apiKey: 'test-api-key',
        model: 'anthropic/claude-3-sonnet',
        schema: schema
      }
    );
    
    // Parse the Claude system message response fixture to get expected content
    const responseObj = JSON.parse(claudeSystemResponseFixture);
    const responseContent = responseObj.choices[0].message.content;
    const expectedData = JSON.parse(responseContent);
    
    // Verify the result
    expect(result).toBeTruthy();
    
    if (typeof result === 'string') {
      // If the result is a string, it should be valid JSON
      const parsed = JSON.parse(result as string);
      expect(parsed).toHaveProperty('title', 'The Little Prince');
      expect(parsed).toHaveProperty('author', 'Antoine de Saint-Exupéry');
      expect(parsed).toHaveProperty('year', 1943);
      expect(parsed).toHaveProperty('genre', 'Novella');
      expect(parsed).toHaveProperty('rating', 5);
    } else if (typeof result === 'object') {
      // If it returns an object directly
      expect(result).toHaveProperty('title', 'The Little Prince');
      expect(result).toHaveProperty('author', 'Antoine de Saint-Exupéry');
      expect(result).toHaveProperty('year', 1943);
      expect(result).toHaveProperty('genre', 'Novella');
      expect(result).toHaveProperty('rating', 5);
    }
  });
  
  it('should pass through system messages directly', async () => {
    // Call the library with messages array including system message
    const messages: Message[] = [
      { 
        role: 'system', 
        content: 'Please generate structured JSON responses that follow this exact schema:\n{\n  "title": string,\n  "author": string,\n  "year": number,\n  "genre": string,\n  "rating": number (between 1-5)\n}\nDo not include any explanation or text outside of the JSON object.' 
      },
      { 
        role: 'user', 
        content: 'Give me a short book recommendation. Respond with only valid JSON matching the schema.' 
      }
    ];
    
    await callAI(
      messages,
      {
        apiKey: 'test-api-key',
        model: 'anthropic/claude-3-sonnet'
      }
    );
    
    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalled();
    
    // Get the request body that was passed to fetch
    const actualRequestBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body
    );
    
    // Verify messages are passed through correctly
    expect(actualRequestBody.messages).toEqual(messages);
  });
  
  it('should correctly handle Claude response with system message', async () => {
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
        model: 'anthropic/claude-3-sonnet'
      }
    );
    
    // Verify the result
    expect(result).toBeTruthy();
    
    if (typeof result === 'string') {
      // If the result is a string, it should be valid JSON
      const parsed = JSON.parse(result as string);
      expect(parsed).toHaveProperty('title', 'The Little Prince');
      expect(parsed).toHaveProperty('author', 'Antoine de Saint-Exupéry');
      expect(parsed).toHaveProperty('year', 1943);
      expect(parsed).toHaveProperty('genre', 'Novella');
      expect(parsed).toHaveProperty('rating', 5);
    } else if (typeof result === 'object') {
      // If it returns an object directly
      expect(result).toHaveProperty('title', 'The Little Prince');
      expect(result).toHaveProperty('author', 'Antoine de Saint-Exupéry');
      expect(result).toHaveProperty('year', 1943);
      expect(result).toHaveProperty('genre', 'Novella');
      expect(result).toHaveProperty('rating', 5);
    }
  });
}); 