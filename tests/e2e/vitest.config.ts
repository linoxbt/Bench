import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 3 * 60 * 60 * 1000, // Bradbury finality (~30 min) plus appeal windows
    hookTimeout: 10 * 60 * 1000,
    fileParallelism: false,
  },
});
