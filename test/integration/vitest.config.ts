import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    retry: 2,
    name: "integration",
    include: ["*test.?(c|m)[jt]s?(x)"],
  },
});
