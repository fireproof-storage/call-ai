import { it, expect, TestAPI } from "vitest";

export function itif(condition: boolean): TestAPI | TestAPI["skip"] {
  return condition ? it : it.skip;
}

// Function to handle test expectations based on model grade
export function expectOrWarn(
  model: { id: string; grade: string },
  condition: boolean,
  message: string,
  debugValue?: unknown, // Added optional debug value parameter
) {
  if (model.grade === "A") {
    if (!condition) {
      // Enhanced debug logging for failures
      console.log(`DETAILED FAILURE for ${model.id}: ${message}`);
      if (debugValue !== undefined) {
        console.log("Debug value:", typeof debugValue === "object" ? JSON.stringify(debugValue, null, 2) : debugValue);
      }
    }
    expect(condition).toBe(true);
  } else if (!condition) {
    console.warn(`Warning (${model.id}): ${message}`);
  }
}

export function entriesHeaders(headers: Headers) {
  const entries: [string, string][] = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
}
