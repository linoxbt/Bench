import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/local/**/*.test.ts"],
    globalSetup: ["tests/local/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
