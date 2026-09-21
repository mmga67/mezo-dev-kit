# Retrieve contributor context locally

Use `pnpm context` from the MDK repository root to find and inspect canonical
knowledge and relevant provider-neutral memory. The command reads the current
checkout, including uncommitted inputs. It makes no network requests, writes no
cache and requires no external memory account. Search indexing happens within
the process; a later invocation reads changed files again.

Install the root-pinned dependencies first. Most commands need only Node and
the checkout. `abi` additionally needs the existing EVM public build:

```sh
pnpm --filter @mezo-dev-kit/evm build
pnpm context --help
pnpm context catalog
```

The EVM package is loaded through its declared public ESM export, rather
than a guessed build path or a transitive dependency path. It supplies representation
validation and Keccak hashing; the tool does not invent another ABI authority.

## Find, select, verify

```sh
pnpm context find --query 'permanent' --module protocols/incentives --limit 3
pnpm context read --module protocols/incentives --resource incentives-operations \
  --record return-permanent-lock-to-timed --pointer /preconditions
pnpm context links --module contracts --resource contract-abis --record incentives.ve-btc
```

Copy module/resource/record IDs from results. The existing indexed
`recordCollectionPointer` selects collections; callers do not need to guess
whether an input uses `records`, `operations`, `items` or another field.
Use a pointer only after seeing that record's shape. Empty arrays and `null`
remain data; an unknown record or missing pointer is an error.

`find` matches every whitespace-separated query term, case-insensitively,
against identifiers/path and content. Identifier matches rank ahead of body
matches; equal scores sort by stable ID. Ranking is relevance, never authority.
It returns matching records with short excerpts, source hashes, scope and
lifecycle fields. Read the selected record and follow the applicable evidence
before relying on a claim. Hashes identify local bytes, not source provenance,
deployment identity, freshness, or qualified acceptance.

| Corpus                                                            | Search behavior                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Indexed canonical records and source catalogs                     | Record content and identifiers; envelopes are also searchable               |
| Other indexed knowledge, including ABI/source artifacts           | Metadata only; select explicitly with `read`, `source`, or `abi`            |
| Shared memory                                                     | Index metadata selects candidates; selected summaries are searched          |
| Local memory                                                      | Same selection, only with `--local-memory`                                  |
| Deprecated memory                                                 | Omitted unless `--include-deprecated` is supplied                           |
| Package docs, manuals and source code                             | Discover with file listing/scoped `rg`; use `read-file` for bounded reading |
| Ignored tasks, diagnostics, provider state and raw online sources | Outside automatic search                                                    |

An empty result means no match in the reported search coverage. It does not
prove a fact, ABI method, source file or memory absent from every store. A
missing indexed file or invalid index is an error, not an empty result.

To find package APIs or documentation, first list the relevant directory:

```sh
rg --files packages/evm scripts/agents docs/guides
pnpm context read-file --path packages/evm/REFERENCE.md --start 1 --lines 60
```

For installed consumer applications, use their `mdk docs search/show/fetch`
commands and declared corpus. This contributor tool does not expand consumer
distribution to include private records or retained raw evidence.

## Inspect exact interfaces and retained source

```sh
pnpm context abi --module contracts --resource abi.incentives.ve-btc --name votedVoters
pnpm context abi --module contracts --resource abi.incentives.ve-btc --selector 0x7c9a1cf9
pnpm context source --module contracts --resource voting-validator-source
pnpm context source --module contracts --resource voting-validator-source \
  --file contracts/NonStakingVoter.sol --start 1 --lines 60
```

`abi` returns all matching overloads, exact entries, canonical signatures and
selectors/event topics. Selectors can collide. Resolve deployment/implementation
validity at the requested network and coordinate before applying an ABI;
availability alone does not prove authorization or writer support. This is
interface inspection, not transaction preparation or an automatic decoder.

`source` first lists exact embedded source paths. `--file` selects an entry
inside that bundle, never an arbitrary filesystem path. Both retained explorer
responses and the normalized pool source format are understood. It identifies
raw artifact bytes and reports that evidence verification was not performed.
Follow the owner for digest/build validation: for example, the existing
`read-pool-contract-source.ts` checks the accepted pool source digest. A raw
response hash and the canonical source-content digest are different.

## Retrieve memory when it can shorten the investigation

```sh
pnpm context find --query 'price' --module prices --memory-domain prices
pnpm context memory-read --scope shared --id price-selection-evidence-routing
pnpm context find --query 'price' --module prices --memory-domain prices --local-memory
pnpm context memory-check
pnpm context memory-check --local-memory
```

Without `--memory-domain`, at least one query term must match an entry's
ID/domain/title before its summary is read. Supplying a domain selects that
domain and its `/` children for summary search. The response reports the number
of indexed and searched entries, plus absent or unsearched stores. Separate
shared/local IDs prevent an identically named local note from silently
overriding reviewed shared context. Local discoveries remain explicitly
supporting context.

Memory checks validate against the owning JSON Schemas, index/entry agreement,
stable filenames, lifecycle restrictions and orphan JSON entries. Unknown
schema keywords fail instead of being silently ignored. Checks do not verify
source truth, privacy, source links or review acceptance. Source verification
and export review remain human/agent responsibilities.

Use the [memory management guide](../../docs/guides/MEMORY_MANAGEMENT.md) for
capture, searchable writing, verification, promotion and retirement. A missing
local store is normal. Provider indexes, credentials and synchronization state
are never traversed by this tool.

## Bounds, errors and continuation

- `catalog` lists modules first; `--module` lists resource metadata. It defaults
  to 20 entries. `find` defaults to eight. Both accept `--limit 1..30` and
  `--offset`; follow `nextOffset` until the relevant coverage is sufficient.
- Reads default to 80 lines and 8,000 characters, with `--start`, `--lines`
  (up to 300) and `--max-chars` (up to 30,000). Follow `nextStart`. Lines refer
  to the selected value/source, not necessarily the containing JSON file.
- An oversized single line is not silently cut. Select a field or source file
  instead. Search excerpts are deliberately partial and never full evidence.
- The final JSON response defaults to 24,000 characters. `OutputTooLarge`
  reports its size and how to narrow it; no broken partial JSON is emitted.
  `--max-output-chars` allows 2,000..60,000 when more context is necessary.
- Files above 32 MiB, traversal, symlinks, unsupported arguments and malformed
  inputs fail. Use the owning evidence reader for larger artifacts.
- Success exits 0 with `{ "ok": true, "data": ... }`. Errors exit 1 with
  structured error text. No failure triggers a network fallback.

`complete` describes the returned selection; search coverage separately states
what was searched. `reviewAfter` and verification dates are returned as recorded
and are never renewed by reading. The [knowledge standard](../../docs/standards/knowledge-management.md#read-or-use-knowledge)
owns when an online observation is required.
