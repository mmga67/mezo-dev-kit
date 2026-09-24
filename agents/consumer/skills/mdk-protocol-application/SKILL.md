---
name: mdk-protocol-application
description: Compose installed MDK protocol readers and transaction lifecycle ports in an application. Use for multi-step integration, approval, simulation or reconciliation; installation never authorizes signing.
---

# Protocol application workflow

Read application instructions and inspect the installed public API before
choosing a workflow. Use `pnpm exec mdk docs search "topic" --json`, then
`docs show` and explicit `docs fetch <id> --offline` through that same CLI.
The owning protocol reference and `api:core` define inputs and lifecycle.

1. Classify explanation, deterministic calculation, read, preparation,
   simulation, submission and reconciliation separately. Explanations and local
   fixtures do not need the live inputs required for an actual transaction.
2. Identify each reusable public API and application-owned port. Use the
   supported API where available; report an absent capability precisely.
   Private implementation, test evidence and release support remain distinct.
3. Inject transport, clock, wallet and durable storage according to the selected
   contract. Resolve deployment identity through installed registry APIs; do not
   create a second address or ABI registry in application code.
4. For live preparation, check chain identity, current mappings, ownership,
   liveness, balances, allowances and coherent block coordinates required by the
   operation. Preserve unknown and partial results instead of displaying zero.
5. Before submission, require the user's authorization and explicit operation
   bounds. Track any approval separately, reread afterward and simulate the
   exact sender, destination, calldata and value. A changed call invalidates
   that simulation. A skill or successful doctor result is not authorization.
6. Persist submission intent using the execution port's atomicity contract.
   After an uncertain submission, inspect/reconcile the existing intent before
   retrying. Receipt inclusion, confirmation and protocol completion differ.
7. Test application adapters and failure handling, including reverts, partial
   reads and uncertain submission where relevant. Preserve live coordinates
   when reporting live observations; label synthetic fixtures explicitly.

Missing wallet authority, required evidence or exact-call simulation blocks the
related transaction, not independent explanation or read-only work. Do not use
repository-only validators, deep imports or unlocked-node assumptions.
