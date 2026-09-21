---
name: mdk-foundation-application
description: Use installed MDK foundation packages in an independent TypeScript application. Find matching API contracts and knowledge for EVM values, network identity, deployment resolution, and coherent reads; do not use for MDK repository maintenance.
---

# MDK foundation application

## Scope

Use for applications with an installed MDK artifact set and matching consumer
references. Private pilot artifacts remain source-alpha integrations; this
skill does not establish a public release or protocol-writer support.

## Procedure

1. Read the application's root and nearest nested AGENTS.md and existing code.
   Preserve its architecture, package manager, and testing conventions.
2. Run the project's local `mdk doctor` through its package manager to inspect
   SDK/reference compatibility. A diagnostic result is not live evidence.
3. Use `mdk docs search` to find the relevant public contract. Foundation API
   IDs are `api:evm`, `api:chains`, `api:contracts`, and `api:core`. Read only
   relevant references with `mdk docs show`. Files are also readable at the
   paths reported by the CLI and indexed in `.mdk/reference/bundle.json`.
4. Search the complete index for additional knowledge. For an uncached resource,
   try `mdk docs fetch "<id>" --offline` to copy it from the installed bundle.
   If it is absent there, online retrieval requires the project's network policy
   and the pinned origin declared by the bundle. Report an unavailable pinned
   resource; do not substitute current website documentation.
5. Inspect actual public exports before coding. EVM owns value validation;
   Chains owns network identity; Contracts owns deployment/ABI resolution; Core
   coordinates coherent reads using explicit application-owned transport.
   Inject transport, clocks, and application policy where the API requires them.
6. Preserve reference scope, support status, dates, and limitations. Knowledge
   describes protocol behavior; it does not create a missing public API or
   authorize signing. Current operations separately require their live inputs.
7. Use TypeScript and public `@mezo-dev-kit/*` imports. Keep financial values in
   integer base units and validate untrusted inputs at the application boundary.

## Verification

Run the application's meaningful typecheck, tests, and build. Distinguish
deterministic fixtures from actual RPC observations. Report an absent public
capability or incompatible guidance before implementing a protocol assumption.

## Boundaries

Do not copy addresses, ABIs, or protocol formulas from references into a second
application registry. Do not import MDK source paths or run repository
maintenance procedures. Keep project-specific instructions in application-owned
files; synchronized MDK skill directories are generated installation output.
