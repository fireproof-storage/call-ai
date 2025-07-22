import { Mock, vitest, describe, it, expect, beforeEach, beforeAll, assert } from "vitest";
import { imageGen } from "call-ai";

// Mock fetch
global.fetch = vitest.fn();

// Create mock objects in setup to avoid TypeScript errors
// let mockBlobInstance: any;
// let mockFileInstance: any;

// Setup mock constructors and instances
beforeAll(() => {
  // Create mock instances that will be returned when 'new' is called
  const mockBlobInstance = {
    size: 0,
    type: "image/png",
    arrayBuffer: vitest.fn().mockResolvedValue(new ArrayBuffer(0)),
    text: vitest.fn().mockResolvedValue("mock text"),
  };

  const mockFileInstance = {
    name: "mock-file.png",
    type: "image/png",
    size: 0,
    lastModified: Date.now(),
  };

  // Use a simple class implementation that Jest's objectContaining can properly match
  class MockFormData {
    append = vitest.fn();
    delete = vitest.fn();
    get = vitest.fn();
    getAll = vitest.fn();
    has = vitest.fn();
    set = vitest.fn();
  }

  // Mock constructors
  global.Blob = vitest.fn().mockImplementation(() => mockBlobInstance); //as any;
  global.File = vitest.fn().mockImplementation((_, name, options) => {
    return { ...mockFileInstance, name, type: options?.type || "image/png" };
  }); //as any;

  // For FormData, create a new instance each time
  global.FormData = MockFormData as unknown as typeof FormData;
});

// Mock response for successful image generation
const mockImageResponse = {
  created: Date.now(),
  data: [
    {
      b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", // 1x1 px transparent PNG
      revised_prompt: "Generated image based on prompt",
    },
  ],
};

describe("imageGen", () => {
  beforeEach(() => {
    vitest.clearAllMocks();
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vitest.fn().mockResolvedValue(mockImageResponse),
    });
  });

  it("should make POST request with correct parameters for image generation", async () => {
    const prompt = "A children's book drawing of a veterinarian using a stethoscope to listen to the heartbeat of a baby otter.";
    const options = {
      apiKey: "VIBES_DIY",
      model: "gpt-image-1",
      debug: true,
    };

    const result = await imageGen(prompt, options);

    // Check that fetch was called with the correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/openai-image/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer VIBES_DIY",
          "Content-Type": "application/json",
        }),
      }),
    );

    // Check request body
    const requestBody = JSON.parse((global.fetch as Mock).mock.calls[0][1].body);
    expect(requestBody).toEqual({
      model: "gpt-image-1",
      prompt: "A children's book drawing of a veterinarian using a stethoscope to listen to the heartbeat of a baby otter.",
      size: "1024x1024",
    });

    // Check response structure
    expect(result).toEqual(mockImageResponse);
    expect(result.data[0].b64_json).toBeDefined();
  });

  it("should make POST request with correct parameters for image editing", async () => {
    const prompt = "Create a lovely gift basket with these four items in it";

    // Mock implementation for File objects
    const mockImageBlob = new Blob(["fake image data"], { type: "image/png" });
    const mockFiles = [
      new File([mockImageBlob], "image1.png", { type: "image/png" }),
      new File([mockImageBlob], "image2.png", { type: "image/png" }),
    ];

    const options = {
      apiKey: "VIBES_DIY",
      model: "gpt-image-1",
      images: mockFiles,
      size: "1024x1024",
      debug: true,
    };

    const result = await imageGen(prompt, options);

    // Check that fetch was called with the correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/openai-image/edit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer VIBES_DIY",
        }),
        body: expect.any(FormData),
      }),
    );

    // Check response structure
    expect(result).toEqual(mockImageResponse);
    expect(result.data[0].b64_json).toBeDefined();
  });

  it("should handle errors from the image generation API", async () => {
    // Mock a failed response
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vitest.fn().mockResolvedValue(JSON.stringify({ error: "Invalid prompt" })),
    });

    const prompt = "This prompt will cause an error";

    try {
      await imageGen(prompt, { apiKey: "VIBES_DIY" });
      assert.fail("Expected the image generation to throw an error");
    } catch (error) {
      expect((error as Error).message).toContain("Image generation failed");
      expect((error as Error).message).toContain("400 Bad Request");
    }
  });

  it("should handle errors from the image editing API", async () => {
    // Mock a failed response
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vitest.fn().mockResolvedValue(JSON.stringify({ error: "Invalid image format" })),
    });

    const prompt = "This will trigger an error";
    const mockImageBlob = new Blob(["fake image data"], { type: "image/png" });
    const mockFiles = [new File([mockImageBlob], "invalid.png", { type: "image/png" })];

    try {
      await imageGen(prompt, {
        apiKey: "VIBES_DIY",
        images: mockFiles,
      });
      assert.fail("Expected the image editing to throw an error");
    } catch (error) {
      expect((error as Error).message).toContain("Image editing failed");
      expect((error as Error).message).toContain("400 Bad Request");
    }
  });
});
