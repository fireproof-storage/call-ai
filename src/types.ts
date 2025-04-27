/**
 * Type definitions for call-ai
 */

/**
 * Content types for multimodal messages
 */
export type ContentItem = {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
};

/**
 * Message type supporting both simple string content and multimodal content
 */
export type Message = {
  role: "user" | "system" | "assistant";
  content: string | ContentItem[];
};

export interface Schema {
  /**
   * Optional schema name - will be sent to OpenRouter if provided
   * If not specified, defaults to "result"
   */
  name?: string;
  /**
   * Properties defining the structure of your schema
   */
  properties: Record<string, any>;
  /**
   * Fields that are required in the response (defaults to all properties)
   */
  required?: string[];
  /**
   * Whether to allow fields not defined in properties (defaults to false)
   */
  additionalProperties?: boolean;
  /**
   * Any additional schema properties to pass through
   */
  [key: string]: any;
}

/**
 * Strategy interface for handling different model types
 */
export interface ModelStrategy {
  name: string;
  prepareRequest: (schema: Schema | null, messages: Message[]) => any;
  processResponse: (content: string | any) => string;
  shouldForceStream?: boolean;
}

/**
 * Schema strategies for different model types
 */
export type SchemaStrategyType =
  | "json_schema"
  | "tool_mode"
  | "system_message"
  | "none";

/**
 * Strategy selection result
 */
export interface SchemaStrategy {
  strategy: SchemaStrategyType;
  model: string;
  prepareRequest: ModelStrategy["prepareRequest"];
  processResponse: ModelStrategy["processResponse"];
  shouldForceStream: boolean;
}

/**
 * Return type for streaming API calls
 */
export type StreamResponse = AsyncGenerator<string, string, unknown>;

/**
 * @internal
 * Internal type for backward compatibility with v0.6.x
 * This type is not exposed in public API documentation
 */
export type ThenableStreamResponse = AsyncGenerator<string, string, unknown> &
  Promise<StreamResponse>;

export interface CallAIOptions {
  /**
   * API key for authentication
   */
  apiKey?: string;

  /**
   * Model ID to use for the request
   */
  model?: string;

  /**
   * API endpoint to send the request to
   */
  endpoint?: string;

  /**
   * Whether to stream the response
   */
  stream?: boolean;

  /**
   * Schema for structured output
   */
  schema?: Schema | null;

  /**
   * Modalities to enable in the response (e.g., ["image", "text"])
   * Used for multimodal models that can generate images
   */
  modalities?: string[];

  /**
   * Whether to skip retry with fallback model when model errors occur
   * Useful in testing and cases where retries should be suppressed
   */
  skipRetry?: boolean;

  /**
   * Enable raw response logging without any filtering or processing
   */
  debug?: boolean;

  /**
   * Any additional options to pass to the API
   */
  [key: string]: any;
}

export interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

/**
 * Response from image generation API
 */
export interface ImageResponse {
  created: number;
  data: {
    b64_json: string;
    url?: string;
    revised_prompt?: string;
  }[];
}

/**
 * Options for image generation
 */
export interface ImageGenOptions {
  /**
   * API key for authentication
   * Defaults to "VIBES_DIY"
   */
  apiKey?: string;

  /**
   * Model to use for image generation
   * Defaults to "gpt-image-1"
   */
  model?: string;

  /**
   * Size of the generated image
   */
  size?: string;

  /**
   * Quality of the generated image
   */
  quality?: string;

  /**
   * Style of the generated image
   */
  style?: string;

  /**
   * For image editing: array of File objects to be edited
   */
  images?: File[];

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * @deprecated Use ImageGenOptions instead
 */
export interface ImageEditOptions extends ImageGenOptions {}
