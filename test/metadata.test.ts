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
    }) as jest.Mock,
    forEach: jest.fn(),
  },
  clone: jest.fn(function () {
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
    
    // Verify timing information
    expect(meta?.timing).toBeDefined();
    expect(meta?.timing?.startTime).toBeDefined();
    expect(meta?.timing?.endTime).toBeDefined();
    
    // The raw response should be available
    expect(meta?.rawResponse).toBeDefined();
  });

  it("should return metadata for streaming responses", async () => {
    // Set up streaming response chunks
    mockReader.read
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n'
        ),
      })
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":", world"},"index":0}]}\n\n'
        ),
      })
      .mockResolvedValueOnce({
        done: true,
      });

    // Override the content-type header for streaming
    mockResponse.headers.get.mockImplementation((name) => {
      if (name === "content-type") return "text/event-stream";
      return null;
    });

    const options = {
      apiKey: "test-api-key",
      model: "openai/gpt-4o",
      stream: true,
    };

    // Call the API with streaming enabled
    const streamResponse = await callAI("Hello", options);
    
    // Get metadata from the stream response BEFORE consuming the stream
    const meta = getMeta(streamResponse);
    
    // Verify the metadata is attached to the streaming response
    expect(meta).toBeDefined();
    expect(meta?.model).toBe("openai/gpt-4o");
    expect(meta?.rawResponse).toBeDefined();
    expect(meta?.timing?.startTime).toBeDefined();
    
    // Now consume the stream
    let finalContent = "";
    for await (const chunk of streamResponse) {
      finalContent = chunk;
    }
    
    // Verify the timing.endTime is set after consuming the stream
    expect(meta?.timing?.endTime).toBeDefined();
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
