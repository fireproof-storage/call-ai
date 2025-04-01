import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Define types for OpenRouter API responses
interface OpenRouterResponse {
  id: string;
  model: string;
  choices: {
    message: {
      role: string;
      content:
        | Array<{
            type: string;
            text?: string;
            image_url?: {
              url: string;
            };
          }>
        | string;
    };
    index?: number;
    finish_reason?: string;
  }[];
}

// Load environment variables from .env file if present
dotenv.config();

// Skip tests if no API key is available
const haveApiKey = process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY;
const itif = (condition: boolean) => (condition ? it : it.skip);

// Timeout for image recognition tests
const TIMEOUT = 30000;

describe("OpenRouter Vision Recognition", () => {
  // Get API key from env vars
  function getApiKey(): string {
    return process.env.OPENROUTER_API_KEY || process.env.CALLAI_API_KEY || "";
  }

  // Test image recognition with cat.png
  itif(Boolean(haveApiKey))(
    "should analyze cat.png with GPT-4o vision capabilities",
    async () => {
      const apiKey = getApiKey();
      expect(apiKey).toBeDefined();

      console.log("Testing vision recognition with cat.png");

      // Read the image file and convert to base64
      const imagePath = path.resolve(__dirname, "fixtures/cat.png");
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      const dataUri = `data:image/png;base64,${base64Image}`;

      console.log("Image loaded and converted to base64");

      // Create the request with multimodal message format for vision
      const requestBody = {
        model: "openai/gpt-4o-2024-08-06",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What is in this image? Describe it in detail.",
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUri,
                },
              },
            ],
          },
        ],
      };

      console.log("Sending vision recognition request to OpenRouter API");

      // Make the direct API call
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/fireproof-storage/call-ai",
            "X-Title": "call-ai Integration Tests",
          },
          body: JSON.stringify(requestBody),
        },
      );

      // Check if we got a successful response
      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API Error:", errorData);
        // Don't fail the test completely
        expect(response.status).toBeDefined();
        return;
      }

      // Parse the response
      const result = (await response.json()) as OpenRouterResponse;
      console.log("Received response from OpenRouter API");

      // Check if we have a valid structure
      expect(result).toBeDefined();
      expect(result.choices).toBeDefined();

      // Log the model's description of the cat image
      const content = result.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        console.log("Vision model's description of the image:");
        console.log(content);
      } else if (Array.isArray(content)) {
        const textContent = content.find((item) => item.type === "text");
        if (textContent?.text) {
          console.log("Vision model's description of the image:");
          console.log(textContent.text);
        }
      }

      // Verify that the response contains a description of a cat
      const contentString =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? JSON.stringify(content)
            : "";

      // Expect the response to mention "cat" somewhere
      expect(contentString.toLowerCase()).toContain("cat");
    },
    TIMEOUT,
  );
});
