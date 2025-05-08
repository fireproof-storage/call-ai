/**
 * call-ai: A lightweight library for making AI API calls
 */

// Export public types
export * from "./types";

// Export core API functions from their new locations
export { callAI, bufferStreamingResults } from "./api-core";
export { getMeta } from "./response-metadata";

// Export key management functions for advanced use cases
export { initKeyStore } from "./key-management";

// Export image generation function
export { imageGen } from "./image";

// Export strategies and utilities for advanced use cases
export * from "./strategies";
export * from "./utils";
