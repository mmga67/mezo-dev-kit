# Incentives SDK reference

Import from `@mezo-dev-kit/incentives`. Read [scope](README.md) and
[Core execution](../../core/REFERENCE.md) before integrating the private writer.

`createGaugeReader({ networkId, role, registry, transport })` returns
`GaugeReader`. `GaugeRole` is `savings-gauge` or `vault-gauge`; mainnet is the
implemented network. Transport is Core's `RpcTransport`. The reader verifies
root and PoolsVoter runtime, discovers the gauge, checks its exact code and
staking-token/voter reverse links, then reads one consistent block.
`reader.read({ account, blockNumber? })` returns `GaugeSnapshot`:

| Fields                                                                      | Meaning                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `coordinate`, `timestamp`                                                   | Network, chain, block number/hash and seconds.                                                                             |
| `role`, `anchorContractId`, `gauge`, `stakingToken`, `rewardToken`, `voter` | Verified graph at that coordinate.                                                                                         |
| `account`, `stake`, `totalStake`, `custody`                                 | User stake, total beneficial stake and actual token custody. Donations are not additional user stake.                      |
| `alive`                                                                     | Current PoolsVoter gauge lifecycle flag.                                                                                   |
| `earned`, `rewardDecimals`, `rewardRate`, `periodFinish`                    | Streamed reward base units, decimal precision, base units per second and Unix seconds. Earnings are not voter fees or APR. |
| `token`                                                                     | Token SDK wallet balance, allowance to the gauge, decimals and coordinate.                                                 |

`createGaugeTargetResolver({ reader, account })` returns Core's
`ExecutionTargetResolver`. Inject it as `resolveTarget` when creating the
execution client. It resolves only the reader's anchor and role at the supplied
coordinate. Applications composing several domains dispatch by anchor/role to
the corresponding resolver; do not return a caller-supplied arbitrary address.

`createGaugeWriter({ reader, execution })` returns `GaugeWriter`:

| Method      | Input → result                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `prepare`   | `{ operationId, account, action, bounds }` → `PreparedGauge`.                                               |
| `simulate`  | Owned preparation → Core `SimulatedTransaction`; an outstanding approval rejects.                           |
| `submit`    | Preparation and its simulation → Core `SubmissionRecord`, after fresh stake/lifecycle/allowance/age checks. |
| `reconcile` | Preparation and durable record → `{ state, record, receipt, outcome: GaugeOutcome }`.                       |

`GaugeAction` is `{ kind: "stake" | "unstake", amount }` (positive staking-token
base units) or `{ kind: "claim-reward" }`. `GaugeBounds` requires positive
bigint `maxBlockAge` and bigint `minReward` in reward-token base units. Stake and
unstake require `minReward: 0n`; neither pays streamed rewards automatically.
The claim can be a successful zero payout if no rewards are earned and the
bound permits it. The gauge has no on-chain minimum reward argument: the bound
is checked before submission and reported against the actual payout afterward.

`PreparedGauge` contains `snapshot`, `action`, `bounds`, `token`, `approval` and
exact `transaction`. Use the [Token SDK](../../tokens/REFERENCE.md) to complete
any separate approval, then prepare again. `GaugeOutcome` contains action
`kind`, principal `amount`, `rewardPaid`, `rewardToken`, `boundsSatisfied` and
receipt-block `snapshot`. Reconciliation checks account/recipient events,
token transfers, beneficial stake and wallet ownership; principal and rewards
are never summed. Other activity in the receipt block can cause a mismatch.

```ts
import {
  createGaugeReader,
  createGaugeTargetResolver,
  createGaugeWriter,
} from "@mezo-dev-kit/incentives";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest, SubmissionStore } from "@mezo-dev-kit/core";
declare const request: RpcRequest; // Application-owned provider/wallet request.
declare const account: `0x${string}`;
declare const store: SubmissionStore; // Durable, atomic reservations in production.
const network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry();
const transport = createRpcTransport({ id: "app", request });
const reader = createGaugeReader({
  networkId: network.id,
  role: "savings-gauge",
  registry,
  transport,
});
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request }),
  store,
  maxBlockAge: 5n,
  confirmations: 2n,
  resolveTarget: createGaugeTargetResolver({ reader, account }),
});
const writer = createGaugeWriter({ reader, execution });
const prepared = await writer.prepare({
  operationId: "app-unique-claim",
  account,
  action: { kind: "claim-reward" },
  bounds: { maxBlockAge: 5n, minReward: 1n },
});
const simulated = await writer.simulate(prepared);
// After the application authorizes this exact intent:
const record = await writer.submit(prepared, simulated);
console.log(await execution.observe(record));
// Persist record; wait for execution.observe(record) to report confirmed.
```

