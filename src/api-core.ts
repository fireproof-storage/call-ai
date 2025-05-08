/**
 * Core API implementation for call-ai
 */

import { CallAIOptions, Message, SchemaStrategy, Schema } from "./types";
import { globalDebug, keyStore } from "./key-management";
import { callAINonStreaming } from "./non-streaming";
import { callAIStreaming } from "./streaming";
import { getMeta } from "./response-metadata";

// Import package version for debugging
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PACKAGE_VERSION = require("../package.json").version;

/**
 * Main API interface function for making AI API calls
 *
 * @param prompt The prompt to send to the AI, either a string or a Message array
 * @param options Configuration options for the API call
 * @returns Promise<string> for non-streaming or AsyncGenerator for streaming
 */
async function callAI(prompt: string | Message[], options: CallAIOptions = {}) {
  // Always call initKeyStore to ensure keys are loaded
  const { initKeyStore } = require("./key-management");
  initKeyStore();

  const debug = options.debug === undefined ? globalDebug : options.debug;

  // Handle schema strategy based on model or explicitly provided strategy
  let schemaStrategy: SchemaStrategy = {
    strategy: "none" as const,
    model: options.model || "openai/gpt-3.5-turbo",
    prepareRequest: (schema: any) => ({}),
    processResponse: (response: any) => {
      // If response is an object, stringify it to match expected test output
      if (response && typeof response === 'object') {
        return JSON.stringify(response);
      }
      return response;
    },
    shouldForceStream: false
  };

  // If a schema is provided, determine the appropriate strategy
  if (options.schema) {
    const model = options.model || "openai/gpt-3.5-turbo";
    
    // Choose function calling strategy based on model
    if (/claude/i.test(model) || /anthropic/i.test(model)) {
      schemaStrategy = {
        strategy: "tool_mode" as const,
        model,
        shouldForceStream: false,
        prepareRequest: (schema, messages) => {
          // Parse the schema to extract the function definition
          let toolDef: any = {};

          if (typeof schema === "string") {
            try {
              toolDef = JSON.parse(schema);
            } catch (e) {
              // If it's not valid JSON, we'll use it as a plain description
              toolDef = { description: schema };
            }
          } else if (schema) {
            toolDef = schema;
          }

          // Build a tools array compatible with Claude's format
          const tools = [
            {
              type: "function",
              function: {
                name: toolDef.name || "execute_function",
                description: toolDef.description || "Execute a function",
                parameters: toolDef.parameters || {
                  type: "object",
                  properties: {},
                },
              },
            },
          ];

          return {
            tools,
            tool_choice: {
              type: "function",
              function: { name: tools[0].function.name },
            },
          };
        },
        processResponse: (response) => {
          // Handle different response formats
          if (typeof response === "string") {
            return response;
          }

          // Handle direct tool_use format
          if (response && response.type === "tool_use") {
            return response.input || "{}";
          }

          // Handle object with tool_use property
          if (response && response.tool_use) {
            return response.tool_use.input || "{}";
          }

          // Handle array of tool calls (OpenAI format)
          if (Array.isArray(response)) {
            if (
              response.length > 0 &&
              response[0].function &&
              response[0].function.arguments
            ) {
              return response[0].function.arguments;
            }
          }

          // For all other cases, return string representation
          return typeof response === "string"
            ? response
            : JSON.stringify(response);
        },
      };
    } else {
      // For OpenAI compatible models, use json_schema format
      schemaStrategy = {
        strategy: "json_schema" as const,
        model,
        shouldForceStream: false,
        prepareRequest: (schema) => {
          // Create a properly formatted JSON schema request
          const schemaObj = schema as Schema || {};
          return {
            response_format: { 
              type: "json_schema",
              json_schema: {
                name: schemaObj.name || "result",
                schema: {
                  type: "object",
                  properties: schemaObj.properties || {},
                  required: schemaObj.required || Object.keys(schemaObj.properties || {}),
                  additionalProperties: schemaObj.additionalProperties !== undefined ? 
                    schemaObj.additionalProperties : false
                }
              }
            }
          };
        },
        processResponse: (response) => {
          // Handle different response formats
          if (typeof response === "string") {
            // Keep string responses as is
            return response;
          }
          // If it's an object, convert to string to match test expectations
          return JSON.stringify(response);
        },
      };
    }
  }

  // Check if this should be a streaming or non-streaming call
  if (options.stream) {
    if (debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Making streaming request`);
    }

    // For streaming requests we need to handle both synchronous and asynchronous errors
    try {
      // Make this async so we can catch immediate API key validation errors
      // eslint-disable-next-line require-yield
      async function* errorCatchingGenerator() {
        try {
          // Pass schemaStrategy through options to avoid type error
          const optionsWithSchema = {
            ...options,
            schemaStrategy
          };
          
          // Get API key from options, key store, or window global
          const apiKey = optionsWithSchema.apiKey || 
                         keyStore.current || 
                         (typeof window !== "undefined" ? (window as any).CALLAI_API_KEY : null);
          
          // Add API key to options for streaming call
          optionsWithSchema.apiKey = apiKey;
          
          // Validate API key
          if (!apiKey) {
            throw new Error("API key is required. Please provide an API key via options.apiKey, environment variable CALLAI_API_KEY, or set window.CALLAI_API_KEY");
          }
          
          // Delegate to the real generator
          yield* callAIStreaming(prompt, optionsWithSchema);
          return "";
        } catch (error) {
          // Re-throw API key errors and other immediate errors
          throw error;
        }
      }
      
      // Create the generator and wrap in a promise
      const generator = errorCatchingGenerator();
      // Cast the promise to ensure correct type compatibility
      const streamingPromise = Promise.resolve(generator) as Promise<AsyncGenerator<string, string, unknown>>;
      
      // Create a proxy that supports both Promise and AsyncGenerator interfaces
      // This maintains backward compatibility with pre-0.7.0 code
      return createBackwardCompatStreamingProxy(streamingPromise);
    } catch (error) {
      // If there's an immediate error (like API key validation), make sure it's propagated properly
      throw error;
    }
  } else {
    if (debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Making non-streaming request`);
    }

    // Pass schemaStrategy through options to avoid type error
    const optionsWithSchema = {
      ...options,
      schemaStrategy
    };
    
    // Make a non-streaming API call
    return callAINonStreaming(prompt, optionsWithSchema);
  }
}

