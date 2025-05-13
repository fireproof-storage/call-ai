/**
 * call-ai: A lightweight library for making AI API calls
 */

// Export public types
export * from "./types";

// Export API functions
export { callAi, getMeta } from "./api";
// Backward compatibility for callAI (uppercase AI)
export { callAi as callAI } from "./api";

// Export image generation function
export { imageGen } from "./image";
