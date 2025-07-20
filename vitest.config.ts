import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    retry: 2,
    name: "call-ai",
    include: ["test/**/*test.?(c|m)[jt]s?(x)"],
  },
});
