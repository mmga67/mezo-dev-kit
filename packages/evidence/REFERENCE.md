# Evidence API

Import from `@mezo-dev-kit/evidence`. All exports are private candidate APIs with
schema version 1. Package installation follows the [private CLI artifact guide](../../docs/guides/MDK_CLI.md).

## Discover and validate

`evidenceCapabilities()` returns an immutable offline catalog: recipe IDs, supported
network IDs, available and omitted runtime contract IDs, revision, canonical input
fingerprint, and limitations. `incentiveFields` gives field IDs, contract IDs,
classification, units, codec availability and interpretation; `incentiveBaseline`
pins the retained comparison block/hash/time. Discovery does not select an endpoint or prove its health.

`parseEvidenceRequest(unknown)`, `parseEvidenceReport(unknown)` and
`parseEvidenceProgress(unknown)` validate exact versioned shapes and return deeply
frozen values. Unknown versions, extra fields, missing policy, ambiguous numbers,
unsupported capture selections and inconsistent report coordinates fail with
`EvidenceError` (`code: "invalid-input"`). Saved reports keep their original input
digest; reading one does not relabel it as today's evidence.

## Collect

`refreshEvidence(request: EvidenceRequest, ports: EvidencePorts): Promise<EvidenceReport>`
requires explicit `formatVersion: 1`, safe `runId` and `providerId` labels, `networkId`,
`recipe`, `contractIds` and `policy`. Never use credentials as labels. Contract IDs
must be a nonempty supported selection for `runtime.current` or
`incentives.configuration`, and empty for the other recipes.

