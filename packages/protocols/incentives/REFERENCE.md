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

## Voting and reset

`createVotingReader({networkId, domain, registry, transport}): VotingReader`
uses `VotingReaderConfig`; `domain` is Contracts' `VotingDomain`: `pools`,
`boost`, or `validator`. Pools and validators use veBTC; boost uses veMEZO.
`read({account, tokenId, targets, blockNumber?}): Promise<VotingSnapshot>` reads
one NFT, up to 32 requested targets, and every existing allocation (up to 32).
Their union is bounded at 64. A pool target is a pool address; the other domains
use gauge addresses. No list is inferred from RPC reverts or partial weight sums.

`VotingSnapshot` contains `domain`, `contract`, `escrow: LockSnapshot`, `tokenId`,
`forwarder`, `totalWeight`, `usedWeight`, `lastVoted`, `maxVotingNum`,
`whitelisted`, `deactivated`, `voterAuthorized`, `previousTargets`, and `targets`.
Each `VotingTarget` has `target`, `gauge`, `registered`, `alive`, `weight`, `vote`,
and `rewards`. Each `VotingRewardState` has `role`, `address`, `balance`,
`totalSupply`, checkpoint counts (`numCheckpoints`, `supplyNumCheckpoints`), and
nullable latest timestamps (`checkpointTimestamp`, `supplyCheckpointTimestamp`).
The reader verifies deployed voters, escrow authority, compiler-derived storage,
reward factory children including all immutables, and accounting at one block.

`forecastVoting({snapshot, action, atTimestamp?}): VotingForecast` handles
`VotingAction`: `{kind: "reset"}` or `{kind: "vote", targets, relativeWeights}`.
It returns ordered `targets`, `allocations`, `usedWeight`, `votingPower`, and
`lastVoted`. Quantities are bigint base units; relative weights need no fixed sum.
Every floored allocation must be positive. The explicit snapshot timestamp keeps
its observed ownership suppression; later timestamps produce lock-based estimates.
Both operations require a new epoch strictly after its opening window. Voting
also checks the closing window (except whitelisted NFTs), governed target limit,
and live gauges. Reset can remove killed targets after the closing window and
preserves `lastVoted`. Empty votes are excluded: use the distinct reset action.

`createVotingWriter({reader, execution, transport}): VotingWriter` supports
ordinary self-owned NFTs. It excludes grants, managed custody and delegation;
independent votes in other voter domains are preserved. Its methods are:

| Method      | Input → result                                                                     |
| ----------- | ---------------------------------------------------------------------------------- |
| `prepare`   | `{operationId, account, tokenId, action, bounds: VotingBounds}` → `PreparedVoting` |
| `simulate`  | Owned preparation → Core `SimulatedTransaction`                                    |
| `submit`    | Preparation and its simulation → Core `SubmissionRecord`                           |
| `reconcile` | Preparation and persisted record → `ReconciledVoting`                              |

`VotingBounds` requires `minAllocations` in action target order (empty for reset)
and `maxBlockAge`. `PreparedVoting` contains `snapshot`, `action`, `bounds`,
`forecast`, and exact `transaction`. All exact simulations re-read the matching
coordinate; submission rechecks identity, ownership, power, liveness and the
preparation's epoch. Voter operations need no token approval or target resolver.

`ReconciledVoting` contains `state`, `record`, `receipt`, and `VotingOutcome`:
receipt-block `snapshot`, recalculated `forecast`, `gasFee`, `boundsSatisfied`.
It matches every Abstained/Voted and reward Withdraw/Deposit event, target/global
weight changes, overwritten/appended reward checkpoints and escrow voter flags.
Reconciliation retains old targets after reset and checks gas balances.

```ts
import { createVotingReader, createVotingWriter } from "@mezo-dev-kit/incentives";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
declare const transport: RpcTransport;
declare const execution: ExecutionClient;
declare const account: `0x${string}`;
declare const pool: `0x${string}`;
const reader = createVotingReader({
  networkId: "mezo-mainnet",
  domain: "pools",
  registry: createContractRegistry(),
  transport,
});
const writer = createVotingWriter({ reader, execution, transport });
const prepared = await writer.prepare({
  operationId: "unique-pool-vote",
  account,
  tokenId: 1n,
  action: { kind: "vote", targets: [pool], relativeWeights: [1n] },
  bounds: { minAllocations: [1n], maxBlockAge: 2n },
});
const record = await writer.submit(prepared, await writer.simulate(prepared));
// Observe confirmation using Core before reconciling.
console.log(record);
```

