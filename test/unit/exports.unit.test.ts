/**
 * Test to verify export aliases for backward compatibility
 */

import { describe, it, expect } from "vitest";
import * as exports from "call-ai";

describe("Export Aliases", () => {
  it("should export both callAi and callAI for backward compatibility", () => {
    //const exports = require("../src/index");

    // Both export names should exist
    expect(typeof exports.callAi).toBe("function");
    expect(typeof exports.callAI).toBe("function");

    // They should be the same function
    expect(exports.callAi).toBe(exports.callAI);
  });
});