/**
 * Buffers the results of a streaming generator into a single string
 * 
 * @param generator The streaming generator returned by callAI
 * @returns Promise<string> with the complete response
 */
async function bufferStreamingResults(
  generator: AsyncGenerator<string, string, unknown>,
): Promise<string> {
  let result = "";

  try {
    // Iterate through the generator and collect results
    for await (const chunk of generator) {
      result += chunk;
    }

    return result;
  } catch (error) {
    // If we already collected some content, attach it to the error
    if (error instanceof Error) {
      const enhancedError = new Error(
        `${error.message} (Partial content: ${result.slice(0, 100)}...)`,
      );
      (enhancedError as any).partialContent = result;
      (enhancedError as any).originalError = error;
      throw enhancedError;
    } else {
      // For non-Error objects, create an Error with info
      const newError = new Error(`Streaming error: ${String(error)}`);
      (newError as any).partialContent = result;
      (newError as any).originalError = error;
      throw newError;
    }
  }
}

/**
 * Create a backward-compatible streaming proxy for pre-0.7.0 code
 * This allows existing code to run without awaiting the callAI response
 */
function createBackwardCompatStreamingProxy(
  generatorPromise: Promise<AsyncGenerator<string, string, unknown>>,
) {
  let resolvedGenerator: AsyncGenerator<string, string, unknown> | null = null;
  let firstNext: Promise<IteratorResult<string, string>> | null = null;
  let warnedLegacy = false;
  
  /**
   * Pre-resolve the generator and start first iteration for direct access
   * Used by non-await code paths in tests
   */
  function immediateAccess() {
    // Start resolving the generator for immediate access
    if (!resolvedGenerator && !firstNext) {
      const promise = generatorPromise.then(gen => {
        resolvedGenerator = gen;
        return gen.next();
      });
      firstNext = promise;
      return promise;
    }
    return firstNext;
  }
  
  // Immediately start resolving to improve compatibility with no-await tests
  immediateAccess();

  // Create the main proxy target with core generator methods
  const target: any = {
    // next method that works with both await and no-await patterns
    next: async function(value?: any) {
      if (!warnedLegacy) {
        console.warn(
          `[callAI:${PACKAGE_VERSION}] DEPRECATION WARNING: You are using streaming without 'await'. ` +
          `This backward compatibility mode will be removed in a future version. ` +
          `Please update your code to: const stream = await callAI(..., { stream: true });`,
        );
        warnedLegacy = true;
      }

      // If we already have a firstNext promise, use it
      if (firstNext) {
        const result = await firstNext;
        firstNext = null;
        return result;
      }

      // Otherwise, we need to resolve the generator first
      if (!resolvedGenerator) {
        resolvedGenerator = await generatorPromise;
      }

      return resolvedGenerator.next(value);
    },

    // Return method
    return: async function(value?: any) {
      if (!resolvedGenerator) {
        resolvedGenerator = await generatorPromise;
      }
      return resolvedGenerator.return!(value);
    },

    // Throw method
    throw: async function(e?: any) {
      if (!resolvedGenerator) {
        resolvedGenerator = await generatorPromise;
      }
      return resolvedGenerator.throw!(e);
    },

    // Iterator symbol to make it work with for-await-of
    [Symbol.asyncIterator]: function() {
      return this;
    }
  };

  // Create a proxy that acts as both AsyncGenerator and Promise
  return new Proxy(target, {
    // Handle property access (for Promise compatibility)
    get: function(target, prop) {
      // Special handling for Promise methods
      if (prop === 'then') {
        return function(resolve: any, reject: any) {
          return generatorPromise.then(resolve, reject);
        };
      }
      if (prop === 'catch') {
        return function(reject: any) {
          return generatorPromise.catch(reject);
        };
      }
      if (prop === 'finally') {
        return function(callback: any) {
          return generatorPromise.finally(callback);
        };
      }
      
      // Regular property access
      return target[prop];
    }
  });
}

