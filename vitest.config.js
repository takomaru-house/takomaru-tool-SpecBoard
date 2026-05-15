import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // @vitejs/plugin-react で JSX を自動変換 (classic ランタイム = React.createElement 直接)
  // app.jsx は import 文を持たず、グローバル React を前提とするためクラシックを選ぶ
  plugins: [react({ jsxRuntime: "classic" })],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["__tests__/**/*.test.{js,jsx,ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 80, branches: 70 },
      include: ["src/**/*.js", "app.jsx"],
    },
    setupFiles: ["./__tests__/setup.js"],
  },
});
