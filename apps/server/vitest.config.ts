import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { VITEST: "true", DEEPKEY_DATA_DIR: "./tmp-test-data" },
  },
});
