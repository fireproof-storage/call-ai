/**
 * Core API implementation for call-ai
 */
import { CallAIOptions, Message, SchemaStrategy } from "./types";
import { chooseSchemaStrategy } from "./strategies";

// Default fallback model when the primary model fails or is unavailable
const FALLBACK_MODEL = "openrouter/auto";

/**
 * Make an AI API call with the given options
 * @param prompt User prompt as string or an array of message objects
 * @param options Configuration options including optional schema for structured output
 * @returns A Promise that resolves to the complete response string when streaming is disabled,
 *          or an AsyncGenerator that yields partial responses when streaming is enabled
 */
export function callAI(
  prompt: string | Message[],
  options: CallAIOptions = {},
): Promise<string> | AsyncGenerator<string, string, unknown> {
  // Check if we need to force streaming based on model strategy
  const schemaStrategy = chooseSchemaStrategy(
    options.model,
    options.schema || null,
  );

  // Handle special case: Claude with tools requires streaming
  if (!options.stream && schemaStrategy.shouldForceStream) {
    // Buffer streaming results into a single response
    return bufferStreamingResults(prompt, options);
  }

  // Handle normal non-streaming mode
  if (options.stream !== true) {
    return callAINonStreaming(prompt, options);
  }

  // Handle streaming mode
  return callAIStreaming(prompt, options);
}

/**
 * Buffer streaming results into a single response for cases where
 * we need to use streaming internally but the caller requested non-streaming
 */
async function bufferStreamingResults(
  prompt: string | Message[],
  options: CallAIOptions,
): Promise<string> {
  // Create a copy of options with streaming enabled
  const streamingOptions = {
    ...options,
    stream: true,
  };

  try {
    // Get streaming generator
    const generator = callAIStreaming(prompt, streamingOptions);

    // Buffer all chunks
    let finalResult = "";
    let chunkCount = 0;
    for await (const chunk of generator) {
      finalResult = chunk; // Each chunk contains the full accumulated text
      chunkCount++;
    }

    return finalResult;
  } catch (error) {
    return handleApiError(error, "Streaming buffer error");
  }
}

/**
 * Standardized API error handler
 */
function handleApiError(error: any, context: string): string {
  console.error(`[callAI:${context}]:`, error);
  return JSON.stringify({
    error: String(error),
    message: `Sorry, I couldn't process that request: ${String(error)}`,
  });
}

/**
 * Prepare request parameters common to both streaming and non-streaming calls
 */
function prepareRequestParams(
  prompt: string | Message[],
  options: CallAIOptions,
): {
  apiKey: string;
  model: string;
  endpoint: string;
  requestOptions: RequestInit;
  schemaStrategy: SchemaStrategy;
} {
  const apiKey =
    options.apiKey ||
    (typeof window !== "undefined" ? (window as any).CALLAI_API_KEY : null);
  const schema = options.schema || null;

  if (!apiKey) {
    throw new Error(
      "API key is required. Provide it via options.apiKey or set window.CALLAI_API_KEY",
    );
  }

  // Select the appropriate strategy based on model and schema
  const schemaStrategy = chooseSchemaStrategy(options.model, schema);
  const model = schemaStrategy.model;

  const endpoint =
    options.endpoint || "https://openrouter.ai/api/v1/chat/completions";

  // Handle both string prompts and message arrays for backward compatibility
  const messages: Message[] = Array.isArray(prompt)
    ? prompt
    : [{ role: "user", content: prompt }];

  // Build request parameters
  const requestParams: any = {
    model: model,
    stream: options.stream === true,
    messages: messages,
  };

  // Support for multimodal content (like images)
  if (options.modalities && options.modalities.length > 0) {
    requestParams.modalities = options.modalities;
  }

  // Apply the strategy's request preparation
  const strategyParams = schemaStrategy.prepareRequest(schema, messages);

  // If the strategy returns custom messages, use those instead
  if (strategyParams.messages) {
    requestParams.messages = strategyParams.messages;
  }

  // Add all other strategy parameters
  Object.entries(strategyParams).forEach(([key, value]) => {
    if (key !== "messages") {
      requestParams[key] = value;
    }
  });

  // Add any other options provided, but exclude internal keys
  Object.entries(options).forEach(([key, value]) => {
    if (!["apiKey", "model", "endpoint", "stream", "schema"].includes(key)) {
      requestParams[key] = value;
    }
  });

  const requestOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://vibes.diy",
      "X-Title": "Vibes",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestParams),
  };

  return { apiKey, model, endpoint, requestOptions, schemaStrategy };
}

/**
 * Internal implementation for non-streaming API calls
 */