Submission is not completion. Use Core observation/recovery and then
`writer.reconcile(prepared, record)`. Do not blindly repeat a submission when
the wallet response is uncertain. Exact restored preparation and Core records
can be reconciled after restart; new simulations require a new preparation.

`GaugeError` has `code: GaugeErrorCode`: `InvalidInput`, `IdentityMismatch`,
`UnavailableState`, `InsufficientBalance`, `ApprovalRequired`, `StaleState`,
`ReconciliationMismatch`. Required state failures reject; they are not zero
balances. EVM, Contracts and Core failures may propagate. Public types are
`GaugeAction`, `GaugeBounds`, `GaugeErrorCode`, `GaugeOutcome`, `GaugeReader`,
`GaugeRole`, `GaugeSnapshot`, `GaugeWriter`, and `PreparedGauge`.

## Lock, boost and voting inputs

The private escrow API extends the gauge API above under
[ADR-0021](../../../docs/decisions/0021-incentives-locks-and-voting.md). Select
`EscrowRole`: `vebtc-current` or `vemezo-current`. Current mainnet veBTC and
veMEZO generations have different maximum durations. Reads verify the proxy,
implementation, token/voter/booster graph and the deployment's duration storage.
The explorer's partial-verification label remains explicit; accepted evidence
reproduces executable code, with a metadata difference.

