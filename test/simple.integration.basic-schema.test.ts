import { callAI, getMeta } from "../src/index";
import { Message } from "../src/types";
import dotenv from "dotenv";

// Load environment variables from .env file if present
dotenv.config();

// Configure retry settings for flaky tests - use fewer retries with faster failures
jest.retryTimes(2, { logErrorsBeforeRetry: true });

// Increase Jest's default timeout to handle all parallel requests
// jest.setTimeout(60000);

// Skip tests if no API key is available
const haveApiKey = process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => (condition ? it.concurrent : it.skip);

// Timeout for individual test
const TIMEOUT = 9000;

// Test models based on the OpenRouter documentation
const supportedModels = {
  // openAI: { id: "openai/gpt-4.5-preview", grade: "A" },
  gemini: { id: "google/gemini-2.5-flash-preview", grade: "A" },
  // geminiPro: { id: "google/gemini-2.5-pro-preview-03-25", grade: "A" },
  // claude: { id: "anthropic/claude-3-sonnet", grade: "B" },
  // claudeThinking: { id: "anthropic/claude-3.7-sonnet:thinking", grade: "B" },
  // llama3: { id: "meta-llama/llama-4-maverick", grade: "B" },
  // deepseek: { id: 'deepseek/deepseek-chat', grade: 'C' },
  // gpt4turbo: { id: "openai/gpt-4-turbo", grade: "B" },
};

// Define the model names as an array for looping
const modelEntries = Object.entries(supportedModels);

// Function to handle test expectations based on model grade
const expectOrWarn = (
  model: { id: string; grade: string },
  condition: boolean,
  message: string,
) => {
  if (model.grade === "A") {
    expect(condition).toBe(true);
  } else if (!condition) {
    console.warn(`Warning (${model.id}): ${message}`);
  }
};

// Create a test function that won't fail on timeouts for B and C grade models
const gradeAwareTest = (modelId: { id: string; grade: string }) => {
  if (!haveApiKey) return it.skip;

  if (modelId.grade === "A") {
    return it.concurrent;
  } else {
    // For B and C models, use a test wrapper that won't fail on timeouts
    return (name: string, fn: () => Promise<void>, timeout?: number) => {
      return it.concurrent(
        name,
        async () => {
          try {
            // Set a short timeout for the Promise.race to keep tests running quickly
            const result = await Promise.race([
              fn(),
              new Promise((resolve) =>
                setTimeout(() => {
                  console.warn(
                    `Timeout for ${modelId.id} (Grade ${modelId.grade}): ${name}`,
                  );
                  resolve(undefined);
                }, timeout || TIMEOUT),
              ),
            ]);
            return result;
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.warn(
              `Error in ${modelId.id} (Grade ${modelId.grade}): ${errorMessage}`,
            );
            // Don't fail the test
            return;
          }
        },
        timeout,
      );
    };
  }
};

describe("Simple callAI integration tests", () => {
  // Test basic non-structured requests with all models
  describe("Non-structured text generation", () => {
    // Run all model tests concurrently within this describe block
    modelEntries.map(([modelName, modelId]) => {
      // Test with functions/tools (simple schema)
      gradeAwareTest(modelId)(
        `should handle basic schema with ${modelName} model`,
        async () => {
          // Make API call with a basic schema
          const result = await callAI("Provide information about France.", {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId.id,
            schema: {
              type: "object",
              properties: {
                capital: { type: "string" },
                population: { type: "number" },
                languages: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["capital", "population"],
            },
          });

          // Get the metadata
          const resultMeta = getMeta(result);

          // Verify response
          expectOrWarn(
            modelId,
            typeof result === "string",
            `Result is not a string but a ${typeof result} in ${modelName} model`,
          );

          if (typeof result === "string") {
            // Try to parse as JSON
            try {
              const data = JSON.parse(result);
              expectOrWarn(
                modelId,
                typeof data === "object" && data !== null,
                `Parsed result is not an object in ${modelName} model response`,
              );

              if (typeof data === "object" && data !== null) {
                // Check required fields
                expectOrWarn(
                  modelId,
                  "capital" in data,
                  `Missing 'capital' in ${modelName} model response`,
                );
                expectOrWarn(
                  modelId,
                  "population" in data,
                  `Missing 'population' in ${modelName} model response`,
                );

                // Validate capital
                if ("capital" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.capital === "string",
                    `'capital' is not a string in ${modelName} model response`,
                  );
                  if (typeof data.capital === "string") {
                    expectOrWarn(
                      modelId,
                      data.capital.toLowerCase() === "paris",
                      `Capital is ${data.capital}, not Paris in ${modelName} model response`,
                    );
                  }
                }

                // Validate population
                if ("population" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.population === "number",
                    `'population' is not a number in ${modelName} model response`,
                  );
                  if (typeof data.population === "number") {
                    // Population should be in a reasonable range (60-70 million for France)
                    expectOrWarn(
                      modelId,
                      data.population > 50000000 && data.population < 80000000,
                      `Population ${data.population} outside expected range in ${modelName} model response`,
                    );
                  }
                }

                // Check languages if present
                if ("languages" in data) {
                  expectOrWarn(
                    modelId,
                    Array.isArray(data.languages),
                    `'languages' is not an array in ${modelName} model response`,
                  );
                  if (Array.isArray(data.languages)) {
                    // Should include French
                    expectOrWarn(
                      modelId,
                      data.languages.some(
                        (lang: string) =>
                          typeof lang === "string" &&
                          lang.toLowerCase().includes("french"),
                      ),
                      `Languages doesn't include French in ${modelName} model response`,
                    );
                  }
                }
              }
            } catch (e) {
              expectOrWarn(
                modelId,
                false,
                `JSON parse error in ${modelName} model response: ${e}`,
              );
            }
          }
        },
        TIMEOUT,
      );
    });
  });
});
