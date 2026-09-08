---
name: mdk-price-knowledge
description: Verify price-source identity, typed scaling, freshness, confidence and fallback evidence. No public price reader, updater or writer.
---

# MDK price knowledge

## Use when

Use this skill for source-class selection, Skip or Pyth feed identity, raw price
and exponent handling, confidence, explicit max-age evaluation, disagreement,
fallback-result provenance, or maintenance of `knowledge/prices`.

Do not use it to replace a protocol adapter with a direct feed, turn stale data
into a current price, own pool/route math, provide trading advice, invent a
provider fallback order, or enable an updater/writer.

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/prices/README.md` and resolve the module through
   `knowledge/prices/index.json`.
4. Load only the source/feed, datum, freshness/fallback, fixture, evidence, or
   review resources needed.
5. Resolve network/provider capability through Networks and executable
   identity, ABI, implementation range, and source provenance through
   Contracts.
6. Load the consuming protocol skill for protocol-oracle-state, the Pools
   skill for DEX-derived observations, and transaction execution only for a
   separately approved future updater lifecycle.
7. For authored scripts or runtime code, also load
   `agents/skills/mdk-typescript-development/SKILL.md`.

## Procedure

1. Choose exactly one of the six source classes before interpreting a value.
   A source-class change is an explicit selection or derivation event.
2. Resolve a stable source/feed ID and its exact network/deployment or provider
   scope. Identity and bytecode presence do not establish liveness.
3. Retain raw signed integer or exact rational, exponent/decimals,
   publication/block coordinate, observation time, and source-defined
   confidence. Never use an unqualified floating-point number.
4. Validate missing, negative, consumer-prohibited zero, exponent/range, and
   precision before normalization. Use the declared integer rounding rule and
   retain whether division discarded a remainder.
5. Evaluate freshness against the caller's explicit `asOf`, max age, and
   boundary rule. Keep stale, future-dated, and missing-time results distinct.
6. Normalize confidence with its paired price exponent. If unsupported, return
   `null` with the limitation; do not infer zero or a percentage.
7. For fallback, retain every attempt and validation result, the selected
   source if any, and whether its source class changed. Preserve disagreement
   unless a separately named policy resolves it.
8. Never label a direct Skip/Pyth, market, DEX, or analytics fallback as the
   MUSD protocol price when the deployed MUSD adapter is invalid or unavailable.
9. Treat fixed-block observations as evidence, never mutable current-price
   constants. Pyth diagnostic payloads in the bootstrap are stale.
10. On maintenance, update source/evidence digests, canonical records,
    fixtures, generated reference, review files, Contracts/Networks links, and
    the validator together.

## Verification

Run every check declared in `knowledge/prices/index.json`, then Contracts,
Networks, the consuming protocol or Pools module, transactions where relevant,
root structure/catalog, agent-skill, JSON, link, and whitespace checks. Test
scale multiplication/division and rounding, exponent bounds, confidence,
freshness equality, stale/future/missing/negative/zero inputs, disagreement,
explicit source-class fallback, partial reads, and total failure.

## Invariants and common failure modes

- oracle evidence review accepted the module review and Contract roots; feed/current support
  remains proposed pending the scheduled Pyth re-observation.
- Both one-hour Pyth reads were stale at the fixed evidence blocks.
- The Pyth proxy, implementation, ABI, and feeds require re-observation after
  the announced 2026-08-26 16:00 UTC upgrade boundary.
- MUSD owns adapter consumption and normalization; Pools owns pool math;
  Contracts and Networks own executable/network identity.
- No universal max age or fallback order exists.
- Persistence, source order, or successful normalization does not establish
  authority, freshness, or consumer fitness.

## Stop conditions

Stop when source class or identity is ambiguous, Contracts/Networks evidence
is missing or conflicting, the review window expired, freshness/scale/rounding
is unspecified, confidence would be fabricated, a fallback would be mislabeled
as protocol state, stale diagnostics would be treated as current, a provider
credential/dependency or writer is required, or architecture/support scope
would materially change.