| Recipe             | Collection and limits                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network.identity` | Chain ID and a current numbered block, rechecked for hash/time/chain consistency.                                                                                                                           |
| `runtime.current`  | Selected registry address code plus registered proxy implementation slot and implementation code; compares SHA-256 against existing Contracts expectations. No admin, source reproduction or history check. |
| `price.skip`       | Mainnet public Skip reader with runtime validation, fixed-block round, explicit freshness and source scale. No confidence; no protocol PriceFeed replacement.                                               |

`policy` requires integer `maxRequests` (1–5000, including retries), `maxAttempts`
(1–3 per RPC call), `maxResponseBytes` (1024–2097152), `timeoutMs` (100–60000),
and decimal-string `maxBlockAgeSeconds` / `maxPriceAgeSeconds`. Concurrency is one.
Retries are bounded and immediate, only for transient transport errors; RPC errors
and malformed data are not retried by the supplied HTTP adapter. No provider fallback.

`ports.request` receives method, params, `signal`, timeout and byte ceiling. It must
honor timeout/cancellation and bound bytes before buffering JSON. `ports.now()`
returns Unix seconds as bigint and must not go backwards. Optional `signal` cancels
future requests and active HTTP work; optional `onProgress` receives immutable
`EvidenceProgress`. Consumer callback errors reject the call. Keep callbacks cheap.

`createEvidenceHttpRequest({ url, fetch })` supplies this port for browsers and Node.
Inject fetch explicitly; the adapter streams under the byte ceiling, rejects redirects,
validates JSON-RPC identity and omits raw provider errors. Browser CORS remains a
provider/application responsibility. Do not put private provider credentials in a
public frontend bundle. The request function and endpoint URL are never serialized.

## Read a report

`EvidenceReport` contains the original request, recipe revision/input digest,
capture start/end (decimal Unix seconds), optional numbered block/hash/timestamp,
request usage, coverage, typed observations, and limitations. Financial and chain
integers are decimal strings; byte digests are SHA-256, not Ethereum Keccak. Price
answer is USD per BTC with explicit `decimals` and null confidence.

Capture `status` is `complete`, `partial`, `failed` or `cancelled`. Completion
means the declared collection finished, even if it found changed bytecode.
Inspect observation `status`, `error`, `freshness`, `blockFreshness` and
`anchorIntegrity` separately. Reorgs invalidate coherence of retained observations;
provider errors retain already collected claims. Stale/future block dates do not
become current simply because capture time is new. A price inconsistent with its
block is unavailable; it is never normalized into a usable price.

`canonicalAcceptance` always remains `unreviewed`; `historicalIntegrity` always
remains `not-assessed`. A runtime match does not renew catalog dates, prove formula
or voting configuration, or establish current deployment source provenance.

Failures have fixed typed codes (`EvidenceFailure`), without URLs, tokens or raw
server messages. Bad application input rejects before RPC; collection failures
are recorded in reports. Persistence failures belong to the caller. The package
does not resume a killed process or schedule retries of whole runs.

## Public types and a minimal adapter

`incentives.configuration` is mainnet-only. Select contract IDs from
`incentiveFields`; every selected root receives a runtime/implementation check
before its exact ABI getters or source-derived storage slots are interpreted.
The initial catalog has 34 fields across five roots, including six unsupported
string getters. Those getters produce `unsupported-codec`, so selecting either
escrow normally produces a partial report even when every supported read succeeds.
Changed code prevents interpreting that root's fields.

`IncentiveEvidenceValue` contains `valueUnit` (`address`, `address-list`, `seconds`,
`count`, `base-units`, or `text`) and `value` (decimal/address text or an address
array). Base units keep their owning escrow's token/power scale; they are not
prices or yields. Observations use `incentive-configuration`, `incentive-state`,
or `incentive-metadata`. Equal values are `match`; changed configuration is
`conflict` with `configuration-changed`; changed ordinary state is `observed`.
A difference does not prove that voting caused it or establish changed formulas.

Recipe revision 2 adds this recipe and observation variants to the private
schema-v1 API. Existing three-recipe requests and saved reports keep their shape
and fingerprints. Consumers compiled against revision 1 must update to understand
the new recipe; never relabel an old report with new expected values. The initial
incentive claim catalog and baseline are immutable for this recipe contract;
future catalog changes require an explicit compatibility decision.

| Export                 | Meaning                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EvidenceCapabilities` | Offline recipe/network/contract scope, omissions, revisions and generated input fingerprints.                                                                 |
| `EvidenceRecipe`       | The four recipe IDs described here; no implicit all-recipes mode.                                                                                             |
| `EvidencePolicy`       | Explicit request, attempt, byte, timeout and datum-age limits.                                                                                                |
| `EvidenceRequest`      | Validated version, run/provider labels, network, recipe, contract selection and policy.                                                                       |
| `EvidenceCoordinate`   | Decimal chain ID, block number and Unix block time, plus the block hash.                                                                                      |
| `RuntimeEvidenceValue` | Address/code SHA-256 and nullable proxy implementation address, code SHA-256 and raw padded slot value.                                                       |
| `PriceEvidenceValue`   | Signed integer answer with decimals, round IDs and Unix publication/start times; confidence is always null. Nonpositive prices are `invalid-price` conflicts. |
| `EvidenceObservation`  | A union distinguished by `unit`: chain identity, runtime identity, USD-per-BTC or incentive-field observation with expected/observed values.                  |
| `EvidenceFreshness`    | `fresh`, `stale`, `future`, `missing` or `not-evaluated`; reports evaluate datum age at capture completion.                                                   |
| `EvidenceFailure`      | Fixed collection failure/conflict codes. Read these alongside per-claim status and run completion.                                                            |
| `EvidenceReport`       | The immutable versioned result, with independent capture, coherence, freshness, coverage and acceptance fields.                                               |
| `EvidenceProgress`     | Version/run ID, monotonic event sequence, phase and collected/planned claim counts.                                                                           |
| `EvidenceRpcRequest`   | Injected read-only RPC function honoring the supplied cancellation, timeout and byte ceiling.                                                                 |
| `EvidencePorts`        | Request function, Unix-second clock, optional signal and progress callback.                                                                                   |

`EvidenceError` is the safe typed boundary error. Its `code` is a collection
failure or `invalid-input`; `retryable` is used only for bounded transport retries.
The HTTP adapter accepts only the six read methods used by these recipes;
transaction submission methods fail before fetch.

```ts
import {
  evidenceCapabilities,
  parseEvidenceRequest,
  refreshEvidence,
} from "@mezo-dev-kit/evidence";
import type { EvidencePorts, EvidenceReport } from "@mezo-dev-kit/evidence";

// Use this catalog for form selectors. It makes no network request.
export const choices = evidenceCapabilities();

// A frontend or server injects its transport, clock and cancel/progress handlers.
// Calling this function captures observations; importing this file does not.
export async function capture(formValue: unknown, ports: EvidencePorts): Promise<EvidenceReport> {
  return refreshEvidence(parseEvidenceRequest(formValue), ports);
}
```