## Voting fees and bribes

`createVotingRewardReader({voting: VotingReader, transport, maxEpochs}): VotingRewardReader`
reads one verified reward child per request. `maxEpochs` is an explicit integer
budget from 1 to 52. `VotingRewardReadInput` requires `account`, `tokenId`,
`target`, `role` (`fees` or `bribe`), 1–8 distinct registered `tokens`, and optional
`blockNumber`. Fees are available in the pools domain. A killed gauge does not
itself prevent claiming its existing reward entitlement.

The reader bounds checkpoint counts at 4096 and history before calling `earned`.
It reproduces past-epoch checkpoint allocation and compares the result to the
contract. It never treats current-epoch funding or an unavailable history as
claimable zero. A history over budget throws `LimitExceeded`.

`VotingRewardSnapshot` contains `voting: VotingSnapshot`, `target`, `reward`,
and `tokens: VotingRewardToken[]`. Token fields are `token`, `decimals`,
`walletBalance`, `custody`, `lastEarn`, `firstClaimEpoch`, `epochs`, and `earned`.
Amounts and timestamps are bigint; token amounts retain their own decimals.

`createVotingRewardWriter({reader, execution, transport}): VotingRewardWriter`
prepares the voter's `claimFees`/`claimBribes` for one verified child and its token
list. It requires the ordinary NFT owner as direct caller and pays that owner.
Managed/granted/delegated claims, donations, rebases and arbitrary reward calls
are outside this writer. No token approval is required for claiming.

`prepare` accepts the read fields except `blockNumber`, plus `operationId` and
`bounds: VotingRewardBounds` (`minAmounts` in token order, `maxBlockAge`). It
returns `PreparedVotingReward` (`snapshot`, `bounds`, `transaction`).
`simulate` and `submit` preserve the same ownership/epoch/freshness and exact-call
contract as the voting writer. `reconcile` returns `ReconciledVotingReward`
(`state`, `record`, `receipt`, `outcome: VotingRewardOutcome`). The outcome holds
receipt-block `snapshot`, ordered `paid`, `gasFee`, and `boundsSatisfied`.
Settlement matches owner claim events even for zero payout, exact positive token
transfers, custody/wallet deltas, `lastEarn`, and unchanged vote accounting.

```ts
import { createVotingRewardReader, createVotingRewardWriter } from "@mezo-dev-kit/incentives";
import type { VotingReader } from "@mezo-dev-kit/incentives";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
declare const voting: VotingReader;
declare const transport: RpcTransport;
declare const execution: ExecutionClient;
declare const account: `0x${string}`;
declare const target: `0x${string}`;
declare const rewardToken: `0x${string}`;
const reader = createVotingRewardReader({ voting, transport, maxEpochs: 26 });
const writer = createVotingRewardWriter({ reader, execution, transport });
const prepared = await writer.prepare({
  operationId: "unique-bribe-claim",
  account,
  tokenId: 1n,
  target,
  role: "bribe",
  tokens: [rewardToken],
  bounds: { minAmounts: [0n], maxBlockAge: 2n },
});
console.log(prepared.snapshot.tokens, prepared.transaction);
```

Voting allocations and claim minimums are client policy: the contracts have no
on-chain minimum arguments. A mined transaction may exceed policy despite a
successful preflight; inspect `boundsSatisfied`. Adjacent-block settlement is
conservative: unrelated changes to touched state, an NFT transfer, or a claim
crossing an epoch can prevent reconciliation. Core confirmation alone does not
prove this protocol outcome. Fee-on-transfer and rebasing token effects are not
silently accepted as ordinary ERC-20 payouts.

The opt-in `locks-fork.ts` command above accepts a final `voting` argument to run
the three voter domains and fee/bribe claims instead of the full lock expiry
sequence. It uses native ERC-20 ledger fixtures and zero gas; fee funding invokes
real notification from a locally impersonated gauge. It restores the snapshot.
These checks do not qualify the Mezo native engine or release support.

## veMEZO rebases

