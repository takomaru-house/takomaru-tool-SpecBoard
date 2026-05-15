import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["__tests__/**/*.test.{js,ts}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 80, branches: 70 },
      include: ["src/**/*.js"],
    },
    setupFiles: ["./__tests__/setup.js"],
  },
});
