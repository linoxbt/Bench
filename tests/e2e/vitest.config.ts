import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 90 * 60 * 1000, // finality (minutes on Bradbury) + a 30-minute escrow expiry for the reclaim case
    hookTimeout: 10 * 60 * 1000,
    fileParallelism: false,
  },
});
