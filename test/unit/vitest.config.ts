import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    retry: 2,
    name: "unit",
    include: ["*test.?(c|m)[jt]s?(x)"],
  },
});
