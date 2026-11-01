import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: true,
    maxConcurrency: 4,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
