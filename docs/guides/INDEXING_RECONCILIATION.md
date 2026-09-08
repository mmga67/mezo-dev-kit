# Provider-neutral indexing and reconciliation

## Status and purpose

This guide defines MDK's reusable requirements for bounded event scans,
backfills, checkpoints, reorg handling, negative evidence, and protocol
reconciliation. It received qualified Level 3 acceptance under indexing reconciliation review on
2026-08-26.

The guide describes observable behavior, not a hosted architecture or public
runtime API. An application may implement these requirements with an in-memory
process, files, its own database, a hosted indexer, or another replaceable
adapter. Materialized rows remain projections of canonical chain and protocol
evidence.

## Authority and ownership

Indexing answers which evidence was inspected and retained. It does not decide
what a protocol event means.

- Networks owns chain identity and provider capability evidence.
- Contracts owns deployment generations, validity, ABIs, and event sources.
- Each protocol/workflow owner defines canonical events, post-state, joins,
  partial outcomes, and terminal success.
- Transactions owns generic submitted/included/confirmed/reorged/reconciled
  distinctions.
- Troubleshooting owns only reproduced failures and bounded mitigations.
- An application/indexer owns cursors, storage layout, scheduling, and
  materialized projections.

Resolve those owners through stable knowledge references. Do not copy
addresses, ABIs, deployment ranges, event meaning, or protocol completion
rules into an indexing schema.

## Scan contract

Every bounded scan request records:

- network ID and provider/transport identity;
- source kind and stable deployment/ABI generation IDs;
- inclusive requested block range and confirmation/finality boundary;
- starting checkpoint, including block number and block hash;
- overlap/reorg lookback policy;
- required and optional reads/metadata;
- freshness policy and observation time;
- completeness criteria; and
- bounded page size, concurrency, retry, cancellation, and timeout policy.

Provider capabilities are explicit. A successful latest-state call does not
prove archive range, log-window, batch, or trace support. When a required
capability is absent, reduce the range or select another independently checked
provider while preserving the same chain and block coordinates. If no eligible
provider remains, return typed partial/unknown coverage rather than fabricated
absence.

### Event identity and idempotency

An event observation uses a source-aware identity containing at least:

```text
network ID
deployment generation ID
transaction hash
log index
block number + block hash observation
```

The first four fields identify an event within one canonical history. The block
hash detects history replacement. Repeating an overlapping scan must converge
to the same canonical projection without duplicate side effects.

Ordering for deterministic projections is block number, transaction index,
then log index. A storage engine may use different physical keys only if it
preserves equivalent identity and ordering semantics.

## Checkpoints and one-pass operation

A checkpoint means the complete requested range through that block was
committed under the recorded block hash. Do not advance it merely because one
page, parent row, or optional metadata fetch succeeded.

For each pass:

1. Assert chain/provider identity and select a confirmed scan head.
2. Re-read the prior checkpoint hash and the configured overlap range.
3. Scan inclusive bounded ranges in ascending order.
4. Validate, normalize, and deduplicate source-aware observations.
5. Fetch required and optional child/post-state data with distinct failure
   handling.
6. Commit canonical rows, coverage, negative evidence, and the new checkpoint
   atomically from the application's perspective.
7. Emit structured diagnostics without secrets or unbounded raw logs.

One-pass runtime means one bounded invocation can make useful progress and
return its next checkpoint. It does not require a daemon, hosted scheduler, or
database.

## Coverage and completeness

Coverage is a first-class result, not inferred from the number of rows:

| State      | Meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `complete` | Every block in the requested confirmed range was inspected and all required data succeeded. |
| `partial`  | Some confirmed subranges or required child data are known, but a gap remains.               |
| `unknown`  | The provider/source could not establish whether matching evidence exists.                   |
| `stale`    | The observation was complete for its coordinate but exceeded the caller's freshness policy. |

Return requested and covered ranges, gaps, source IDs, block/hash coordinates,
freshness, required failures, optional failures, and retry classification.

Parent and child completeness remain separate. A valid canonical parent event
survives optional token metadata, label, analytics, or enrichment failure. Mark
the enrichment partial/unknown and retain its error. A required protocol join
or post-state failure may prevent completion, but it must not erase the parent
observation.

Empty results are meaningful only when coverage is complete for the exact
source/range/query and the applicable finality rule. Otherwise the result is
unknown or partial, not an authoritative absence.

## Reorg and overlap policy

Each pass rechecks the checkpoint anchor and a bounded overlap. If a stored
block hash differs from the canonical provider result:

