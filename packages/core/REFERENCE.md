# Core SDK reference

The additive `ExecutionTargetResolver` port supports protocol-discovered
destinations. Set `PreparedTransaction.targetRole` only with an injected
`resolveTarget({ contractId, role, coordinate })` on `ExecutionClientConfig`.
The resolver must derive the address from the registered anchor and verify its
runtime and graph at that block. Core compares it with the exact destination
at simulation and again before submission. The optional role persists in
schema-1 `SubmissionRecord`; old records without a role remain compatible.
Use the owning Lending, Vault or Incentives resolver rather than accepting an
arbitrary address from input.

If a dynamic preparation's anchor block is replaced, observation returns
`reorged` before invoking a resolver against that lost history. Preserve the
record and investigate destination identity before recovery; the SDK does
not silently rewrite its provenance or resubmit the operation.

`verifyContractRuntime({ contract, transport, coordinate }) → Promise<void>`
checks the resolved canonical address, chain and coordinate, full address-code
SHA-256, and the ERC-1967 implementation slot/code where applicable. It uses
Contracts' curated runtime identities; unavailable identities reject. It does
not establish dynamic role topology or support status. Hashing uses Node crypto.

`getReceiptLogs(receipt, address) → readonly ExecutionLog[]` filters one address,
checks transaction/block ownership, rejects removed or duplicate-index logs,
validates topics/data and returns log-index order. `ExecutionLog` contains
`address`, `topics`, `data`, and bigint `logIndex`. Domain writers still own ABI
decoding and outcome checks. This helper does not scan chain history.

Import from `@mezo-dev-kit/core`. The supported client coordinates reads using
public Chains/Contracts and an application-owned transport. See
[setup](../../docs/reference/sdk.md) and [scope](README.md).

## Functions and client methods

The additive execution API is a private implementation pending qualified
release review. The existing read API below remains unchanged.

