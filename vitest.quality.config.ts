import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/test-coding-gates.test.ts",
      "scripts/test-evidence-scope.test.ts",
      "scripts/test-current-price-state.test.ts",
      "scripts/test-indexing-reconciliation.test.ts",
      "scripts/test-foundational-package-generation.test.ts",
      "scripts/test-savings-generation.test.ts",
      "scripts/test-lending-generation.test.ts",
      "scripts/test-vault-generation.test.ts",
      "scripts/test-knowledge-authoring-example.test.ts",
    ],
    environment: "node",
    globals: false,
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    allowOnly: false,
    passWithNoTests: false,
  },
});