| API                                                                                                     | Behavior                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calculateLockEnd({ timestamp, duration, maxLockSeconds })`                                             | Adds duration to the supplied timestamp and floors to a protocol week. Rejects nonfuture or over-maximum rounded ends and uint256 overflow.                                                                                                                                                                                  |
| `calculateLockVotingPower({ amount, boost, end, permanent, maxLockSeconds, timestamp })`                | Returns `LockVotingPower`: `unboosted`, `boosted`, `effectiveBoostedAmount`, `slope`, `boostedSlope`. Floors amount/maximum before multiplying by remaining time; boost zero encodes 1x. Checks nonnegative int128 checkpoint bounds. This is a lock estimate, not a historical checkpoint or transferable DAO vote balance. |
| `calculateBoostFactor({ gaugeWeight, votingVeTotalWeight, boostableVeTotalWeight, boostableVeWeight })` | Preserves each deployed floor and checked multiplication; returns the capped factor at 1e18 precision. These are current BoostVoter inputs, not PoolsVoter weights.                                                                                                                                                          |
| `calculateVotingEpoch(timestamp)`                                                                       | Returns `VotingEpoch` with `start`, `voteStart`, `voteEnd`, `next` in Unix seconds. Eligible voting begins strictly after voteStart; epoch boundaries do not erase allocations.                                                                                                                                              |
| `allocateVotingPower({ votingPower, relativeWeights })`                                                 | One to 64 weights, checked uint256 arithmetic. Returns `VoteAllocation`: per-target `allocations`, `usedWeight`, `unallocatedFloorDust`. Rejects zero total or any zero floor-rounded target. Does not validate targets, ownership, live gauges, epoch eligibility or governed target limits.                                |
| `createLockReader(config)`                                                                              | `LockReaderConfig`: mainnet networkId, explicit role, registry and Core RpcTransport. Returns `LockReader`.                                                                                                                                                                                                                  |
| `reader.read({ account, tokenIds, blockNumber? })`                                                      | At most 32 unique positive IDs; empty IDs reads totals/underlying approval state only. Returns `LockSnapshot`. Missing/burned IDs have zero owner/amount, not an invented beneficial owner.                                                                                                                                  |
| `reader.listOwned({ account, offset, limit, blockNumber? })`                                            | Explicit bigint offset and limit 1–32; validates each returned NFT owner. Returns snapshot, offset, nextOffset/null and total. Pin the same block for subsequent pages; ownership can change at another block.                                                                                                               |
| `createLockTargetResolver({ reader, account })`                                                         | Core resolver for the reader's verified `escrow-token` role. Required for separate underlying approvals through the escrow root. Does not grant an NFT operator approval.                                                                                                                                                    |
| `forecastLock({ snapshot, action, atTimestamp? })`                                                      | Pure `LockForecast` with amount, end, permanent, unboostedPower, deposit and withdraw. Optional later timestamp supports inclusion calculations using predecessor state; it is not a fresh RPC observation.                                                                                                                  |
| `createLockWriter({ reader, execution, transport })`                                                    | Returns a `LockWriter` for the six ordinary self-owned operations below.                                                                                                                                                                                                                                                     |
| `writer.prepare({ operationId, account, action, bounds })`                                              | Captures a fresh snapshot/forecast and separate underlying approval plan in `PreparedLock`. Sends no native value.                                                                                                                                                                                                           |
| `writer.simulate(prepared)`                                                                             | Requires sufficient confirmed approval and a newly prepared object. Exact-call simulation checks current forecast, allowance and the returned mint ID for create. Core retains this verifier for the final simulation.                                                                                                       |
| `writer.submit(prepared, simulated)`                                                                    | Revalidates operation eligibility, allowance, deployment, freshness and bounds before Core invokes the explicitly selected wallet.                                                                                                                                                                                           |
| `writer.reconcile(prepared, record)`                                                                    | Confirms canonical receipt and intent, NFT mint/burn, underlying transfers, lock operation event, lock state, supply/permanent balances, direct custody, wallet balances and native gas. Matching restored intent can be reconciled without re-submitting.                                                                   |

`LockAction` is one of:

| kind               | Additional fields                    | Result                                                                        |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------- |
| `create`           | positive amount, duration in seconds | Creates a timed NFT for the caller.                                           |
| `increase`         | tokenId, positive amount             | Adds underlying to an unexpired timed or permanent lock.                      |
| `extend`           | tokenId, duration in seconds         | Extends to a later rounded end; duration is measured from current time.       |
| `make-permanent`   | tokenId                              | Unexpired timed lock becomes permanent with end zero.                         |
| `unlock-permanent` | tokenId                              | Permanent lock becomes timed at the maximum rounded duration.                 |
| `withdraw`         | tokenId                              | At or after expiry, burns the timed NFT and returns underlying to the caller. |

The initial writer requires a normal, unvoted NFT owned by the caller, with no
grant, managed custody, delegation or associated boost gauge. Readers expose
broader state. Operator callers, grants, managed NFTs, split/merge and voting or
reward mutations are not enabled by this lock writer. A withdrawal also requires
sufficient direct escrow liquidity; global ledger supply and direct token custody
are separate quantities because managed reward flows can hold tokens elsewhere.
The reader does not claim an audit of aggregate backing or attribute a difference
to a specific historical flow.

`LockBounds` contains nonnegative `minLockedAmount`, `minUnboostedPower`,
`maxLockEnd` (absolute Unix seconds) and `maxBlockAge`. These are preflight
conditions. The contract accepts duration rather than an absolute maximum end,
so a week boundary between signing and inclusion can change the end.
`LockOutcome.boundsSatisfied` reports inclusion-state compliance; never retry an
already included operation automatically when it is false.

### Lock state and exported types

`EscrowKind` is `normal`, `locked` or `managed`. `EscrowLock` includes tokenId,
owner/approved/callerApproved, kind, amount/end/permanent/storedBoost,
currentBoost/boostGauge (null for nonboostable veMEZO), voted/voters (maximum 16),
managedTokenId, delegatee, grantManager/vestingEnd, currentVotingPower,
currentUnboostedPower, atTimeVotingPower, ownershipChangeSuppressed and
lockPowerEstimate. Current boosted power can be suppressed in the block of an
ownership change; the at-time value is kept separately. Computed current boost
can differ from the stored checkpoint boost.

`LockSnapshot` records role/contract, coordinate/timestamp/account, underlying,
maxLockSeconds, forwarder/primaryVoter/booster, ownedCount/lastMintedTokenId,
supply/permanentBalance/virtualPermanentBalance, totalVotingPower and
totalUnboostedPower, nativeBalance, Tokens' token snapshot (balance, allowance,
spender and target), escrowTokenBalance, explicitly requested locks and epoch.
Amounts and voting powers use 18-decimal integer base units; times are seconds.
No all-owner inventory or beneficial ownership inference is implied.

`PreparedLock` contains snapshot, action, bounds, forecast, approval and exact
Core transaction. `LockOutcome` contains kind, tokenId, post-state snapshot,
forecast at inclusion, gasFee and boundsSatisfied. `ReconciledLock` contains
state (`reconciled`), record, canonical receipt and outcome. Core's
getReceiptExecutionFee validates the required gas fields. Native BTC's token
balance includes execution gas; MEZO's token balance does not, and its native
wallet balance is checked separately. Ambiguous same-block account/protocol
changes cause reconciliation to reject.

`IncentiveError`/`IncentiveErrorCode` add escrow-specific errors: InvalidInput,
IdentityMismatch, LimitExceeded, UnavailableState, IneligibleOperation,
ApprovalRequired, BoundExceeded, ReconciliationMismatch. Existing GaugeError
behavior is unchanged. EVM/Core/Tokens/provider errors retain their owners.

### Lock examples

```ts
import {
  calculateLockEnd,
  calculateLockVotingPower,
  calculateVotingEpoch,
  allocateVotingPower,
} from "@mezo-dev-kit/incentives";
const timestamp = 1788883200n;
const end = calculateLockEnd({ timestamp, duration: 1209600n, maxLockSeconds: 2419200n });
const power = calculateLockVotingPower({
  amount: 10n ** 18n,
  boost: 0n,
  end,
  permanent: false,
  maxLockSeconds: 2419200n,
  timestamp,
});
const epoch = calculateVotingEpoch(timestamp);
const allocation = allocateVotingPower({ votingPower: power.unboosted, relativeWeights: [1n, 2n] });
console.log(end, power, epoch, allocation);
```

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createLockReader } from "@mezo-dev-kit/incentives";
declare const transport: RpcTransport;
declare const account: `0x${string}`;
const reader = createLockReader({
  networkId: "mezo-mainnet",
  role: "vebtc-current",
  registry: createContractRegistry(),
  transport,
});
const page = await reader.listOwned({ account, offset: 0n, limit: 10 });
console.log(page.snapshot.locks, page.nextOffset, page.snapshot.coordinate);
// Use page.snapshot.coordinate.blockNumber on every subsequent page.
```

