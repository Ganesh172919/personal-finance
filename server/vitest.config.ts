import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
