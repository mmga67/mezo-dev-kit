# Automation tests

[Scripts manual](../README.md) · Run from the repository root with dependencies
installed. The filename alone does not determine the test runner.

## Normal commands

| Command             | Coverage and prerequisites                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:quality` | The automation Vitest suites explicitly selected by [vitest.quality.config.ts](../../vitest.quality.config.ts)                                                                                          |
| `pnpm test`         | Quality suites, then workspace packages' test commands                                                                                                                                                  |
| `pnpm test:shuffle` | Quality and package suites with the repository's reproducible shuffle seed                                                                                                                              |
| `pnpm test:built`   | Built-package/public-entrypoint checks plus examples; run `pnpm build` first                                                                                                                            |
| `pnpm test:browser` | Packed SDKs in Chromium, Firefox and WebKit, browser declarations, Node imports and bundle budgets; build and [install browsers](../../docs/guides/BROWSER_APPLICATIONS.md#verify-an-integration) first |
| `pnpm test:clean`   | Copies source to a temporary workspace, installs from the local pnpm store offline, typechecks, builds, tests entrypoints/examples, and verifies both skill audiences                                   |

Target one Vitest suite:

```sh
pnpm test:quality scripts/tests/test-local-tasks.test.ts
```

## Vitest suites

| Suites                                                                                                                                                                                                 | Contract under test                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [test-local-tasks.test.ts](test-local-tasks.test.ts)                                                                                                                                                   | Local task creation, guidance, lifecycle structure, and invalid trees                                             |
| [test-source-boundary.test.ts](test-source-boundary.test.ts)                                                                                                                                           | Source/history boundaries and Git fixtures                                                                        |
| [test-coding-gates.test.ts](test-coding-gates.test.ts)                                                                                                                                                 | Type/lint/boundary rejection of deliberately invalid fixtures                                                     |
| [test-capability-fixtures.test.ts](test-capability-fixtures.test.ts)                                                                                                                                   | Synthetic capability-fixture preparation                                                                          |
| [test-pool-source.test.ts](test-pool-source.test.ts)                                                                                                                                                   | Retained source resolution and digest validation                                                                  |
| [test-voting-interfaces.test.ts](test-voting-interfaces.test.ts)                                                                                                                                       | Generated voting interface evidence                                                                               |
| [test-third-party-incentives.test.ts](test-third-party-incentives.test.ts)                                                                                                                             | Retained source/gauge evidence, direct-vote boundaries, recipient distinctions and unsupported delivery rejection |
| [test-evidence-scope.test.ts](test-evidence-scope.test.ts)                                                                                                                                             | Network scope, freshness, and import failure boundaries                                                           |
| [test-current-price-state.test.ts](test-current-price-state.test.ts)                                                                                                                                   | Current-price-state evidence parsing/validation                                                                   |
| [test-indexing-reconciliation.test.ts](test-indexing-reconciliation.test.ts)                                                                                                                           | Bounded indexing and reconciliation cases                                                                         |
| [test-foundational-package-generation.test.ts](test-foundational-package-generation.test.ts)                                                                                                           | Chains/Contracts generation and malformed input rejection                                                         |
| [test-savings-generation.test.ts](test-savings-generation.test.ts), [test-lending-generation.test.ts](test-lending-generation.test.ts), [test-vault-generation.test.ts](test-vault-generation.test.ts) | Projection drift and evidence failures in temporary repositories                                                  |
| [test-knowledge-authoring-example.test.ts](test-knowledge-authoring-example.test.ts)                                                                                                                   | Executable synthetic authoring example and invalid cases                                                          |

## Standalone checks

These are separate from the quality Vitest selection. Run them explicitly when
changing their owning automation or when a module index requires them:

| Script                                                     | Command / purpose                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [test-agent-skills.test.ts](test-agent-skills.test.ts)     | `node --test scripts/tests/test-agent-skills.test.ts` — established Node test runner for skill validation/materialization |
| [test-contract-provenance.ts](test-contract-provenance.ts) | `node scripts/tests/test-contract-provenance.ts` — provenance negative cases                                              |
| [test-network-profiles.ts](test-network-profiles.ts)       | `node scripts/tests/test-network-profiles.ts` — network capability profile cases                                          |
| [test-knowledge-structure.ts](test-knowledge-structure.ts) | `node scripts/tests/test-knowledge-structure.ts` — synthetic v0.4 modules and invalid references                          |
| [test-manifest-version.ts](test-manifest-version.ts)       | `node scripts/tests/test-manifest-version.ts` — manifest/changelog rules                                                  |

## Built artifacts and clean checkout

`pnpm test:built` invokes these scripts in its declared order:

- [test-foundational-built-packages.ts](test-foundational-built-packages.ts)
- [test-savings-built-package.ts](test-savings-built-package.ts)
- [test-lending-built-package.ts](test-lending-built-package.ts)
- [test-vault-built-package.ts](test-vault-built-package.ts)
- [test-borrowing-built-package.ts](test-borrowing-built-package.ts)
- [test-sdk-references.ts](test-sdk-references.ts)
- [test-writer-built-packages.ts](test-writer-built-packages.ts)
- [test-native-built-package.ts](test-native-built-package.ts)
- [test-cli-built-package.ts](test-cli-built-package.ts)

To isolate a failure, run `pnpm build` and then `node scripts/tests/<filename>`.
These checks exercise imports, declarations, SDK reference examples, or
deterministic operation fixtures through built entrypoints. They do not submit
live transactions.

The CLI built check additionally generates a reference bundle under
`packages/cli/dist/assets`, packs the prebuilt packages, and verifies an external
consumer in a temporary directory with offline installation and retrieval.
It requires the local pnpm store and the current CLI distribution inputs.

[test-clean-workspace.ts](test-clean-workspace.ts) backs `pnpm test:clean`.
It excludes local/private roots and build/install output from the copied source,
requires the pinned dependencies in the local store, and removes its temporary
workspace after success or failure. See the
[testing standard](../../docs/standards/testing.md) before adding a suite.