| API                                       | Contract                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRpcTransport({ id, request })`     | `RpcTransport`: raw coherent reads, timestamps, code/storage, pending nonce, simulation, transaction and receipt ports.                                                            |
| `createRpcSigner({ account, request })`   | `ExecutionSigner` bound to an explicit EOA; verifies wallet account availability.                                                                                                  |
| `createExecutionClient(config)`           | `ExecutionClient`; config requires network, registry, transport, signer, store, bigint `maxBlockAge` and positive bigint `confirmations`.                                          |
| `execution.simulate(prepared)`            | Validates chain/account/EOA code, deployment destination, block/age and nonce; returns frozen `SimulatedTransaction`.                                                              |
| `execution.submit(simulated, revalidate)` | Invokes mandatory domain revalidation, rechecks identity/nonce/age, simulates the exact call at the head, atomically reserves intent, submits once and returns `SubmissionRecord`. |
| `execution.observe(record)`               | Validates a JSON resume record, exact transaction, receipt and canonical block; returns `ExecutionObservation`. It does not poll.                                                  |
| `execution.inspectHash(record, hash)`     | Checks sender/nonce/chain and classifies `same-call`, `replacement` or `cancellation`, returning a record with the candidate hash. Classification alone does not prove settlement. |
| `execution.reconcile(record, verify)`     | Requires confirmation, invokes the domain verifier, rechecks canonicality and returns `{ state: "reconciled", record, receipt, outcome }`.                                         |
| `parseSubmissionRecord(value)`            | Validates version 1, canonical decimal strings, chain, addresses, hashes and data.                                                                                                 |
| `createMemorySubmissionStore()`           | Atomic session/test storage; does not survive restart.                                                                                                                             |

`RpcRequest` accepts `{ method, params }` and resolves the raw JSON-RPC result,
not its envelope; provider errors reject. Applications own URLs, HTTP/wallet
requests, credentials, timeout, cancellation and concurrency. The adapter checks
block hashes before and after number-pinned reads.

`ExactTransaction` contains `chainId`, `from`, `to`, `value`, `data`, `nonce`.
`PreparedTransaction` contains operation/contract identity, `coordinate`,
from/to/value/data. `SimulatedTransaction` holds `prepared` and exact `call`.
Foreign, reused or concurrently submitted simulations cannot reach the wallet
twice. EOAs with delegated code and smart accounts are outside this slice.

`ExecutionSigner` has async `getChainId`, `getAddress`, `sendTransaction`.
`ExecutionTransport` extends `CoreReadTransport` with `getCode`, `simulate`,
`getNonce`, `getTransaction`, `getReceipt`. `RpcTransport` additionally supplies
`getBlockTimestamp` and `getStorage`. `ExecutionClientConfig` owns these ports
and the confirmation/age policy.

`SubmissionStore.reserve(record)` must atomically reserve both operation ID and
chain/sender/nonce across every participating process. Its
`attachHash(operationId, hash)` persists the first hash and rejects conflicting
replacement. Intent is persisted before the wallet call. A failed send or hash
persistence raises `ExecutionError("SubmissionUncertain")` with the reserved
`record`, including a hash when known. Investigate the nonce; do not resubmit.
This conservatively retains wallet-rejected intents too. The application owns
any evidence-based reservation release policy; Core never releases or retries
automatically.

`SubmissionRecord` has `schemaVersion: 1`, `operationId`, `networkId`,
`contractId`, preparation `blockNumber`/`blockHash`, exact `call`, nullable
`hash`, and nullable `inclusion` checkpoint. Bigints use decimal strings;
records contain no keys or signed bytes. Persist the record returned by
observation to recognize disappearing receipts as reorgs after restart.

`ExecutionObservation.state` is `submission-uncertain`, `submitted`,
`included`, `confirmed`, `execution-reverted`, or `reorged`.
`ExecutionReceipt` holds transaction/block identity and raw `logs`. Generic
reconciliation relies on the supplied verifier; borrowing supplies its own
event and post-state checks. A confirmed receipt alone is not protocol success.

`ExecutionError` carries `ExecutionErrorCode`, nullable `record`, and cause.
Codes: `InvalidExecutionInput`, `ChainMismatch`, `AccountMismatch`,
`StaleSimulation`, `SimulationFailed`, `DuplicateSubmission`,
`SubmissionUncertain`, `InvalidTransaction`, `NotConfirmed`, `ReorgDetected`.
Keep private provider details out of logs. See the complete
[borrowing composition example](../protocols/musd-borrowing/REFERENCE.md#example).

| API                             | Input → result                                                 | Behavior                                                                 |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `createCoreReadClient(config)`  | `CoreReadClientConfig → Readonly<CoreReadClient>`              | Validate configuration; network calls happen through client methods.     |
| `client.assertChain()`          | none → promise of `{ expectedChainId, transportChainId }`      | Read and compare exact bigint chain IDs.                                 |
| `client.resolveContract(input)` | `{ contractId, blockNumber? }` → promise of `ResolvedContract` | Assert chain, obtain a block/hash coordinate, and resolve via Contracts. |
| `client.readCoherent(input)`    | `{ calls, blockNumber? }` → promise of `CoherentReadResult`    | Send all calls at one network/block/hash coordinate.                     |
| `serializeCoreReadError(error)` | `CoreReadError → SerializedCoreReadError`                      | Serialize the owned error fields without its raw cause.                  |
| `error.toJSON()`                | none → `SerializedCoreReadError`                               | Same serialization for a `CoreReadError` instance.                       |

`config` requires `network: Network`, `registry: ContractRegistry`, and
`transport: CoreReadTransport`. A `CoreReadCall` contains a unique `id`,
`contractId`, encoded `data`, and optional `required` (default true).
Supply a bigint `blockNumber` to select a block; omission selects the head once
per operation. Separate client method calls do not share a hidden coordinate.

## Implementing the transport

Every method may return synchronously or asynchronously. Untrusted results
remain `unknown` until the owning boundary validates them.

| Port                    | Required behavior                                                   |
| ----------------------- | ------------------------------------------------------------------- |
| `id: string`            | Stable application-controlled diagnostic identity.                  |
| `getChainId()`          | Return a decoded positive bigint chain ID.                          |
| `getBlockNumber()`      | Return a decoded nonnegative bigint head block.                     |
| `getBlock(blockNumber)` | Return `{ number, hash }`, or missing; Core validates number/hash.  |
| `read(request)`         | Execute calldata at the exact supplied coordinate; return raw data. |

`CoreTransportReadRequest` carries `networkId`, `chainId`, `blockNumber`,
`blockHash`, `contractId`, `address`, and `data`. The adapter must honor the
coordinate and never silently fall back to latest. Core does not select RPC
URLs, encode calldata, decode protocol values, poll, retry, or impose I/O
timeouts. Applications own those policies. Core's public read client establishes
the coordinate; protocol readers add staged final coordinate checks.

## Example: use an injected transport and encoded call

```ts
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { CoreReadError, createCoreReadClient, serializeCoreReadError } from "@mezo-dev-kit/core";
import type { CoreReadCall, CoreReadTransport } from "@mezo-dev-kit/core";

