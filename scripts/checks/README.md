# Checks and validators

[Scripts manual](../README.md) · Run from the repository root after installing
dependencies. Validators exit nonzero when their declared constraints fail.
They read local source/evidence; they do not capture replacement live evidence.

## Repository checks

| Script                                                           | Preferred command / purpose                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [validate-package-boundaries.ts](validate-package-boundaries.ts) | `pnpm boundaries` — declared package exports/dependencies and dependency direction                                                       |
| [validate-source-boundary.ts](validate-source-boundary.ts)       | `pnpm check:source` — source/history privacy boundary; `--base <ref>` checks incoming history and `--pre-push` consumes Git's push input |
| [validate-markdown-links.ts](validate-markdown-links.ts)         | `node scripts/checks/validate-markdown-links.ts` — local links in the maintained documentation roots, including scripts manuals          |
| [validate-manifest-version.ts](validate-manifest-version.ts)     | `node scripts/checks/validate-manifest-version.ts` — manifest version/changelog consistency                                              |

`pnpm check:tasks` routes to [workspace/tasks.ts](../workspace/tasks.ts), and
skill validation is in [agents/](../agents/README.md).

## Select knowledge checks

Start with the owning module's `README.md` and `index.json` through the
[knowledge catalog](../../knowledge/README.md). Run its declared checks when
changing that module; structural validation alone does not prove semantics.

```sh
node scripts/checks/validate-knowledge-structure.ts --module networks
node scripts/checks/validate-network-knowledge.ts
node scripts/generate/generate-network-reference.ts --check
```

| Script                                                                               | Arguments / scope                                                                                                           |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [validate-knowledge-structure.ts](validate-knowledge-structure.ts)                   | All discovered indexes by default; `--module <id>`, `--require-all-v0.4`, or `--repository-root <path>`; supports `--help`  |
| [validate-knowledge-catalog.ts](validate-knowledge-catalog.ts)                       | Root module inventory and reference resolution                                                                              |
| [validate-knowledge-workflows.ts](validate-knowledge-workflows.ts)                   | Maintained workflow requirement records                                                                                     |
| [validate-knowledge-authoring-example.ts](validate-knowledge-authoring-example.ts)   | Default synthetic widget example; optional `--module-root <path>`                                                           |
| [validate-network-knowledge.ts](validate-network-knowledge.ts)                       | Network identities, endpoint records, and capability evidence                                                               |
| [validate-contract-knowledge.ts](validate-contract-knowledge.ts)                     | Contract deployment/ABI provenance; optional `--network mezo-mainnet` or `--network mezo-testnet`                           |
| [validate-price-knowledge.ts](validate-price-knowledge.ts)                           | Price source/scaling/evidence rules; optional `--network mezo-mainnet` or `--network mezo-testnet`                          |
| [validate-musd-knowledge.ts](validate-musd-knowledge.ts)                             | Shared MUSD semantics                                                                                                       |
| [validate-borrowing-knowledge.ts](validate-borrowing-knowledge.ts)                   | MUSD borrowing model and evidence                                                                                           |
| [validate-redemption-knowledge.ts](validate-redemption-knowledge.ts)                 | Redemption model and evidence                                                                                               |
| [validate-institutional-debt-knowledge.ts](validate-institutional-debt-knowledge.ts) | Institutional debt model and evidence                                                                                       |
| [validate-economic-system-knowledge.ts](validate-economic-system-knowledge.ts)       | Requires `--module protocols/musd/savings`, `--module protocols/lending/musdc`, or `--module protocols/vaults/usdc-lending` |
| [validate-incentives-evidence.ts](validate-incentives-evidence.ts)                   | Incentives evidence and relationships                                                                                       |
| [validate-third-party-incentives.ts](validate-third-party-incentives.ts)             | Retained ThirdPartyVoter source, fixed-block gauge accounting, documentation scope and voting-window fixtures               |
| [validate-pool-knowledge.ts](validate-pool-knowledge.ts)                             | Pool model and evidence                                                                                                     |
| [validate-pool-source-bundles.ts](validate-pool-source-bundles.ts)                   | Retained pool-source bundle digests and mappings                                                                            |
| [validate-cl-call-knowledge.ts](validate-cl-call-knowledge.ts)                       | Concentrated-liquidity and gauge call interfaces                                                                            |
| [validate-swap-knowledge.ts](validate-swap-knowledge.ts)                             | Swap route and execution requirements                                                                                       |
| [validate-bridge-knowledge.ts](validate-bridge-knowledge.ts)                         | Bridge lifecycle and delivery evidence                                                                                      |
| [validate-transaction-knowledge.ts](validate-transaction-knowledge.ts)               | Transaction lifecycle and requirements                                                                                      |
| [validate-troubleshooting-knowledge.ts](validate-troubleshooting-knowledge.ts)       | Troubleshooting issue/evidence consistency                                                                                  |

Where no arguments are listed, invoke `node scripts/checks/<filename>`.
Avoid running every validator with an argument-free shell glob: the economic
system validator requires a module selection.

## Mainnet reader evidence

[check-mainnet-reader-evidence.ts](check-mainnet-reader-evidence.ts) runs the
declared checks of its selected dependency modules, applying the mainnet flag
to the Contract and Price validators. Build EVM first when invoking it directly:

```sh
pnpm --filter @mezo-dev-kit/evm build
pnpm check:evidence:mainnet
# Full code checks followed by the selected evidence checks:
pnpm check:readers:mainnet
```

The default Contract and Price validators retain their full-module scope.
Freshness failures must be addressed through the
[oracle refresh procedure](../../docs/guides/oracle-evidence-refresh.md) and
owning evidence records. Selecting mainnet changes the scope of the check; it
does not repair or approve other networks' evidence.
