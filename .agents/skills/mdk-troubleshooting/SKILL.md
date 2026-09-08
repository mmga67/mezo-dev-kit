---
name: mdk-troubleshooting
description: Diagnose reproduced Mezo RPC, protocol, documentation-drift or cross-chain symptoms. Use canonical evidence; never publish security findings.
---

# Mezo troubleshooting

## Purpose

Diagnose supported Mezo/MDK symptoms with reproducible evidence while keeping
underlying facts in their canonical network, contract, protocol, or workflow
owner.

## Use when

- An RPC result, simulation, receipt, or reconciled outcome is unexpected.
- Documentation and deployed behavior differ.
- A known integration symptom may match `knowledge/troubleshooting/`.

## Do not use when

- The only evidence is a memory record, raw log, or anecdote.
- The task is a product UI/database/cache bug with no MDK behavior impact.
- A security finding would be disclosed without the repository security process.

## Relevant repository areas

- `knowledge/troubleshooting/`
- `docs/troubleshooting/`
- the linked canonical domain owner
- `knowledge/workflows/transactions/`

## Required canonical sources

1. Root/local `AGENTS.md` and active task.
2. Module `troubleshooting`, resource `troubleshooting-reference` for human
   routing, and the one matching `issue-*` resource for diagnosis.
3. Every canonical link and exact evidence locator in that issue.
4. Current network/deployment/source evidence for volatile or write-sensitive
   diagnoses.

## Domain routing

- Route classic MUSD trove, capacity, refinance, and redemption symptoms to the
  applicable MUSD owner before maintaining a troubleshooting issue.
- Route BTC/mUSDC market, share, interest, health, liquidation, and liquidity
  symptoms to `protocols/lending/musdc` and the mUSDC lending skill. Do not use
  classic MUSD debt or redemption rules for that market.
- Route USDC Lending Vault share, adapter allocation, withdrawal-liquidity, and
  gauge-integration symptoms to `protocols/vaults/usdc-lending` and the USDC
  Lending Vault skill. Borrower debt remains owned by the underlying market.
- Create or amend a troubleshooting issue only after the canonical owner and a
  reproducible symptom establish a reusable diagnosis; routing alone does not
  promote a proposed protocol module or create issue support.

## Procedure

1. Match the exact symptom and scope; do not generalize by keyword.
2. Check the issue review date and reverify volatile provider/deployment state.
3. Run the minimal read-only diagnostic and its negative/control case twice, or
   use the cited deterministic source/tests when stronger than live writes.
4. Preserve expected, observed, provider/network/version, block, and evidence
   provenance.
5. Apply only the bounded safe mitigation. Never hide an unknown result,
   disable validation, or blindly retry a write.
6. If evidence disproves maintained knowledge, correct the canonical owner
   first and update the troubleshooting projection.
7. Reject application-only, stale, speculative, and unverified findings.

## Verification

Run:

```sh
node scripts/validate-troubleshooting-knowledge.ts
```

Then run the validator for every linked canonical domain. Live checks are
read-only unless a separately approved operational plan authorizes a write.

## Stop conditions

Stop when evidence conflicts, the active deployment/source cannot be resolved,
the mitigation would weaken safety, reproduction requires an unauthorized
value-bearing action, or a security-sensitive finding lacks its required
handling path.

## Common failure modes

- Calling a provider omission a chain failure.
- Treating docs or canonical narrative as evidence over deployed state.
- Copying addresses, parameters, or formulas into a troubleshooting guide.
- Promoting product indexer labels as protocol lifecycle states.
- Recommending refinance, replacement, or bridge replay as a harmless retry.
