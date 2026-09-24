import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/tests/test-browser-packages.test.ts"],
    environment: "node",
    globals: false,
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    allowOnly: false,
    passWithNoTests: false,
    hookTimeout: 120000,
    testTimeout: 60000,
  },
});
