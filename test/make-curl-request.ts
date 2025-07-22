// Script to make a curl request using API key from .env
import * as fs from "node:fs";
import { execSync } from "child_process";
import * as process from "node:process";

// Get API key from environment, trying both variables
const apiKey = process.env.CALLAI_API_KEY || process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error("Error: No API key found. Please set CALLAI_API_KEY or OPENROUTER_API_KEY in your .env file.");
  process.exit(1);
}

// Read the request file
const requestFile = process.argv[2] || "test/fixtures/claude-tool-request.json";
const responseFile = process.argv[3] || "test/fixtures/claude-tool-response.json";

console.log(`Making request using ${requestFile} and saving to ${responseFile}`);

// Build the curl command
const curlCmd = `curl -X POST "https://openrouter.ai/api/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer ${apiKey}" -d @${requestFile} -s`;

try {
  // Execute curl command and capture output
  const output = execSync(curlCmd).toString();

  // Save response to file
  fs.writeFileSync(responseFile, output);

  console.log("Response saved to", responseFile);
  console.log("Response preview:");
  console.log(output.substring(0, 500) + (output.length > 500 ? "..." : ""));
} catch (error) {
  console.error("Error executing curl command:", (error as Error).message);
}