- find the earliest mismatching block within the checked window;
- invalidate observations and negative evidence at or after that block;
- retain the invalidated provenance for diagnostics instead of rewriting
  history invisibly;
- restore the last matching checkpoint; and
- rescan forward idempotently.

A reorg is the only ordinary reason that previously proven completion may be
invalidated. A later failed or missing candidate on the same canonical history
must not demote an already proven completion.

The overlap depth is explicit caller/application policy informed by the chain
confirmation policy. This guide does not define a universal block count.

## Negative evidence and retry

Negative evidence records what was not found, not what does not exist. It
includes source/provider, query, inclusive range, confirmation boundary,
attempt count, observation time, coverage state, failure class, and next retry
eligibility.

Distinguish:

- `absent` — a complete authoritative scan at the required finality found no
  match;
- `unknown` — capability, transport, archive, decoding, or required-data
  failure prevented a conclusion;
- `delayed` — valid progress exists but terminal evidence is not yet expected
  or observed;
- `failed` — canonical protocol evidence proves failure; and
- `completed` — canonical event and required post-state rules prove success.

Unknown, partial, and delayed outcomes are retryable under an explicit bounded
attempt/cooldown policy. Absence may be terminal only when the owning protocol
defines authoritative finality and the exact scan is complete. Retrying a read
never authorizes retrying, replacing, or replaying a value-bearing operation.

## Destination candidates and reconciliation

Preserve every destination-evidence candidate with its own provenance. Do not
overwrite a transfer/action record with the last candidate inspected.

Candidate evaluation order is:

1. exclude candidates invalidated by a confirmed reorg;
2. validate canonical event identity and protocol-specific join keys;
3. validate required post-state/delivery evidence;
4. retain progress, failure, and ambiguity independently; and
5. select `completed` if any canonical candidate proves all completion rules.

A later failed candidate cannot overwrite proven completion. A progress event
cannot outrank a canonical completion event. Receipt or materialized-row status
cannot substitute for the owning workflow's post-state requirements.

Examples of distinct protocol joins:

- MUSD NTT uses the same NTT digest across source and destination.
- Native Bridge uses its direction-specific sequence and full tuple, plus
  recipient delivery/post-state where required.
- A normal EVM action uses the tracked transaction/replacement identity,
  configured confirmation, canonical events, and domain post-state.

Do not normalize these into a generic transaction-hash join.

## Failure and retry safety

- Retry idempotent bounded reads only for classified transient failures.
- Preserve cancellation, timeout, provider, archive, decode, range, and
  protocol-reconciliation errors as distinct diagnostics.
- Bound requests, concurrency, attempts, and retained debug evidence.
- On provider failover, reassert chain identity and preserve the requested
  block/range coordinates.
- Never rebuild, resubmit, bridge again, or replay value because indexed
  destination evidence is missing.

## Hosted-indexer and application-schema exclusion record

indexing reconciliation review deliberately does not select or define:

- a hosted database or indexing vendor;
- table, column, cache-key, queue, or application API schemas;
- a daemon, scheduler, polling interval, operational block cap, or deployment
  topology;
- route-health, SLA, analytics, dashboard, or alert policy; or
- an automated transaction replay/recovery service.

These remain application/operations decisions behind replaceable adapters.
The MDK repository and its knowledge, skills, evals, and deterministic checks
must remain usable without a database, hosted indexer, credentials, or remote
service.

## Canonical references

- `workflows/transactions:transaction-state-machine`
- `workflows/transactions:transaction-client-requirements`
- `workflows/bridges:bridge-ntt-lifecycle`
- `workflows/bridges:bridge-native-lifecycle`
- `troubleshooting:issue-testnet-rpc-historical-data-gap`
- `networks:rpc-endpoints`
- `contracts:contract-deployments`

Use the module indexes to resolve physical paths. The references above remain
the owners of protocol/network/deployment facts; this guide owns only the
provider-neutral indexing procedure.

## Private SDK implementation

Core's [event scanner reference](../../packages/core/REFERENCE.md#bounded-event-scanning)
describes `createEventScanner`, explicit provider/query limits, raw event
identity, complete/partial/unknown coverage, JSON-safe checkpoint candidates and
changed-anchor rewind. The implementation covers one currently registered ABI
generation and does not decode events or prove historical executable bytes.
Applications commit observations, required joins, coverage and candidates
atomically under the rules in this guide. A source log query does not establish
account-wide history or bridge delivery.
