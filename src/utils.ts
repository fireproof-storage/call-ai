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