async function callAINonStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {},
  isRetry: boolean = false
): Promise<string> {
  try {
    const { endpoint, requestOptions, model, schemaStrategy } =
      prepareRequestParams(prompt, options);

    const response = await fetch(endpoint, requestOptions);

    // Handle HTTP errors, with potential fallback for invalid model
    if (!response.ok) {
      // If we get a 400 status and it's not already a retry
      if (response.status === 400 && !isRetry) {
        // Clone the response so we can read the body
        const clonedResponse = response.clone();
        try {
          const errorData = await clonedResponse.json();
          // Check if the error message indicates an invalid model
          if (
            errorData.error &&
            errorData.error.message &&
            errorData.error.message.toLowerCase().includes('not a valid model')
          ) {
            console.warn(`Model ${model} not valid, retrying with ${FALLBACK_MODEL}`);
            // Retry with fallback model
            return callAINonStreaming(
              prompt, 
              { ...options, model: FALLBACK_MODEL },
              true
            );
          }
        } catch (parseError) {
          // If we can't parse the response as JSON, continue with original error
          console.error('Failed to parse error response:', parseError);
        }
      }
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    let result;

    // For Claude, use text() instead of json() to avoid potential hanging
    if (/claude/i.test(model)) {
      try {
        result = await extractClaudeResponse(response);
      } catch (error) {
        return handleApiError(error, "Claude API response processing failed");
      }
    } else {
      result = await response.json();
    }

    // Handle error responses
    if (result.error) {
      console.error("API returned an error:", result.error);
      // If it's a model error and not already a retry, try with fallback
      if (!isRetry && 
          result.error.message && 
          result.error.message.toLowerCase().includes('not a valid model')) {
        console.warn(`Model ${model} error, retrying with ${FALLBACK_MODEL}`);
        return callAINonStreaming(
          prompt, 
          { ...options, model: FALLBACK_MODEL },
          true
        );
      }
      return JSON.stringify({
        error: result.error,
        message: result.error.message || "API returned an error",
      });
    }

    // Extract content from the response
    const content = extractContent(result, schemaStrategy);

    // Process the content based on model type
    return schemaStrategy.processResponse(content);
  } catch (error) {
    return handleApiError(error, "Non-streaming API call");
  }
}

/**
 * Extract content from API response accounting for different formats
 */
function extractContent(result: any, schemaStrategy: SchemaStrategy): any {
  // Find tool use content or normal content
  let content;

  // Extract tool use content if necessary
  if (
    schemaStrategy.strategy === "tool_mode" &&
    result.stop_reason === "tool_use"
  ) {
    // Try to find tool_use block in different response formats
    if (result.content && Array.isArray(result.content)) {
      const toolUseBlock = result.content.find(
        (block: any) => block.type === "tool_use",
      );
      if (toolUseBlock) {
        content = toolUseBlock;
      }
    }

    if (!content && result.choices && Array.isArray(result.choices)) {
      const choice = result.choices[0];
      if (choice.message && Array.isArray(choice.message.content)) {
        const toolUseBlock = choice.message.content.find(
          (block: any) => block.type === "tool_use",
        );
        if (toolUseBlock) {
          content = toolUseBlock;
        }
      }
    }
  }

  // If no tool use content was found, use the standard message content
  if (!content) {
    if (!result.choices || !result.choices.length) {
      throw new Error("Invalid response format from API");
    }

    content = result.choices[0]?.message?.content || "";
  }

  return content;
}

/**
 * Extract response from Claude API with timeout handling
 */
async function extractClaudeResponse(response: Response): Promise<any> {
  let textResponse: string;
  const textPromise = response.text();
  const timeoutPromise = new Promise<string>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error("Text extraction timed out after 5 seconds"));
    }, 5000);
  });

  try {
    textResponse = (await Promise.race([
      textPromise,
      timeoutPromise,
    ])) as string;
  } catch (textError) {
    console.error(`Text extraction timed out or failed:`, textError);
    throw new Error(
      "Claude response text extraction timed out. This is likely an issue with the Claude API's response format.",
    );
  }

  try {
    return JSON.parse(textResponse);
  } catch (err) {
    console.error(`Failed to parse Claude response as JSON:`, err);
    throw new Error(`Failed to parse Claude response as JSON: ${err}`);
  }
}

/**
 * Internal implementation for streaming API calls
 */
