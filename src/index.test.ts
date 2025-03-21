import { callAI, Message, Schema } from './index';

// Mock global fetch
global.fetch = jest.fn();

// Simple mock for TextDecoder
global.TextDecoder = jest.fn().mockImplementation(() => ({
  decode: jest.fn((value) => {
    // Basic mock implementation without recursion
    if (value instanceof Uint8Array) {
      // Convert the Uint8Array to a simple string
      return Array.from(value)
        .map(byte => String.fromCharCode(byte))
        .join('');
    }
    return '';
  })
}));

// Mock ReadableStream
const mockReader = {
  read: jest.fn()
};

const mockResponse = {
  json: jest.fn(),
  body: {
    getReader: jest.fn().mockReturnValue(mockReader)
  }
};

describe('callAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
  });

  it('should handle API key requirement for non-streaming', async () => {
    mockResponse.json.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    
    const result = await callAI('Hello, AI');
    expect(result).toBe("Sorry, I couldn't process that request.");
  });

  it('should handle API key requirement for streaming', async () => {
    mockReader.read.mockResolvedValueOnce({ done: true });
    const generator = callAI('Hello, AI', { stream: true }) as AsyncGenerator;
    
    const result = await generator.next();
    expect(result.value).toBe("Sorry, I couldn't process that request.");
  });

  it('should make POST request with correct parameters for non-streaming', async () => {
    const prompt = 'Hello, AI';
    const options = {
      apiKey: 'test-api-key',
      model: 'test-model',
      temperature: 0.7
    };

    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: 'Hello, I am an AI' } }]
    });
    
    await callAI(prompt, options);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json'
        }
      })
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello, AI' }]);
    expect(body.temperature).toBe(0.7);
    expect(body.stream).toBe(false);
  });

  it('should make POST request with correct parameters for streaming', async () => {
    const prompt = 'Hello, AI';
    const options = {
      apiKey: 'test-api-key',
      model: 'test-model',
      temperature: 0.7,
      stream: true
    };

    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI(prompt, options) as AsyncGenerator;
    await generator.next();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello, AI' }]);
    expect(body.temperature).toBe(0.7);
    expect(body.stream).toBe(true);
  });

  it('should handle message array for prompt', async () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' }
    ];
    const options = { apiKey: 'test-api-key', stream: true };

    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI(messages, options) as AsyncGenerator;
    await generator.next();

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages).toEqual(messages);
  });

  it('should handle schema parameter correctly', async () => {
    const schema: Schema = {
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    };
    
    const options = { 
      apiKey: 'test-api-key', 
      stream: true,
      schema: schema
    };
    
    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI('Get user info', options) as AsyncGenerator;
    await generator.next();

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.required).toEqual(['name']);
  });

  it('should handle schema parameter matching documentation example', async () => {
    const todoSchema: Schema = {
      properties: {
        todos: {
          type: "array",
          items: { type: "string" }
        }
      }
    };
    
    const options = { 
      apiKey: 'test-api-key',
      schema: todoSchema
    };
    
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: '{"todos": ["Learn React basics", "Build a simple app", "Master hooks"]}' } }]
    });
    
    const result = await callAI('Give me a todo list for learning React', options);
    expect(result).toBe('{"todos": ["Learn React basics", "Build a simple app", "Master hooks"]}');
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.properties).toEqual(todoSchema.properties);
  });

  it('should handle aliens schema example', async () => {
    const alienSchema: Schema = {
      properties: {
        aliens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              traits: {
                type: "array",
                items: { type: "string" }
              },
              environment: { type: "string" }
            }
          }
        }
      }
    };
    
    const messages: Message[] = [
      { 
        role: "user" as const, 
        content: "Generate 3 unique alien species with unique biological traits, appearance, and preferred environments."
      }
    ];
    
    const options = { 
      apiKey: 'test-api-key',
      model: 'openrouter/auto',
      stream: true,
      schema: alienSchema
    };
    
    // Mock successful response
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI(messages, options) as AsyncGenerator;
    await generator.next();
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.properties).toEqual(alienSchema.properties);
    expect(body.model).toBe('openrouter/auto');
    expect(body.stream).toBe(true);
  });

  it('should handle non-streaming response', async () => {
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: 'Hello, I am an AI' } }]
    });
    
    const options = { 
      apiKey: 'test-api-key'
    };
    
    const result = await callAI('Hello', options);
    
    expect(result).toBe('Hello, I am an AI');
    expect(mockResponse.json).toHaveBeenCalledTimes(1);
  });

  it('should include schema name property when provided', async () => {
    const schemaWithName: Schema = {
      name: 'test_schema',
      properties: {
        result: { type: 'string' }
      }
    };
    
    const options = { 
      apiKey: 'test-api-key',
      schema: schemaWithName
    };
    
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: '{"result": "Test successful"}' } }]
    });
    
    await callAI('Test with schema name', options);
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('test_schema');
  });

  it('should work correctly with schema without name property', async () => {
    const schemaWithoutName: Schema = {
      properties: {
        result: { type: 'string' }
      }
    };
    
    const options = { 
      apiKey: 'test-api-key',
      schema: schemaWithoutName
    };
    
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: '{"result": "Test successful"}' } }]
    });
    
    await callAI('Test without schema name', options);
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('result');
  });

  it('should use default name "result" when schema has no name property', async () => {
    const schemaWithoutName: Schema = {
      properties: {
        data: { type: 'string' }
      }
    };
    
    const options = { 
      apiKey: 'test-api-key',
      schema: schemaWithoutName
    };
    
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: '{"data": "Some content"}' } }]
    });
    
    await callAI('Generate content with schema', options);
    
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.name).toBe('result');
  });

  it('should handle errors during API call for non-streaming', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    const options = { apiKey: 'test-api-key' };
    const result = await callAI('Hello', options);
    
    expect(result).toBe("Sorry, I couldn't process that request.");
  });

  it('should handle errors during API call for streaming', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    const options = { apiKey: 'test-api-key', stream: true };
    const generator = callAI('Hello', options) as AsyncGenerator;
    const result = await generator.next();
    
    expect(result.value).toBe("Sorry, I couldn't process that request.");
    expect(result.done).toBe(true);
  });
  
  it('should default to streaming mode (false) if not specified', async () => {
    const options = { apiKey: 'test-api-key' };
    
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: 'Hello, I am an AI' } }]
    });
    
    await callAI('Hello', options);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.stream).toBe(false);
  });
}); 