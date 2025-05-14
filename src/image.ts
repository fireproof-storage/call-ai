/**
 * Image generation API implementation for call-ai
 * Integration with custom image generation API
 */
import { ImageGenOptions, ImageResponse } from "./types";

// Import package version for debugging (same as main API)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PACKAGE_VERSION = require("../package.json").version;

/**
 * Generate images using a custom API that mimics OpenAI's image generation capabilities
 * @param prompt Text prompt describing the image to generate
 * @param options Configuration options for the image generation request
 * @returns A Promise that resolves to the image response containing base64 encoded image data
 */
export async function imageGen(
  prompt: string,
  options: ImageGenOptions = {},
): Promise<ImageResponse> {
  const {
    model = "gpt-image-1",
    apiKey = "VIBES_DIY",
    debug = false,
    size = "1024x1024",
  } = options;

  if (debug) {
    console.log(
      `[imageGen:${PACKAGE_VERSION}] Generating image with prompt: ${prompt.substring(0, 50)}...`,
    );
    console.log(`[imageGen:${PACKAGE_VERSION}] Using model: ${model}`);
  }

  // Get custom origin if set
  const customOrigin =
    options.imgUrl ||
    (typeof window !== "undefined" ? (window as any).CALLAI_IMG_URL : null) ||
    (typeof process !== "undefined" && process.env
      ? process.env.CALLAI_IMG_URL
      : null);

  try {
    // Handle image generation
    if (!options.images || options.images.length === 0) {
      // Simple image generation with text prompt
      // Use custom origin or document.location.origin
      const origin =
        customOrigin ||
        (typeof document !== "undefined" ? document.location.origin : "");
      const generateEndpoint = `${origin}/api/openai-image/generate`;

      const response = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          ...(options.quality && { quality: options.quality }),
          ...(options.style && { style: options.style }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Image generation failed: ${response.status} ${response.statusText} - ${errorData}`,
        );
      }

      const result = await response.json();
      return result;
    } else {
      // Image editing with multiple input images
      const formData = new FormData();
      formData.append("model", model);
      formData.append("prompt", prompt);

      // Add each image to the form data
      options.images.forEach((image, index) => {
        formData.append(`image_${index}`, image);
      });

      // Add parameters
      formData.append("size", size);
      if (options.quality) formData.append("quality", options.quality);
      if (options.style) formData.append("style", options.style);

      // Use custom origin or document.location.origin
      const origin =
        customOrigin ||
        (typeof document !== "undefined" ? document.location.origin : "");
      const editEndpoint = `${origin}/api/openai-image/edit`;

      const response = await fetch(editEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Image editing failed: ${response.status} ${response.statusText} - ${errorData}`,
        );
      }

      const result = await response.json();
      return result;
    }
  } catch (error) {
    if (debug) {
      console.error(`[imageGen:${PACKAGE_VERSION}] Error:`, error);
    }
    throw error;
  }
}
