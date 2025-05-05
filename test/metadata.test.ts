import { callAI, getMeta } from "../src/index";

// Mock global fetch
global.fetch = jest.fn();

// Simple mock for TextDecoder
global.TextDecoder = jest.fn().mockImplementation(() => ({
  decode: jest.fn((value) => {
    // Basic mock implementation without recursion
    if (value instanceof Uint8Array) {
      // Convert the Uint8Array to a simple string
      return Array.from(value)
        .map((byte) => String.fromCharCode(byte))
        .join("");
    }
    return "";
  }),
}));

// Mock ReadableStream
const mockReader = {
  read: jest.fn(),
};

// Create a mock response with headers
const mockResponse = {
  json: jest.fn(),
  text: jest.fn(),
  body: {
    getReader: jest.fn().mockReturnValue(mockReader),
  },
  ok: true,
  status: 200,
  statusText: "OK",
  headers: {
    get: jest.fn((name) => {
      if (name === "content-type") return "application/json";
      return null;
    }),
    forEach: jest.fn(),
  },
  clone: jest.fn(function() {
    return { ...this };
  }),
};

describe("getMeta", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
  });

  it("should return metadata for non-streaming responses", async () => {
    // Set up mock response with usage data
    mockResponse.json.mockResolvedValue({
      choices: [{ message: { content: "Hello, I am an AI" } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      },
      model: "openai/gpt-4o"
    });

    const options = {
      apiKey: "test-api-key",
      model: "openai/gpt-4o",
    };

    // Call the API
    const result = await callAI("Hello", options);
    
    // Get the metadata
    const meta = getMeta(result);
    
    // Verify metadata content
    expect(meta).toBeDefined();
    expect(meta?.model).toBe("openai/gpt-4o");
    expect(meta?.usage).toBeDefined();
    expect(meta?.usage?.promptTokens).toBe(10);
    expect(meta?.usage?.completionTokens).toBe(20);
    expect(meta?.usage?.totalTokens).toBe(30);
    
    // Verify timing information with proper type checking
    expect(meta?.timing).toBeDefined();
    expect(meta?.timing?.startTime).toBeGreaterThan(0);
    
    // Safe type guards to avoid TypeScript errors
    if (meta?.timing?.startTime !== undefined && meta?.timing?.endTime !== undefined) {
      expect(meta.timing.endTime).toBeGreaterThan(meta.timing.startTime);
    }
    
    if (meta?.timing?.duration !== undefined) {
      expect(meta.timing.duration).toBeGreaterThan(0);
    }
    
    // The raw response should be available
    expect(meta?.rawResponse).toBeDefined();
  });

  it("should return metadata for streaming responses", async () => {
    // Set up a streaming response with multiple chunks
    mockReader.read
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n'
        )
      })
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":", "},"index":0}]}\n\n'
        )
      })
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"world!"},"index":0}]}\n\n'
        )
      })
      .mockResolvedValueOnce({
        done: true
      });

    const options = {
      apiKey: "test-api-key",
      model: "openai/gpt-4o",
      stream: true
    };

    // Call the API with streaming
    const streamResponse = await callAI("Hello", options);
    
    // Collect all stream chunks
    let finalResult = "";
    for await (const chunk of streamResponse) {
      finalResult = chunk;
    }
    
    // Check the final result
    expect(finalResult).toBe("Hello, world!");
    
    // Get the metadata from the stream
    const meta = getMeta(streamResponse);
    
    // Verify metadata content
    expect(meta).toBeDefined();
    expect(meta?.model).toBe("openai/gpt-4o");
    
    // Verify timing information with proper type checking
    expect(meta?.timing).toBeDefined();
    expect(meta?.timing?.startTime).toBeGreaterThan(0);
    
    // Safe type guards to avoid TypeScript errors
    if (meta?.timing?.startTime !== undefined && meta?.timing?.endTime !== undefined) {
      expect(meta.timing.endTime).toBeGreaterThan(meta.timing.startTime);
    }
    
    if (meta?.timing?.duration !== undefined) {
      expect(meta.timing.duration).toBeGreaterThan(0);
    }
    
    // The raw response should be available
    expect(meta?.rawResponse).toBeDefined();
  });

  it("should return undefined if no metadata is associated with response", () => {
    // A random string that wasn't returned from callAI
    const randomString = "This string has no metadata";
    
    // Get metadata should return undefined
    const meta = getMeta(randomString);
    expect(meta).toBeUndefined();
  });

  it("should handle multiple string responses separately", async () => {
    // Set up first mock response
    mockResponse.json.mockResolvedValueOnce({
      choices: [{ message: { content: "First response" } }],
      model: "openai/gpt-4"
    });
    
    // First API call
    const firstResponse = await callAI("First prompt", { 
      apiKey: "test-api-key",
      model: "openai/gpt-4" 
    });
    
    // Set up second mock response
    mockResponse.json.mockResolvedValueOnce({
      choices: [{ message: { content: "Second response" } }],
      model: "openai/gpt-3.5-turbo"
    });
    
    // Second API call with different model
    const secondResponse = await callAI("Second prompt", { 
      apiKey: "test-api-key",
      model: "openai/gpt-3.5-turbo"
    });
    
    // Get metadata for both responses
    const firstMeta = getMeta(firstResponse);
    const secondMeta = getMeta(secondResponse);
    
    // Each response should have its own metadata
    expect(firstMeta?.model).toBe("openai/gpt-4");
    expect(secondMeta?.model).toBe("openai/gpt-3.5-turbo");
  });
});
