import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      META_APP_SECRET: "test-meta-app-secret",
      AUTH_SECRET: "test-auth-secret",
      DATABASE_URL:
        "postgresql://build:build@127.0.0.1:5432/build?schema=public",
    },
    clearMocks: true,
  },
});
