import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/tests/test-context-retrieval.test.ts",
      "scripts/tests/test-local-tasks.test.ts",
      "scripts/tests/test-pool-source.test.ts",
      "scripts/tests/test-voting-interfaces.test.ts",
      "scripts/tests/test-third-party-incentives.test.ts",
      "scripts/tests/test-source-boundary.test.ts",
      "scripts/tests/test-coding-gates.test.ts",
      "scripts/tests/test-evidence-scope.test.ts",
      "scripts/tests/test-current-price-state.test.ts",
      "scripts/tests/test-indexing-reconciliation.test.ts",
      "scripts/tests/test-foundational-package-generation.test.ts",
      "scripts/tests/test-savings-generation.test.ts",
      "scripts/tests/test-lending-generation.test.ts",
      "scripts/tests/test-vault-generation.test.ts",
      "scripts/tests/test-knowledge-authoring-example.test.ts",
      "scripts/tests/test-capability-fixtures.test.ts",
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