```ts
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest, SubmissionStore } from "@mezo-dev-kit/core";
import {
  createLockReader,
  createLockTargetResolver,
  createLockWriter,
} from "@mezo-dev-kit/incentives";
declare const request: RpcRequest; // Application owns endpoint, timeout and wallet consent.
declare const store: SubmissionStore; // Durable atomic reservations across processes.
declare const account: `0x${string}`;
const network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry();
const transport = createRpcTransport({ id: "application-provider", request });
const reader = createLockReader({
  networkId: "mezo-mainnet",
  role: "vebtc-current",
  registry,
  transport,
});
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request }),
  store,
  confirmations: 1n,
  maxBlockAge: 2n,
  resolveTarget: createLockTargetResolver({ reader, account }),
});
const writer = createLockWriter({ reader, execution, transport });
const state = await reader.read({ account, tokenIds: [] });
const prepared = await writer.prepare({
  operationId: "lock-unique-intent",
  account,
  action: { kind: "create", amount: 10n ** 16n, duration: 1209600n },
  bounds: {
    minLockedAmount: 10n ** 16n,
    minUnboostedPower: 1n,
    maxLockEnd: state.timestamp + state.maxLockSeconds,
    maxBlockAge: 2n,
  },
});
if (prepared.approval.kind === "sufficient") {
  const record = await writer.submit(prepared, await writer.simulate(prepared));
  const observation = await execution.observe(record);
  if (observation.state === "confirmed")
    console.log((await writer.reconcile(prepared, observation.record)).outcome);
} else {
  console.log(prepared.approval, prepared.snapshot.token);
  // Complete the explicit Tokens approval flow, then call writer.prepare again.
}
```

The [Tokens reference](../../tokens/REFERENCE.md) shows reset/approve,
confirmation and re-read. Supply `prepared.snapshot.token` as its TokenReadInput;
the spender is the verified escrow and target uses the escrow-token role. A reset
is not the subsequent positive approval. The application presents each requested
approval and retains the user's operation intent across confirmations.

Opt-in commands after a workspace build:

```sh
node packages/protocols/incentives/test/locks-live.ts "$SOURCE_RPC_URL"
node packages/protocols/incentives/test/locks-fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL" /tmp/mdk-native-token-fixture/out/NativeTokenFixture.sol/NativeTokenFixture.json
```

The first is read-only. The second requires a fresh Anvil mainnet fork, restores
its snapshot, and uses explicit native ERC-20 ledger fixtures with zero gas price.
It tests real escrow/voter/library composition, not mezod native engine behavior.
Nonzero gas arithmetic has separate unit coverage; native-engine compatibility
and qualified release review remain separate.
