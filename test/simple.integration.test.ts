import { callAI } from "../src/index";
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
      // Test without streaming
      gradeAwareTest(modelId)(
        `should generate text with ${modelName} model without streaming`,
        async () => {
          // Make a simple non-structured API call
          const result = await callAI("Write a short joke about programming.", {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId.id,
          });

          // Verify response
          expectOrWarn(
            modelId,
            !!result,
            `should generate text with ${modelName} model without streaming`,
          );
          expect(typeof result).toBe("string");
          expect((result as string).length).toBeGreaterThan(10);
        },
        TIMEOUT,
      );

      // Test with streaming
      gradeAwareTest(modelId)(
        `should generate text with ${modelName} model with streaming`,
        async () => {
          // Make a simple non-structured API call with streaming
          const generator = await callAI(
            "Write a short joke about programming.",
            {
              apiKey: process.env.CALLAI_API_KEY,
              model: modelId.id,
              stream: true,
            },
          );

          // Stream should be an AsyncGenerator
          expectOrWarn(
            modelId,
            typeof generator === "object",
            `Generator is not an object but a ${typeof generator} in ${modelName} model`,
          );

          // Manual type assertion to help TypeScript recognize generator as AsyncGenerator
          if (typeof generator === "object" && generator !== null) {
            const asyncGenerator = generator as AsyncGenerator<
              string,
              string,
              unknown
            >;

            // Collect all chunks
            let finalResult = "";
            try {
              for await (const chunk of asyncGenerator) {
                // Each chunk should be a string
                expectOrWarn(
                  modelId,
                  typeof chunk === "string",
                  `Chunk is not a string but a ${typeof chunk} in ${modelName} model`,
                );
                finalResult = chunk;
              }

              // Final result should be a meaningful string
              expectOrWarn(
                modelId,
                finalResult.length > 10,
                `Final result too short (${finalResult.length} chars) in ${modelName} model`,
              );
            } catch (error) {
              // Log error but don't fail test for B/C grade models
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              expectOrWarn(
                modelId,
                false,
                `Streaming error in ${modelName} model: ${errorMessage}`,
              );
            }
          }
        },
        TIMEOUT,
      );

      // Test with a system prompt
      gradeAwareTest(modelId)(
        `should handle system prompt with ${modelName} model`,
        async () => {
          // Create message array with system prompt
          const messages = [
            {
              role: "system" as const,
              content:
                "You are a helpful assistant that provides only factual information.",
            },
            {
              role: "user" as const,
              content: "Provide information about France.",
            },
          ] as Message[];

          // Make API call with message array
          const result = await callAI(messages, {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId.id,
          });

          // Verify response
          expectOrWarn(
            modelId,
            typeof result === "string",
            `Result is not a string but a ${typeof result} in ${modelName} model`,
          );
          if (typeof result === "string") {
            expectOrWarn(
              modelId,
              result.length > 50,
              `Result length (${result.length}) too short in ${modelName} model`,
            );
            // Should mention France somewhere in the response
            expectOrWarn(
              modelId,
              result.toLowerCase().includes("france"),
              `Response doesn't mention "France" in ${modelName} model`,
            );
          }
        },
        TIMEOUT,
      );

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
                `Parsed result is not an object in ${modelName} model`,
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

      // Test with a complex nested schema
      gradeAwareTest(modelId)(
        `should handle nested schema with ${modelName} model`,
        async () => {
          // API call with a nested schema
          const result = await callAI(
            [
              {
                role: "user" as const,
                content: "Create a file directory structure for a web project",
              },
            ] as Message[],
            {
              apiKey: process.env.CALLAI_API_KEY,
              model: modelId.id,
              schema: {
                type: "object",
                properties: {
                  root: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", enum: ["directory"] },
                      children: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            type: {
                              type: "string",
                              enum: ["directory", "file"],
                            },
                            children: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  name: { type: "string" },
                                  type: {
                                    type: "string",
                                    enum: ["directory", "file"],
                                  },
                                },
                                required: ["name", "type"],
                              },
                            },
                          },
                          required: ["name", "type"],
                        },
                      },
                    },
                    required: ["name", "type", "children"],
                  },
                },
                required: ["root"],
              },
            },
          );

          // Verify response
          expectOrWarn(
            modelId,
            typeof result === "string",
            `Result is not a string but a ${typeof result} in ${modelName} model`,
          );

          if (typeof result === "string") {
            try {
              const data = JSON.parse(result);
              expectOrWarn(
                modelId,
                typeof data === "object" && data !== null,
                `Parsed result is not an object in ${modelName} model response`,
              );

              if (typeof data === "object" && data !== null) {
                // Check root object
                expectOrWarn(
                  modelId,
                  "root" in data,
                  `Missing 'root' in ${modelName} model response`,
                );

                if ("root" in data && typeof data.root === "object") {
                  // Check root properties
                  expectOrWarn(
                    modelId,
                    "name" in data.root,
                    `Missing 'root.name' in ${modelName} model response`,
                  );
                  expectOrWarn(
                    modelId,
                    "type" in data.root,
                    `Missing 'root.type' in ${modelName} model response`,
                  );
                  expectOrWarn(
                    modelId,
                    "children" in data.root,
                    `Missing 'root.children' in ${modelName} model response`,
                  );

                  if ("name" in data.root)
                    expectOrWarn(
                      modelId,
                      typeof data.root.name === "string",
                      `'root.name' is not a string in ${modelName} model response`,
                    );
                  if ("type" in data.root)
                    expectOrWarn(
                      modelId,
                      data.root.type === "directory",
                      `'root.type' is not 'directory' in ${modelName} model response`,
                    );
                  if ("children" in data.root)
                    expectOrWarn(
                      modelId,
                      Array.isArray(data.root.children),
                      `'root.children' is not an array in ${modelName} model response`,
                    );

                  // Check first level of nesting
                  if (
                    Array.isArray(data.root.children) &&
                    data.root.children.length > 0
                  ) {
                    const firstChild = data.root.children[0];
                    expectOrWarn(
                      modelId,
                      !!firstChild,
                      `First child is undefined in ${modelName} model response`,
                    );

                    if (firstChild) {
                      expectOrWarn(
                        modelId,
                        !!firstChild.name,
                        `Missing 'firstChild.name' in ${modelName} model response`,
                      );
                      expectOrWarn(
                        modelId,
                        !!firstChild.type,
                        `Missing 'firstChild.type' in ${modelName} model response`,
                      );
                      expectOrWarn(
                        modelId,
                        !!firstChild.children,
                        `Missing 'firstChild.children' in ${modelName} model response`,
                      );

                      if (firstChild.name)
                        expectOrWarn(
                          modelId,
                          typeof firstChild.name === "string",
                          `'firstChild.name' is not a string in ${modelName} model response`,
                        );
                      if (firstChild.type)
                        expectOrWarn(
                          modelId,
                          typeof firstChild.type === "string",
                          `'firstChild.type' is not a string in ${modelName} model response`,
                        );
                      if (firstChild.children)
                        expectOrWarn(
                          modelId,
                          Array.isArray(firstChild.children),
                          `'firstChild.children' is not an array in ${modelName} model response`,
                        );

                      // Check for at least one file in the second level
                      if (
                        Array.isArray(firstChild.children) &&
                        firstChild.children.length > 0
                      ) {
                        const secondChild = firstChild.children[0];
                        expectOrWarn(
                          modelId,
                          !!secondChild,
                          `Second child is undefined in ${modelName} model response`,
                        );

                        if (secondChild) {
                          expectOrWarn(
                            modelId,
                            !!secondChild.name,
                            `Missing 'secondChild.name' in ${modelName} model response`,
                          );
                          expectOrWarn(
                            modelId,
                            !!secondChild.type,
                            `Missing 'secondChild.type' in ${modelName} model response`,
                          );

                          if (secondChild.name)
                            expectOrWarn(
                              modelId,
                              typeof secondChild.name === "string",
                              `'secondChild.name' is not a string in ${modelName} model response`,
                            );
                          if (secondChild.type)
                            expectOrWarn(
                              modelId,
                              typeof secondChild.type === "string",
                              `'secondChild.type' is not a string in ${modelName} model response`,
                            );
                        }
                      }
                    }
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

    // Test for recipes with all models
    modelEntries.map(([modelName, modelId]) => {
      gradeAwareTest(modelId)(
        `should generate recipe with ${modelName} model using schema`,
        async () => {
          // Make API call with a recipe schema
          const result = await callAI("Create a recipe for a healthy dinner.", {
            apiKey: process.env.CALLAI_API_KEY,
            model: modelId.id,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      amount: { type: "string" },
                    },
                    required: ["name", "amount"],
                  },
                },
                steps: {
                  type: "array",
                  items: { type: "string" },
                },
                prep_time_minutes: { type: "number" },
                cook_time_minutes: { type: "number" },
                servings: { type: "number" },
              },
              required: [
                "title",
                "description",
                "ingredients",
                "steps",
                "prep_time_minutes",
                "cook_time_minutes",
                "servings",
              ],
            },
          });

          // Verify response
          expectOrWarn(
            modelId,
            typeof result === "string",
            `Result is not a string but ${typeof result} in ${modelName} model`,
          );

          if (typeof result === "string") {
            try {
              const data = JSON.parse(result);
              expectOrWarn(
                modelId,
                typeof data === "object" && data !== null,
                `Parsed result is not an object in ${modelName} model response`,
              );

              if (typeof data === "object" && data !== null) {
                // Check required fields
                const requiredFields = [
                  "title",
                  "description",
                  "ingredients",
                  "steps",
                  "prep_time_minutes",
                  "cook_time_minutes",
                  "servings",
                ];

                for (const field of requiredFields) {
                  expectOrWarn(
                    modelId,
                    field in data,
                    `Missing '${field}' in ${modelName} model response`,
                  );
                }

                // Validate types and some basic content
                if ("title" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.title === "string",
                    `'title' is not a string in ${modelName} model response`,
                  );
                  if (typeof data.title === "string") {
                    expectOrWarn(
                      modelId,
                      data.title.length > 3,
                      `Title too short in ${modelName} model response`,
                    );
                  }
                }

                if ("description" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.description === "string",
                    `'description' is not a string in ${modelName} model response`,
                  );
                  if (typeof data.description === "string") {
                    expectOrWarn(
                      modelId,
                      data.description.length > 10,
                      `Description too short in ${modelName} model response`,
                    );
                  }
                }

                if ("ingredients" in data) {
                  expectOrWarn(
                    modelId,
                    Array.isArray(data.ingredients),
                    `'ingredients' is not an array in ${modelName} model response`,
                  );
                  if (Array.isArray(data.ingredients)) {
                    expectOrWarn(
                      modelId,
                      data.ingredients.length > 0,
                      `No ingredients in ${modelName} model response`,
                    );

                    // Check first ingredient
                    if (data.ingredients.length > 0) {
                      const firstIngredient = data.ingredients[0];
                      expectOrWarn(
                        modelId,
                        typeof firstIngredient === "object" &&
                          firstIngredient !== null,
                        `First ingredient is not an object in ${modelName} model response`,
                      );

                      if (
                        typeof firstIngredient === "object" &&
                        firstIngredient !== null
                      ) {
                        expectOrWarn(
                          modelId,
                          "name" in firstIngredient,
                          `Missing 'name' in first ingredient in ${modelName} model response`,
                        );
                        expectOrWarn(
                          modelId,
                          "amount" in firstIngredient,
                          `Missing 'amount' in first ingredient in ${modelName} model response`,
                        );

                        if ("name" in firstIngredient) {
                          expectOrWarn(
                            modelId,
                            typeof firstIngredient.name === "string",
                            `Ingredient name is not a string in ${modelName} model response`,
                          );
                        }

                        if ("amount" in firstIngredient) {
                          expectOrWarn(
                            modelId,
                            typeof firstIngredient.amount === "string",
                            `Ingredient amount is not a string in ${modelName} model response`,
                          );
                        }
                      }
                    }
                  }
                }

                if ("steps" in data) {
                  expectOrWarn(
                    modelId,
                    Array.isArray(data.steps),
                    `'steps' is not an array in ${modelName} model response`,
                  );
                  if (Array.isArray(data.steps)) {
                    expectOrWarn(
                      modelId,
                      data.steps.length > 0,
                      `No steps in ${modelName} model response`,
                    );

                    // Check first step
                    if (data.steps.length > 0) {
                      expectOrWarn(
                        modelId,
                        typeof data.steps[0] === "string",
                        `First step is not a string in ${modelName} model response`,
                      );
                    }
                  }
                }

                // Check numeric fields
                const numericFields = [
                  "prep_time_minutes",
                  "cook_time_minutes",
                  "servings",
                ];
                for (const field of numericFields) {
                  if (field in data) {
                    expectOrWarn(
                      modelId,
                      typeof data[field] === "number",
                      `'${field}' is not a number in ${modelName} model response`,
                    );
                    if (typeof data[field] === "number") {
                      expectOrWarn(
                        modelId,
                        data[field] > 0,
                        `'${field}' is not positive in ${modelName} model response`,
                      );
                    }
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

    // Test with a music playlist schema
    modelEntries.map(([modelName, modelId]) => {
      gradeAwareTest(modelId)(
        `should create playlist with ${modelName} model using schema`,
        async () => {
          // Make API call with the music schema
          const result = await callAI(
            [
              {
                role: "user" as const,
                content:
                  "Create a themed playlist for a relaxing evening with 3-5 songs.",
              },
            ] as Message[],
            {
              apiKey: process.env.CALLAI_API_KEY,
              model: modelId.id,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  theme: { type: "string" },
                  mood: { type: "string" },
                  songs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        artist: { type: "string" },
                        year: { type: "string" },
                        genre: { type: "string" },
                      },
                      required: ["title", "artist"],
                    },
                  },
                },
                required: ["title", "theme", "songs"],
              },
            },
          );

          // Verify response
          expectOrWarn(
            modelId,
            typeof result === "string",
            `Result is not a string but ${typeof result} in ${modelName} model`,
          );

          if (typeof result === "string") {
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
                  "title" in data,
                  `Missing 'title' in ${modelName} model response`,
                );
                expectOrWarn(
                  modelId,
                  "theme" in data,
                  `Missing 'theme' in ${modelName} model response`,
                );
                expectOrWarn(
                  modelId,
                  "songs" in data,
                  `Missing 'songs' in ${modelName} model response`,
                );

                // Check title and theme
                if ("title" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.title === "string",
                    `'title' is not a string in ${modelName} model response`,
                  );
                }

                if ("theme" in data) {
                  expectOrWarn(
                    modelId,
                    typeof data.theme === "string",
                    `'theme' is not a string in ${modelName} model response`,
                  );
                }

                // Check songs array
                if ("songs" in data) {
                  expectOrWarn(
                    modelId,
                    Array.isArray(data.songs),
                    `'songs' is not an array in ${modelName} model response`,
                  );

                  if (Array.isArray(data.songs)) {
                    expectOrWarn(
                      modelId,
                      data.songs.length >= 3 && data.songs.length <= 5,
                      `Songs count (${data.songs.length}) out of range (3-5) in ${modelName} model response`,
                    );

                    // Check first song
                    if (data.songs.length > 0) {
                      const firstSong = data.songs[0];
                      expectOrWarn(
                        modelId,
                        typeof firstSong === "object" && firstSong !== null,
                        `First song is not an object in ${modelName} model response`,
                      );

                      if (typeof firstSong === "object" && firstSong !== null) {
                        // Check required properties
                        expectOrWarn(
                          modelId,
                          "title" in firstSong,
                          `Missing 'title' in first song in ${modelName} model response`,
                        );
                        expectOrWarn(
                          modelId,
                          "artist" in firstSong,
                          `Missing 'artist' in first song in ${modelName} model response`,
                        );

                        // Check types
                        if ("title" in firstSong) {
                          expectOrWarn(
                            modelId,
                            typeof firstSong.title === "string",
                            `Song title is not a string in ${modelName} model response`,
                          );
                        }

                        if ("artist" in firstSong) {
                          expectOrWarn(
                            modelId,
                            typeof firstSong.artist === "string",
                            `Song artist is not a string in ${modelName} model response`,
                          );
                        }
                      }
                    }
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