export async function readCall(
  transport: CoreReadTransport,
  call: CoreReadCall,
  blockNumber?: bigint,
) {
  const client = createCoreReadClient({
    network: getNetwork("mezo-mainnet"),
    registry: createContractRegistry(),
    transport,
  });

  try {
    const result = await client.readCoherent({
      calls: [call],
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
    const item = result.reads[call.id];
    if (item === undefined) throw new Error("Requested read is missing");
    if (item.status === "unavailable") {
      return { status: "unavailable" as const, error: item.error, coordinate: result.coordinate };
    }
    // Validate/decode item.value using the ABI and the owning domain's units.
    return { status: "available" as const, raw: item.value, coordinate: result.coordinate };
  } catch (error) {
    if (error instanceof CoreReadError) {
      return { status: "failed" as const, error: serializeCoreReadError(error) };
    }
    throw error;
  }
}
```

The caller supplies real encoded calldata in `call.data`. The
[executable foundation example](../../examples/foundational-readonly/README.md)
provides a deterministic fake transport; it is not an RPC adapter.

## Results and errors

`CoherentReadResult` contains `coordinate: ReadCoordinate` and `reads`, a
record keyed by call ID. Each item retains its resolved `contract` and is
either `{ status: "available", value: unknown }` or
`{ status: "unavailable", error: SerializedCoreReadError }`.

A required transport failure throws `PartialReadFailure`; an optional transport
failure returns an unavailable item. Invalid input, chain mismatch, and
deployment resolution failures are not optional zero results.

`CoreReadError(code, message, context, options?)` exposes `code`, `stage`,
`retryable`, `context`, and optional `cause`. Options accept `cause`,
`stage`, and `retryable`. Codes: `InvalidReadInput`, `InvalidTransportResult`,
`ChainMismatch`, `ProviderFailure`, `PartialReadFailure`. Contracts errors
retain their own class. Serialization retains context, so application-created
context must avoid credentials and personal data.

## Public types

Configuration/transport: `CoreReadClientConfig`, `CoreReadClient`,
`CoreReadTransport`, `CoreReadBlock`, `CoreTransportReadRequest`, `CoreReadCall`.
Results: `ReadCoordinate`, `CoherentReadResult`, `CoherentReadItem`,
`AvailableRead`, `UnavailableRead`, `BlockHash`, `HexData`.
Errors: `CoreReadErrorCode`, `CoreReadErrorContext`, `CoreReadErrorOptions`,
`SerializedCoreReadError`.

See the [export list](src/index.ts), [type definitions](src/read-client.ts), and
built declarations (`dist/index.d.ts`). The internal transaction proof is
excluded from the build: `createCoreClient`, signing, simulation, submission,
receipt tracking, and reconciliation are not public imports today.

## Bounded event scanning

`createEventScanner(config: EventScannerConfig): EventScanner` creates a
signer-free scanner. `scan(input: EventScanInput): Promise<EventScanResult>`
reads raw logs for one static registered contract in its currently indexed ABI
generation. Supply `networkId`, `registry`, `request: RpcRequest`, `providerId`,
`capabilityEvidenceId` and an explicit `EventScanPolicy`. The evidence identifier
records your provider capability assessment; the scanner does not certify it.

| Policy field       | Boundary                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `blocksPerPage`    | Integer 1–1,000.                                                                                             |
| `maxPages`         | Integer 1–100; their product is at most 10,000 blocks per invocation.                                        |
| `maxLogsPerPage`   | Integer 1–10,000; product with pages at most 100,000 logs. A response at the limit is potentially truncated. |
| `maxLogDataBytes`  | Integer 1–65,536 per log; aggregate retained data is also bounded to 16 MiB.                                 |
| `overlapBlocks`    | Integer 1–1,000, below the total block budget so resumed work can progress.                                  |
| `confirmations`    | Positive bigint; confirmed head is latest minus confirmations plus one.                                      |
| `requestTimeoutMs` | Integer 1–60,000 for each request. Application cancellation can bound the entire invocation.                 |

`scan` requires `contractId`, inclusive bigint `fromBlock` and `toBlock`,
`topics: EventTopics`, bigint Unix `observedAt` and `maxHeadAgeSeconds`. Optional
`signal: AbortSignal` interrupts waiting and prevents subsequent requests; the
injected provider must implement cancellation to stop its own pending I/O.
`topics` has at most four positions, each a hash, null wildcard or nonempty
OR-list of up to 64 hashes. Empty outer topics means all contract logs. Inputs
are normalized and bounded before RPC; malformed inputs/checkpoints throw.

The scanner checks chain ID, head age, every page's block headers and ancestry,
log address/topic/range/hash/order, duplicate identity and page-end canonicality.
A changed source generation, malformed response, provider failure, timeout,
abort or potential truncation cannot establish complete coverage. An empty
validated page can. No block-generation ABI is guessed and no event is decoded.
Registry identity records catalog provenance; raw log coverage does not certify
historical executable bytes or a provider's honesty/completeness below its cap.
Protocol consumers must verify their required runtime/event/outcome evidence.

`EventScanResult` contains:

- `status`: `complete`, `partial`, `unknown`, or `reorged`; `issue` explains any
  incomplete result with an `EventScanIssue`.
- `queryId`, resolved `source`, `providerId`, `capabilityEvidenceId`, `observedAt`
  and bigint `confirmedHead` (null if unavailable).
- `requested: EventRange`, invocation `covered: EventRange | null`, and `gaps`.
  On resume, `resumedThrough` records the old coverage claimed by the caller;
  only its overlap and the new covered range are verified in this invocation.
- Ordered `events: ScannedEvent[]`: stable source-generation/transaction/log
  `id`, address, block number/hash, transaction hash/index, log index, topics and
  data. Numeric indices and blocks are bigint. Identical duplicates collapse;
  conflicts fail. IDs remain stable across query windows/topic filters.
- `checkpoint: EventCheckpoint | null`, a JSON-safe **candidate**, never a
  committed cursor. It has `schemaVersion: 1`, query ID, decimal-string
  `fromBlock`/`throughBlock` and a contiguous bounded `EventAnchor[]` window.
- `reorg`, when saved anchors changed, with the last matching `rollbackTo` anchor
  or null and bigint `invalidatedFrom`. If the whole window changed, restart
  from the original range start. A reorg during scanning discards that
  invocation's observations/candidate; revalidate the previously committed
  checkpoint before rebuilding projections.

Supply an optional `checkpoint: unknown` read from your store to resume. Keep the
same contract, original `fromBlock`, topics and overlap policy; extend `toBlock`
as needed. The scanner validates the schema/query/window, rechecks every saved
anchor and rereads overlap. It never regresses the old cursor while doing so.
Atomically persist events, coverage and the candidate only after required joins
succeed. On reorg, atomically rewind affected rows and negative evidence before
rescanning. Optional enrichment must not erase valid parent observations.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createEventScanner } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
declare const request: RpcRequest;
declare const fromBlock: bigint, toBlock: bigint, observedAt: bigint;
const scanner = createEventScanner({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  request,
  providerId: "application-rpc",
  capabilityEvidenceId: "application-log-probe",
  policy: {
    blocksPerPage: 100,
    maxPages: 2,
    maxLogsPerPage: 1000,
    maxLogDataBytes: 4096,
    overlapBlocks: 12,
    confirmations: 12n,
    requestTimeoutMs: 5000,
  },
});
const result = await scanner.scan({
  contractId: "musd.token",
  topics: [],
  fromBlock,
  toBlock,
  observedAt,
  maxHeadAgeSeconds: 60n,
});
console.log(result.status, result.covered, result.gaps);
if (result.checkpoint) console.log(JSON.stringify(result.checkpoint));
// Application transaction: upsert events + coverage + checkpoint together.
// Inspect partial/unknown/reorged results before making absence claims.
```

`EventScanError` carries `code` (`invalid-input` or an `EventScanIssue`) and a
bounded message. Invalid call inputs throw; request-time failures are returned
as coverage issues, preserving previously verified pages where possible. There
is no automatic retry, provider failover, decoding, database, scheduler, account
transaction inventory, or destination-delivery inference. See the
[indexing guide](../../docs/guides/INDEXING_RECONCILIATION.md) for application
commit and protocol reconciliation responsibilities.

Additional exported types: `EventTopics`, `EventScanPolicy`,
`EventScannerConfig`, `EventAnchor`, `EventCheckpoint`, `EventScanInput`,
`ScannedEvent`, `EventRange`, `EventScanIssue`, `EventScanResult`, `EventScanner`.

`ExecutionClient.simulate(prepared, verify?)` also returns exact RPC `returnData`
on `SimulatedTransaction`. Optional `SimulationVerifier(returnData, coordinate, call)`
can decode and reject protocol outputs. Core retains that verifier with the
owned simulation and runs it again on the final exact simulation before wallet
submission. A thrown/rejected verifier becomes `SimulationFailed` and prevents
submission. This allows swap/liquidity consumers to validate decoded outputs at
both coordinates. Older custom ExecutionClient test adapters must include
`returnData` and honor the optional verifier when implementing this interface.

The verifier also receives the immutable exact `call: ExactTransaction` as its
third argument, including sender, target, value, calldata and reserved nonce.
This permits explicit output-aware simulation adapters for void-returning calls.
Core rechecks signer, preparation freshness, nonce and simulation block after an
asynchronous verifier finishes and before it asks the wallet to submit.

`RpcTransport.getBalance(address, coordinate)` returns native base units using
`eth_getBalance` at the exact block, with block-hash checks before and after.
Custom `RpcTransport` implementations must provide this method. Domain receipt
reconciliation owns gas-fee correction when comparing wallet balances.

`getReceiptExecutionFee({ receipt, raw, from, to })` validates the raw receipt's
transaction, block, caller, target and successful status against the already
verified execution receipt, then returns checked `gasUsed * effectiveGasPrice`.
Both quantity fields are required; an explicit zero effective price is allowed.
It covers EVM execution gas, excluding additional chain-specific L1/blob fees.
It validates matching provider evidence, not the provider's truthfulness. Protocols
own native wallet accounting and any additional fee model.
