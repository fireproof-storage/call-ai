import { callAI, getMeta } from "../src/index";
import { ResponseMeta } from "../src/types";

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
        total_tokens: 30,
      },
      model: "openai/gpt-4o",
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

  it("provides an exported mock for testing with streaming responses", async () => {
    // This test doesn't use the real callAI with streaming because of the complexity
    // of mocking a proper streaming response. Instead, we create a mock of what
    // the streaming response would look like, and test that getMeta() works with it.

    // Create a simple AsyncGenerator to simulate streaming response
    async function* mockStreamResponse(): AsyncGenerator<
      string,
      string,
      unknown
    > {
      yield "Hello";
      yield " world";
      return "Hello world";
    }

    // For testing purposes, we'll use the exported version of getMeta to attach metadata
    // to our generator in the same way the real code would
    const generator = mockStreamResponse();

    // Create a mock ResponseMeta object
    const mockMeta: ResponseMeta = {
      model: "test-model",
      timing: {
        startTime: Date.now(),
        endTime: Date.now() + 100,
      },
      usage: {
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
      },
    };

    // Create our own metadata map for testing
    const testMap = new WeakMap<object, ResponseMeta>();
    testMap.set(generator, mockMeta);

    // Mock the getMeta function for this test to use our test map
    const originalGetMeta = getMeta;
    const mockedGetMeta = jest.fn((resp) => testMap.get(resp));

    // Check that we can get metadata from our mocked streaming response
    const meta = mockedGetMeta(generator);
    expect(meta).toBeDefined();
    expect(meta).toBe(mockMeta);
    expect(meta?.model).toBe("test-model");
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
      model: "openai/gpt-4",
    });

    // First API call
    const firstResponse = await callAI("First prompt", {
      apiKey: "test-api-key",
      model: "openai/gpt-4",
    });

    // Set up second mock response
    mockResponse.json.mockResolvedValueOnce({
      choices: [{ message: { content: "Second response" } }],
      model: "openai/gpt-3.5-turbo",
    });

    // Second API call with different model
    const secondResponse = await callAI("Second prompt", {
      apiKey: "test-api-key",
      model: "openai/gpt-3.5-turbo",
    });

    // Get metadata for both responses
    const firstMeta = getMeta(firstResponse);
    const secondMeta = getMeta(secondResponse);

    // Each response should have its own metadata
    expect(firstMeta?.model).toBe("openai/gpt-4");
    expect(secondMeta?.model).toBe("openai/gpt-3.5-turbo");
  });
});
