import { callAI } from "../src/index";
import dotenv from "dotenv";

// Load environment variables from .env file if present
dotenv.config();

// Configure retry settings for flaky tests
jest.retryTimes(2, { logErrorsBeforeRetry: true });

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => (condition ? it : it.skip);

// Timeout for individual test
const TIMEOUT = 9000;

describe("Error handling integration tests", () => {
  // Test default model (should succeed)
  itif(!!haveApiKey)("should succeed with default model", async () => {
    // Make a simple API call with no model specified
    const result = await callAI("Write a short joke about programming.", {
      apiKey: process.env.CALLAI_API_KEY,
      // No model specified - should use default
    });

    // Verify response
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(10);
  }, TIMEOUT);

  // Test with invalid model (should throw an error)
  itif(!!haveApiKey)("should throw error with invalid model", async () => {
    // Attempt API call with a non-existent model
    await expect(async () => {
      await callAI("Write a short joke about programming.", {
        apiKey: process.env.CALLAI_API_KEY,
        model: "fake-model-that-does-not-exist",
        skipRetry: true, // Skip retry mechanism to force the error
      });
    }).rejects.toThrow();
  }, TIMEOUT);

  // Test streaming with invalid model (should also throw an error)
  itif(!!haveApiKey)("should throw error with invalid model in streaming mode", async () => {
    // Attempt streaming API call with a non-existent model
    await expect(async () => {
      const generator = callAI("Write a short joke about programming.", {
        apiKey: process.env.CALLAI_API_KEY,
        model: "fake-model-that-does-not-exist",
        stream: true,
        skipRetry: true, // Skip retry mechanism to force the error
      });

      // Try to consume the generator
      for await (const _ of generator) {
        // This should throw before yielding any chunks
      }
    }).rejects.toThrow();
  }, TIMEOUT);

  // Test error message contents
  itif(!!haveApiKey)("should include model ID in error message", async () => {
    const fakeModelId = "fake-model-that-does-not-exist";
    
    // Attempt API call with a non-existent model
    try {
      await callAI("Write a short joke about programming.", {
        apiKey: process.env.CALLAI_API_KEY,
        model: fakeModelId,
        skipRetry: true, // Skip retry mechanism to force the error
      });
      // If we get here, fail the test
      fail("Should have thrown an error");
    } catch (error) {
      // Verify error message contains useful information
      expect(error instanceof Error).toBe(true);
      expect(error.message).toContain(fakeModelId);
    }
  }, TIMEOUT);

  // Test with debug option for error logging
  itif(!!haveApiKey)("should handle error with debug option", async () => {
    // Spy on console.error
    const consoleErrorSpy = jest.spyOn(console, "error");
    
    // Attempt API call with a non-existent model and debug enabled
    try {
      await callAI("Write a short joke about programming.", {
        apiKey: process.env.CALLAI_API_KEY,
        model: "fake-model-that-does-not-exist",
        skipRetry: true, // Skip retry mechanism to force the error
        debug: true, // Enable debug mode
      });
      // If we get here, fail the test
      fail("Should have thrown an error");
    } catch (error) {
      // Verify console.error was called at least once (debug mode)
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      // Restore the original console.error
      consoleErrorSpy.mockRestore();
    }
  }, TIMEOUT);
});
