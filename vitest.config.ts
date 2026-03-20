import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["packages/*/src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@typecek/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@typecek/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      "@typecek/compiler": path.resolve(__dirname, "packages/compiler/src/index.ts"),
    },
  },
});
