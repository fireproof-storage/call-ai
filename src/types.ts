/**
 * Type definitions for call-ai
 */

export type Message = {
  role: 'user' | 'system' | 'assistant';
  content: string;
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
export type SchemaStrategyType = 'json_schema' | 'tool_mode' | 'system_message' | 'none';

/**
 * Strategy selection result
 */
export interface SchemaStrategy {
  strategy: SchemaStrategyType;
  model: string;
  prepareRequest: ModelStrategy['prepareRequest'];
  processResponse: ModelStrategy['processResponse'];
  shouldForceStream: boolean;
}

export interface CallAIOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  stream?: boolean;
  schema?: Schema | null;
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