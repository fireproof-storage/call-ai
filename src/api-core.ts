/**
 * Core API implementation for call-ai
 */

import { CallAIOptions, Message, SchemaStrategy } from "./types";
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
  // Initialize the key store if it hasn't been done yet
  if (keyStore.current === null) {
    const initKeyStore = require("./key-management").initKeyStore;
    initKeyStore();
  }

  const debug = options.debug === undefined ? globalDebug : options.debug;

  // Handle schema strategy based on model or explicitly provided strategy
  let schemaStrategy: SchemaStrategy = {
    strategy: "default",
    prepareRequest: (schema: any) => ({}),
    processResponse: (response: any) => response,
  };

  // If a schema is provided, determine the appropriate strategy
  if (options.schema) {
    const model = options.model || "openai/gpt-3.5-turbo";
    // Choose function calling strategy based on model
    if (/claude/i.test(model) || /anthropic/i.test(model)) {
      schemaStrategy = {
        strategy: "tool_mode",
        prepareRequest: (schema, messages) => {
          // Parse the schema to extract the function definition
          let toolDef;

          if (typeof schema === "string") {
            try {
              toolDef = JSON.parse(schema);
            } catch (e) {
              // If it's not valid JSON, we'll use it as a plain description
              toolDef = { description: schema };
            }
          } else {
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
      // For OpenAI-like models, use function calling format
      schemaStrategy = {
        strategy: "function_call",
        prepareRequest: (schema) => {
          // Parse the schema to extract the function definition
          let functionDef;

          if (typeof schema === "string") {
            try {
              functionDef = JSON.parse(schema);
            } catch (e) {
              // If it's not valid JSON, we'll use it as a plain description
              functionDef = { description: schema };
            }
          } else {
            functionDef = schema;
          }

          // Build the functions array and set function_call
          const functions = [
            {
              name: functionDef.name || "execute_function",
              description: functionDef.description || "Execute a function",
              parameters: functionDef.parameters || {
                type: "object",
                properties: {},
              },
            },
          ];

          return {
            functions,
            function_call: { name: functions[0].name },
          };
        },
        processResponse: (response) => {
          // Handle different response formats
          if (typeof response === "string") {
            return response;
          }

          // Handle function call format
          if (
            response &&
            response.function_call &&
            response.function_call.arguments
          ) {
            return response.function_call.arguments;
          }

          // For all other cases, return string representation
          return typeof response === "string"
            ? response
            : JSON.stringify(response);
        },
      };
    }
  }

  // Set the schema strategy in options for downstream handlers
  options.schemaStrategy = schemaStrategy;

  // Request parameters validation and preparation
  const requestParams = prepareRequestParams(prompt, options);

  // Check if this should be a streaming or non-streaming call
  if (options.stream) {
    if (debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Making streaming request`);
    }

    // Return the streaming generator
    return callAIStreaming(requestParams.messages, options);
  } else {
    if (debug) {
      console.log(`[callAI:${PACKAGE_VERSION}] Making non-streaming request`);
    }

    // Return the non-streaming promise
    return callAINonStreaming(requestParams.messages, options);
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
    // Process each chunk as it arrives
    for await (const chunk of generator) {
      result = chunk; // Each chunk is the complete text so far
    }

    return result;
  } catch (error) {
    // Throw with detailed error
    console.error(`[callAI:${PACKAGE_VERSION}] Error in streaming:`, error);

    // Enhance the error message
    if (error instanceof Error) {
      // If no content accumulated, throw the original error
      if (!result) {
        throw error;
      }

      // Otherwise throw with partial content
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
  generator: AsyncGenerator<string, string, unknown>,
) {
  // We need to capture the first iteration of the generator
  // so we can return it on the first next() call
  let firstIteration: Promise<IteratorResult<string, string>> | null = null;

  // Start iterator but don't resolve it yet
  firstIteration = generator.next();

  // Legacy warning displayed once per session
  let warnedLegacy = false;

  // Create a proxy that looks like a generator but handles pre-await access
  const proxy = {
    // Make it look like a generator with these methods
    next: async () => {
      if (!warnedLegacy) {
        console.warn(
          `[callAI:${PACKAGE_VERSION}] DEPRECATION WARNING: You are using streaming without 'await'. ` +
            `This backward compatibility mode will be removed in a future version. ` +
            `Please update your code to: const stream = await callAI(..., { stream: true });`,
        );
        warnedLegacy = true;
      }

      if (firstIteration) {
        const result = await firstIteration;
        firstIteration = null;
        return result;
      }

      return generator.next();
    },
    return: (value?: any) => generator.return(value as string),
    throw: (e?: any) => generator.throw(e),

    // Make it iterable
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return proxy;
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
