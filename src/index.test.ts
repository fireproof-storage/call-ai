import callAI from './index';
import { Message, Schema } from './index';

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

  it('should handle API key requirement', async () => {
    mockReader.read.mockResolvedValueOnce({ done: true });
    const generator = callAI('Hello, AI');
    
    const result = await generator.next();
    expect(result.value).toBe("Sorry, I couldn't process that request.");
  });

  it('should make POST request with correct parameters', async () => {
    const prompt = 'Hello, AI';
    const options = {
      apiKey: 'test-api-key',
      model: 'test-model',
      temperature: 0.7
    };

    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI(prompt, null, options);
    await generator.next();

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
  });

  it('should handle message array for prompt', async () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' }
    ];
    const options = { apiKey: 'test-api-key' };

    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI(messages, null, options);
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
    
    const options = { apiKey: 'test-api-key' };
    
    // Mock successful response to avoid errors
    mockReader.read.mockResolvedValueOnce({ done: true });
    
    const generator = callAI('Get user info', schema, options);
    await generator.next();

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.required).toEqual(['name']);
  });

  it('should handle non-streaming response', async () => {
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: 'Hello, I am an AI' } }]
    });
    
    const options = { 
      apiKey: 'test-api-key',
      stream: false
    };
    
    const result = await callAI('Hello', null, options).next();
    
    expect(result.value).toBe('Hello, I am an AI');
    expect(result.done).toBe(true);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);
  });

  it('should handle errors during API call', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    const options = { apiKey: 'test-api-key' };
    const result = await callAI('Hello', null, options).next();
    
    expect(result.value).toBe("Sorry, I couldn't process that request.");
    expect(result.done).toBe(true);
  });
}); 