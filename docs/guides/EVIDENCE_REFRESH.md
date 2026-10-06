# Refresh evidence with the CLI or a frontend

An evidence refresh asks a selected RPC provider for current observations and
saves what it found. It can reveal changed bytecode, a stale block or price, or a
provider failure. It does **not** accept those observations into MDK's canonical
knowledge. A successful refresh cannot establish that formulas or voting rules
are unchanged.

This is a private candidate workflow. Use Node 24+ and the matching private
artifact kit from the [CLI installation guide](MDK_CLI.md). No wallet, agent
setup, MDK source checkout or application initialization is required to capture.
Public registry publication and qualified release are still pending.

## First capture

In a directory of your choice, use the installed CLI:

```sh
pnpm exec mdk evidence capabilities --offline --json
```

This lists recipe IDs, networks, contract IDs that have runtime expectations,
known omissions, and the input snapshot digest. It does not contact a provider.
Choose your provider explicitly; no default endpoint is silently selected.
Set its URL in an environment variable named `MEZO_RPC_URL` using your shell or
secret manager. The CLI reads that variable and keeps the URL out of its report.
Use a provider label such as `my-provider`, without credentials.

```sh
pnpm exec mdk evidence refresh \
  --network mezo-mainnet --recipe network.identity \
  --provider my-provider --rpc-env MEZO_RPC_URL \
  --policy current-v1 --output ./evidence --json
```

For a contributor using this repository, build first with `pnpm build`; the same
`pnpm exec mdk` commands then work from the root; use `--output local/evidence`
to keep contributor captures in the ignored local records area. The private portable kit also
supports `node console/bin.js evidence ...` without installing a global command.

`current-v1` uses one concurrent request, at most 1000 requests including retries,
two attempts per call, 15 seconds per request, and 256 KiB per response. It considers
blocks older than 120 seconds and Skip publications older than 60 seconds stale.
These are explicit collection policy choices, not protocol parameters. Override
`--max-requests`, `--max-block-age`, or `--max-price-age` for your application.

Each run creates `evidence/<run-id>/run.json`, `report.json` and `completed.json`.
The completion record contains the report digest. Existing runs are never overwritten.
JSON stdout uses the normal CLI `{ ok, data }` envelope; `data` is exactly the
versioned `EvidenceReport` returned by the SDK. `ok` reflects the exit code, so a
useful partial report can have `ok: false`.

## Choose a recipe

| Recipe             | What it answers                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `network.identity` | Does this endpoint report the selected chain? Can it return and recheck a current numbered block?      |
| `runtime.current`  | Do explicitly selected contract/proxy runtime identities match the packaged registry expectations?     |
| `price.skip`       | What does the mainnet Skip BTC/USD source report at the pinned block, and is it fresh under my policy? |

For runtime checks, add `--contracts` with comma-separated IDs from the capability
catalog. For example, select `oracle.skip-btc-usd` on mainnet. Registrations without
public runtime expectations remain listed as omissions; they are not silently
included. Runtime matches cover code and registered implementation slots/code.
They do not verify proxy admins, governed parameters, upgrade history or source builds.

For Skip, use `--recipe price.skip` and omit `--contracts`. This reader supports
mainnet only. Its report is a direct source observation with explicit decimals
and no confidence value. It is not a borrowing protocol oracle, Pyth observation,
or trading quote. Prices and RPC quantities remain integer strings, never floats.

## Understand the result

Inspect all of these fields:

- `status`: whether collection completed, was partial, failed, or was cancelled.
- `observations`: each claim's result, expected/observed values and typed failure.
- `coordinate` and `anchorIntegrity`: block/hash/time and whether repeated reads stayed consistent.
- `blockFreshness` and observation `freshness`: age relative to capture completion and your policy.
- `coverage` and `limitations`: exactly what was collected and what remains outside scope.

A `complete` run may contain a `conflict`, such as changed runtime bytes. A stale
price is retained as stale. If a block changed during collection, prior observations
remain inspectable but are not a coherent snapshot. `startedAt`/`completedAt` are
capture times; `blockTimestamp` and price `publishedAt` describe the observed data.
All timestamps are decimal Unix seconds. Canonical acceptance stays `unreviewed`
and historical integrity stays `not-assessed` regardless of capture success.

Refresh exit codes: **0** complete without findings; **3** partial, conflicting or stale;
**1** failed capture; **2** invalid input; **130** cancelled. Check `data` even when
exit status is nonzero. A filesystem failure instead produces a CLI error.

## Cancel, inspect and recover

Press Ctrl-C once to cancel an active refresh. The CLI aborts active HTTP requests,
stops scheduling new requests, and saves completed claims in a cancelled report.

```sh
pnpm exec mdk evidence inspect ./evidence/<run-id> --offline --json
pnpm exec mdk evidence recover ./evidence/<run-id> --offline --json
```

Replace `<run-id>` with the directory name. Inspection validates the local report
and completion digest. Recovery can publish a fully written pending report or
restore its missing completion record. A killed process with no complete report
remains interrupted. No recovery command contacts RPC or repeats the run. Retain
that directory and start a fresh capture after resolving the cause.

Transient transport failures retry only within the stated limits. For stale data,
check the provider and policy; for changed bytecode, review the deployment before
using it. Do not increase age limits merely to make a report look successful.

## Use the same service from a frontend

The [typed cookbook recipe](../../examples/evidence/refresh.ts) injects fetch,
clock, cancellation and progress, then returns the report and exportable JSON.
It performs no DOM or filesystem work and requires no shell command. Bind the
catalog to network/recipe/contract selectors, display progress and per-claim
results, and let the user download the JSON. Your application owns UI and storage.
Provider CORS policy still applies; keep private RPC credentials on your backend.

The [Evidence API reference](../../packages/evidence/REFERENCE.md) owns exact
schemas and limits. Browser qualification remains a required gate for release;
Node tests alone do not establish browser compatibility.

## What maintainers do after capture

Capture does not renew `verifiedAt` or `reviewAfter`. Compare a report against its
canonical owners, investigate conflicts using pinned source and governed state,
and perform the domain's evidence review before updating knowledge. The bounded
mainnet oracle workflow now supports offline proposal, reviewed application and
recovery. It consumes the full source/history oracle capture, not the public
current-state report. Use the
[oracle maintenance workflow](oracle-evidence-refresh.md) and
[evidence script inventory](../../scripts/evidence/README.md)
for specialized capture/import commands. Those scripts have different scopes;
there is no command that safely renews every module by changing its date.

## Compare incentive configuration

Discover `incentiveFields` and `incentiveBaseline` in capabilities, then select
the roots you need. For example:

```sh
pnpm exec mdk evidence refresh \
  --network mezo-mainnet --recipe incentives.configuration \
  --contracts incentives.boost-voter --provider my-mainnet-provider \
  --rpc-env MEZO_RPC_URL --policy current-v1 --output ./evidence --json
```

The same request works with `captureEvidence` in the frontend cookbook. Display
configuration conflicts separately from ordinary state movement; include
unsupported and failed fields rather than presenting partial data as complete.
The recipe checks code first and compares values with the pinned baseline.
It does not establish the cause or authorization of a configuration change.
The [field catalog](../../knowledge/protocols/incentives/records/configuration-observations.json)
owns classification and interpretation; the [API reference](../../packages/evidence/REFERENCE.md)
owns report behavior and compatibility.
