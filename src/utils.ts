/**
 * Utility functions for call-ai
 */

/**
 * Recursively adds additionalProperties: false to all object types in a schema
 * This is needed for OpenAI's strict schema validation in streaming mode
 */
export function recursivelyAddAdditionalProperties(schema: any): any {
  // Clone to avoid modifying the original
  const result = { ...schema };

  // If this is an object type, ensure it has additionalProperties: false
  if (result.type === "object") {
    // Set additionalProperties if not already set
    if (result.additionalProperties === undefined) {
      result.additionalProperties = false;
    }

    // Process nested properties if they exist
    if (result.properties) {
      result.properties = { ...result.properties };

      // Set required if not already set - OpenAI requires this for all nested objects
      if (result.required === undefined) {
        result.required = Object.keys(result.properties);
      }

      // Check each property
      Object.keys(result.properties).forEach((key) => {
        const prop = result.properties[key];

        // If property is an object or array type, recursively process it
        if (prop && typeof prop === "object") {
          result.properties[key] = recursivelyAddAdditionalProperties(prop);

          // For nested objects, ensure they also have all properties in their required field
          if (prop.type === "object" && prop.properties) {
            prop.required = Object.keys(prop.properties);
          }
        }
      });
    }
  }

  // Handle nested objects in arrays
  if (
    result.type === "array" &&
    result.items &&
    typeof result.items === "object"
  ) {
    result.items = recursivelyAddAdditionalProperties(result.items);

    // If array items are objects, ensure they have all properties in required
    if (result.items.type === "object" && result.items.properties) {
      result.items.required = Object.keys(result.items.properties);
    }
  }

  return result;
}

class CallAIEnv {

  private getEnv(key: string): string | undefined {
    if (window && key in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any)[key];
    }
    if (process && process.env) {
      return process.env[key];
    }
    console.warn("[callAi] Environment variable not found:", key);
    return undefined;
  }

  get CALLAI_IMG_URL() {
    return this.getEnv("CALLAI_IMG_URL");
  }

  get CALLAI_CHAT_URL() {
    return this.getEnv("CALLAI_CHAT_URL");
  }

  get CALLAI_API_KEY() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.getEnv("CALLAI_API_KEY") ?? this.getEnv("OPENROUTER_API_KEY") ?? (window as any).callAi?.API_KEY ??
      this.getEnv("LOW_BALANCE_OPENROUTER_API_KEY");
  }
  get CALLAI_REFRESH_ENDPOINT() {
    return this.getEnv("CALLAI_REFRESH_ENDPOINT");
  }
  get CALL_AI_REFRESH_TOKEN() {
    return this.getEnv("CALL_AI_REFRESH_TOKEN");
  }

  get CALLAI_REKEY_ENDPOINT() {
    return this.getEnv("CALLAI_REKEY_ENDPOINT");
  }
  get CALL_AI_KEY_TOKEN() {
    return this.getEnv("CALL_AI_KEY_TOKEN");
  }
  get CALLAI_REFRESH_TOKEN() {
    return this.getEnv("CALLAI_REFRESH_TOKEN");
  }
  get CALLAI_DEBUG() {
    return !!this.getEnv("CALLAI_DEBUG") ;
  }
}

export const callAiEnv = new CallAIEnv();