/**
 * Validates and prepares request parameters for API calls
 * 
 * @param prompt User prompt (string or Message array)
 * @param options Call options
 * @returns Validated and processed parameters
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions = {},
) {
  // Validate and process input parameters
  if (!prompt || (typeof prompt !== "string" && !Array.isArray(prompt))) {
    throw new Error(
      `Invalid prompt: ${prompt}. Must be a string or an array of message objects.`,
    );
  }

  // Convert simple string prompts to message array format
  const messages = Array.isArray(prompt)
    ? prompt
    : [{ role: "user", content: prompt }];

  // Validate message structure if array provided
  if (Array.isArray(prompt)) {
    for (const message of prompt) {
      if (!message.role || !message.content) {
        throw new Error(
          `Invalid message format. Each message must have 'role' and 'content' properties. Received: ${JSON.stringify(
            message,
          )}`,
        );
      }

      if (
        typeof message.role !== "string" ||
        (typeof message.content !== "string" && !Array.isArray(message.content))
      ) {
        throw new Error(
          `Invalid message format. 'role' must be a string and 'content' must be a string or array. Received role: ${typeof message.role}, content: ${typeof message.content}`,
        );
      }
    }
  }

  // If provider-specific options are given, check for conflicts
  if (
    options.provider &&
    options.provider !== "auto" &&
    options.model &&
    !options.model.startsWith(options.provider + "/")
  ) {
    console.warn(
      `[callAI:${PACKAGE_VERSION}] WARNING: Specified provider '${options.provider}' doesn't match model '${options.model}'. Using model as specified.`,
    );
  }

  // Return the validated parameters
  return {
    messages,
  };
}

// Export main API functions
export {
  callAI,
  bufferStreamingResults,
  createBackwardCompatStreamingProxy,
  prepareRequestParams,
  PACKAGE_VERSION,
};