async function* callAIStreaming(
  prompt: string | Message[],
  options: CallAIOptions = {},
  isRetry: boolean = false
): AsyncGenerator<string, string, unknown> {
  try {
    const { endpoint, requestOptions, model, schemaStrategy } =
      prepareRequestParams(prompt, { ...options, stream: true });

    const response = await fetch(endpoint, requestOptions);

    if (!response.ok) {
      // If we get a 400 status and it's not already a retry
      if (response.status === 400 && !isRetry) {
        // Clone the response so we can read the body
        const clonedResponse = response.clone();
        try {
          const errorData = await clonedResponse.json();
          // Check if the error message indicates an invalid model
          if (
            errorData.error &&
            errorData.error.message &&
            errorData.error.message.toLowerCase().includes('not a valid model')
          ) {
            console.warn(`Model ${model} not valid, retrying with ${FALLBACK_MODEL}`);
            // Retry with fallback model
            return yield* callAIStreaming(
              prompt, 
              { ...options, model: FALLBACK_MODEL },
              true
            );
          }
        } catch (parseError) {
          // If we can't parse the response as JSON, continue with original error
          console.error('Failed to parse error response:', parseError);
        }
      }
      const errorText = await response.text();
      console.error(
        `API Error: ${response.status} ${response.statusText}`,
        errorText,
      );
      throw new Error(
        `API returned error ${response.status}: ${response.statusText}`,
      );
    }

    // Handle streaming response
    if (!response.body) {
      throw new Error(
        "Response body is undefined - API endpoint may not support streaming",
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let completeText = "";
    let chunkCount = 0;
    let toolCallsAssembled = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value);

      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          // Skip [DONE] marker or OPENROUTER PROCESSING lines
          if (
            line.includes("[DONE]") ||
            line.includes("OPENROUTER PROCESSING")
          ) {
            continue;
          }

          try {
            const jsonLine = line.replace("data: ", "");
            if (!jsonLine.trim()) {
              continue;
            }

            chunkCount++;

            // Parse the JSON chunk
            const json = JSON.parse(jsonLine);

            // Handle tool use response - Claude with schema cases
            const isClaudeWithSchema =
              /claude/i.test(model) && schemaStrategy.strategy === "tool_mode";

            if (isClaudeWithSchema) {
              // Claude streaming tool calls - need to assemble arguments
              if (json.choices && json.choices.length > 0) {
                const choice = json.choices[0];

                // Handle finish reason tool_calls
                if (choice.finish_reason === "tool_calls") {
                  try {
                    // Parse the assembled JSON
                    completeText = toolCallsAssembled;
                    yield completeText;
                    continue;
                  } catch (e) {
                    console.error(
                      "[callAIStreaming] Error parsing assembled tool call:",
                      e,
                    );
                  }
                }

                // Assemble tool_calls arguments from delta
                if (choice.delta && choice.delta.tool_calls) {
                  const toolCall = choice.delta.tool_calls[0];
                  if (
                    toolCall &&
                    toolCall.function &&
                    toolCall.function.arguments !== undefined
                  ) {
                    toolCallsAssembled += toolCall.function.arguments;
                    // We don't yield here to avoid partial JSON
                  }
                }
              }
            }

            // Handle tool use response - old format
            if (
              isClaudeWithSchema &&
              (json.stop_reason === "tool_use" || json.type === "tool_use")
            ) {
              // First try direct tool use object format
              if (json.type === "tool_use") {
                completeText = schemaStrategy.processResponse(json);
                yield completeText;
                continue;
              }

              // Extract the tool use content
              if (json.content && Array.isArray(json.content)) {
                const toolUseBlock = json.content.find(
                  (block: any) => block.type === "tool_use",
                );
                if (toolUseBlock) {
                  completeText = schemaStrategy.processResponse(toolUseBlock);
                  yield completeText;
                  continue;
                }
              }

              // Find tool_use in assistant's content blocks
              if (json.choices && Array.isArray(json.choices)) {
                const choice = json.choices[0];
                if (choice.message && Array.isArray(choice.message.content)) {
                  const toolUseBlock = choice.message.content.find(
                    (block: any) => block.type === "tool_use",
                  );
                  if (toolUseBlock) {
                    completeText = schemaStrategy.processResponse(toolUseBlock);
                    yield completeText;
                    continue;
                  }
                }

                // Handle case where the tool use is in the delta
                if (choice.delta && Array.isArray(choice.delta.content)) {
                  const toolUseBlock = choice.delta.content.find(
                    (block: any) => block.type === "tool_use",
                  );
                  if (toolUseBlock) {
                    completeText = schemaStrategy.processResponse(toolUseBlock);
                    yield completeText;
                    continue;
                  }
                }
              }
            }

            // Extract content from the delta
            if (json.choices?.[0]?.delta?.content !== undefined) {
              const content = json.choices[0].delta.content || "";

              // Treat all models the same - yield as content arrives
              completeText += content;
              yield schemaStrategy.processResponse(completeText);
            }
            // Handle message content format (non-streaming deltas)
            else if (json.choices?.[0]?.message?.content !== undefined) {
              const content = json.choices[0].message.content || "";
              completeText += content;
              yield schemaStrategy.processResponse(completeText);
            }
            // Handle content blocks for Claude/Anthropic response format
            else if (
              json.choices?.[0]?.message?.content &&
              Array.isArray(json.choices[0].message.content)
            ) {
              const contentBlocks = json.choices[0].message.content;
              // Find text or tool_use blocks
              for (const block of contentBlocks) {
                if (block.type === "text") {
                  completeText += block.text || "";
                } else if (isClaudeWithSchema && block.type === "tool_use") {
                  completeText = schemaStrategy.processResponse(block);
                  break; // We found what we need
                }
              }

              yield schemaStrategy.processResponse(completeText);
            }
          } catch (e) {
            console.error(`[callAIStreaming] Error parsing JSON chunk:`, e);
          }
        }
      }
    }

    // If we have assembled tool calls but haven't yielded them yet
    if (toolCallsAssembled && (!completeText || completeText.length === 0)) {
      return toolCallsAssembled;
    }

    // Ensure the final return has proper, processed content
    return schemaStrategy.processResponse(completeText);
  } catch (error) {
    return handleApiError(error, "Streaming API call");
  }
}