`createRebaseReader({networkId: "mezo-mainnet", registry, transport}): RebaseReader`
reads `account`, `tokenId` and optional `blockNumber`. It verifies the registered
distributor/minter runtimes, escrow graph and reverse mappings at one anchored
block. `RebaseSnapshot` contains `contract`, `minter`, `escrow: LockSnapshot`,
`tokenId`, `activePeriod`, `tokenLastBalance`, `userPointEpoch`, distributor
`custody: TokenSnapshot`, `periods` and recomputed `claim`. Its `RebaseCursorInput`
fields are `startTime`, `lastTokenTime`, `timeCursor` and `firstUserTimestamp`
(null when no user point exists).

`calculateRebaseClaim(cursor & {periods: RebasePeriod[]}): RebaseClaim` is pure.
Each period supplies `week`, `votingPower`, `totalVotingPower` and `allocated`.
It requires all contiguous weeks in the contract's bounded window, computes
each integer product/division with Solidity uint256 bounds and floors, and
uses denominator one for zero total power. The result has `amount`, `epochStart`
(the pre-clamp event start), `nextCursor`, `periods` (count) and `hasMore`.
Amounts, timestamps, cursors and counts are bigint; MEZO amounts use 18 decimals.
Each call processes at most 50 completed weeks. `hasMore` requires another
explicit claim after the first settles; it does not imply full history was
consumed. The reader compares this bounded calculation to on-chain `claimable`.

`forecastRebaseClaim({snapshot, atTimestamp?}): RebaseForecast` adds `disposition`
(`locked`, `liquid`, `none`), resulting `lockedAmount` and `unboostedPower`.
Only ordinary self-owned veMEZO NFTs are admitted: no grants, managed custody
or delegation. Existing votes remain untouched and do not prevent this claim.
The minter's active period must be current; the writer does not run upkeep.
Positive claims deposit into active/permanent locks, or pay liquid MEZO to
the owner at/after timed expiry. Distributor custody, tracked balance and its
escrow allowance must suffice; the owner needs no token approval.

`createRebaseWriter({reader, execution, transport}): RebaseWriter` exposes
`prepare({operationId, account, tokenId, bounds: RebaseBounds})`, `simulate`,
`submit` and `reconcile`. Bounds are `minAmount` and `maxBlockAge`.
`PreparedRebase` holds `snapshot`, `forecast`, frozen `bounds` and `transaction`.
Simulation checks the exact claim's uint256 return; submission rechecks
ownership, cursor, epoch, disposition, age, identity and amount. Only objects
prepared and simulated by that writer may be submitted. `reconcile` accepts a
persisted submission record and returns `ReconciledRebase` (`state`, `record`,
`receipt`, `outcome: RebaseOutcome`). The outcome contains the receipt-block
`snapshot`, actual `forecast`, `gasFee` and `boundsSatisfied`.

Settlement requires exact positive `Claimed` and token transfer events, cursor
progress, distributor balance/accounting, owner wallet or escrow deposit,
checkpoint count, lock/supply changes, and unchanged voter flags. Zero claims
advance the cursor without emitting `Claimed` or transferring MEZO. Native BTC
gas is reconciled separately. Unrelated touched-state changes can prevent the
conservative adjacent-block proof. Minimum amounts and disposition are client
policy, not on-chain claim arguments; inspect `boundsSatisfied` after mining.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRebaseReader, createRebaseWriter } from "@mezo-dev-kit/incentives";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
declare const transport: RpcTransport;
declare const execution: ExecutionClient;
declare const account: `0x${string}`;
const reader = createRebaseReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});
const writer = createRebaseWriter({ reader, execution, transport });
const prepared = await writer.prepare({
  operationId: "unique-rebase-claim",
  account,
  tokenId: 1n,
  bounds: { minAmount: 1n, maxBlockAge: 2n },
});
console.log(prepared.forecast.disposition, prepared.forecast.hasMore);
```

The opt-in `locks-fork.ts` command accepts a final `rebase` argument. It runs
real minter upkeep and permanent/active/expired/zero claims, with explicit
native-token balances, supply, mint dispatch and restored distributor allowance
as local fixtures. All mutations are confined to localhost and snapshot-restored.
This qualifies neither native mint authority nor release support.
