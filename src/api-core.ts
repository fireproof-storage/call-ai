/**
 * Core API implementation for call-ai
 */

import {
  CallAIOptions,
  Message,
  SchemaStrategy,
  Schema,
  StreamResponse,
  ThenableStreamResponse,
} from "./types";
import { globalDebug } from "./key-management";
import { callAINonStreaming } from "./non-streaming";
import { callAIStreaming } from "./streaming";

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
// Main API interface function - must match original signature exactly
function callAI(prompt: string | Message[], options: CallAIOptions = {}) {
  // Use the global debug flag if not specified in options
  const debug = options.debug === undefined ? globalDebug : options.debug;

  // Validate and prepare parameters (including API key validation)

  prepareRequestParams(prompt, options);

  // Handle schema strategy based on model or explicitly provided strategy
  let schemaStrategy: SchemaStrategy = {
    strategy: "none" as const,
    model: options.model || "openai/gpt-3.5-turbo",
    prepareRequest: () => ({}),
    processResponse: (response: any) => {
      // If response is an object, stringify it to match expected test output
      if (response && typeof response === "object") {
        return JSON.stringify(response);
      }
      return response;
    },
    shouldForceStream: false,
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
        prepareRequest: (schema) => {
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
          const schemaObj = (schema as Schema) || {};
          return {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: schemaObj.name || "result",
                schema: {
                  type: "object",
                  properties: schemaObj.properties || {},
                  required:
                    schemaObj.required ||
                    Object.keys(schemaObj.properties || {}),
                  additionalProperties:
                    schemaObj.additionalProperties !== undefined
                      ? schemaObj.additionalProperties
                      : false,
                },
              },
            },
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

    // Handle streaming mode - return a Promise that resolves to an AsyncGenerator
    // but also supports legacy non-awaited usage for backward compatibility
    const streamPromise = (async () => {
      // This exact pattern matches the original implementation in api.ts
      return callAIStreaming(prompt, {
        ...options,
        schemaStrategy,
      });
    })();

    // Create a proxy object that acts both as a Promise and an AsyncGenerator for backward compatibility
    // @ts-ignore - We're deliberately implementing a proxy with dual behavior
    return createBackwardCompatStreamingProxy(streamPromise);
  } else {
    if (debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Making non-streaming request`);
    }

    // Pass schemaStrategy through options to avoid type error
    const optionsWithSchema = {
      ...options,
      schemaStrategy,
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
 * Create a proxy that acts both as a Promise and an AsyncGenerator for backward compatibility
 * @internal This is for internal use only, not part of public API
 */
function createBackwardCompatStreamingProxy(
  promise: Promise<StreamResponse>,
): ThenableStreamResponse {
  // Create a proxy that forwards methods to the Promise or AsyncGenerator as appropriate
  return new Proxy({} as any, {
    get(_target, prop) {
      // First check if it's an AsyncGenerator method (needed for for-await)
      if (
        prop === "next" ||
        prop === "throw" ||
        prop === "return" ||
        prop === Symbol.asyncIterator
      ) {
        // Create wrapper functions that await the Promise first
        if (prop === Symbol.asyncIterator) {
          return function () {
            return {
              // Implement async iterator that gets the generator first
              async next(value?: unknown) {
                try {
                  const generator = await promise;
                  return generator.next(value);
                } catch (error) {
                  // Turn Promise rejection into iterator result with error thrown
                  return Promise.reject(error);
                }
              },
            };
          };
        }

        // Methods like next, throw, return
        return async function (value?: unknown) {
          const generator = await promise;
          return (generator as any)[prop](value);
        };
      }

      // Then check if it's a Promise method
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return promise[prop].bind(promise);
      }

      return undefined;
    },
  });
}

/**
 * Validates and prepares request parameters for API calls
 *
 * @param prompt User prompt (string or Message array)
 * @param options Call options
 * @returns Validated and processed parameters including apiKey
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions = {},
) {
  // Get API key from options or window.CALLAI_API_KEY (exactly matching original)
  const apiKey =
    options.apiKey ||
    (typeof window !== "undefined" ? (window as any).CALLAI_API_KEY : null);

  // Validate API key with original error message
  if (!apiKey) {
    throw new Error(
      "API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY",
    );
  }

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

  // Return the validated parameters including API key
  return {
    messages,
    apiKey,
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
