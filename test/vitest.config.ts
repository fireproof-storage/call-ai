import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["unit/vitest.config.ts", "integration/vitest.config.ts"],
  },
});
