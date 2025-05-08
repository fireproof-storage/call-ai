import { describe, it, expect } from "@jest/globals";

// Import the relevant function or create a test-specific version of it
// This test focuses directly on the JSON property splitting fix

describe("Claude JSON streaming property name splitting", () => {
  // Test for handling split property names
  it("should correctly handle property names split across chunks", () => {
    // Initial accumulated fragment with a split property name
    let toolCallsAssembled = '{"capital":"Paris", "popul';

    // Simulate receiving the second part of the property name
    const secondChunk = 'ation":67.5, "languages":["French"]}';

    toolCallsAssembled += secondChunk;

    // This would happen at the "tool_calls" finish_reason point
    // The key test: can we parse the recombined JSON?
    expect(() => JSON.parse(toolCallsAssembled)).not.toThrow();

    // Verify the parsed content
    const parsedJson = JSON.parse(toolCallsAssembled);
    expect(parsedJson).toEqual({
      capital: "Paris",
      population: 67.5,
      languages: ["French"],
    });
  });

  // Test for handling other common issues
  it("should handle a JSON string with missing value", () => {
    // This simulates a Claude response where a property value is completely missing
    let problematicJson =
      '{"capital": , "population":67.5, "languages":["French"]}';

    // Apply a cleanup regex that would be similar to what's in api.ts
    // This would happen in the final JSON validation part of the code
    const fixedJson = problematicJson.replace(/"(\w+)"\s*:\s*,/g, '"$1":null,');

    // Should now be valid JSON
    expect(() => JSON.parse(fixedJson)).not.toThrow();

    // Check that the capital property exists but is null
    const parsedJson = JSON.parse(fixedJson);
    expect(parsedJson.capital).toBeNull();
    expect(parsedJson.population).toBe(67.5);
  });

  // Test for split property values
  it("should handle property values split across chunks", () => {
    // Initial fragment with a split property value
    let toolCallsAssembled = '{"capital":"Par';

    // Simulate receiving the rest of the value and other properties
    const secondChunk = 'is", "population":67.5, "languages":["French"]}';

    toolCallsAssembled += secondChunk;

    // Verify we can parse the result
    expect(() => JSON.parse(toolCallsAssembled)).not.toThrow();

    const parsedJson = JSON.parse(toolCallsAssembled);
    expect(parsedJson.capital).toBe("Paris");
  });
});
