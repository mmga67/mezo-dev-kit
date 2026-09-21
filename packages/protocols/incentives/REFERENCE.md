# Incentives SDK reference

Use `@mezo-dev-kit/incentives` to inspect gauge stakes and rewards, manage ordinary vote-escrow
locks, prepare votes, and claim supported rewards. Each operation uses the reader and writer for its
own domain.

A **gauge** holds a stake and accounts for streamed rewards. A **vote-escrow lock** is an NFT
representing locked tokens and voting power. An **epoch** is the protocol’s voting or reward period.
Voting fees, bribes, lock rebases and gauge rewards have separate accounting; a reward in one system
is not automatically claimable through another.

| Task                                            | Start with                                             |
| ----------------------------------------------- | ------------------------------------------------------ |
| Stake Savings or vault receipts                 | `createGaugeReader`, `createGaugeWriter`               |
| Inspect or change an ordinary veBTC/veMEZO lock | `createLockReader`, `createLockWriter`                 |
| Vote or reset supported allocations             | `createVotingReader`, `createVotingWriter`             |
| Claim voting fees or bribes                     | `createVotingRewardReader`, `createVotingRewardWriter` |
| Inspect or claim a veMEZO rebase                | `createRebaseReader`, `createRebaseWriter`             |
| Stake a CL NFT or claim its gauge rewards       | `createCLGaugeReader`, `createCLGaugeWriter`           |

Readers use explicit accounts and bounded token/target lists. Writers prepare, simulate, submit and
reconcile a specific operation; required approvals are separate steps. Amounts are bigint base units
of the named token, and times are Unix seconds.

See [package scope](README.md), the
[lock and vote walkthrough](../../../examples/lock-and-vote/README.md), and
[Core execution](../../core/REFERENCE.md#transaction-execution). The private writer families retain
their qualified-review requirements.

On this page:

- [Savings and vault gauges](#savings-and-vault-gauges)
- [Lock, boost and voting inputs](#lock-boost-and-voting-inputs)
- [Voting and reset](#voting-and-reset)
- [Voting fees and bribes](#voting-fees-and-bribes)
- [veMEZO rebases](#vemezo-rebases)
- [CL gauge positions and rewards](#cl-gauge-positions-and-rewards)

## Savings and vault gauges

### `createGaugeReader` — inspect receipt staking

Choose the Savings or vault gauge role explicitly.

`createGaugeReader({ networkId, role, registry, transport })` returns `GaugeReader`. `GaugeRole` is
`savings-gauge` or `vault-gauge`; mainnet is the implemented network. Transport is Core's
`RpcTransport`. The reader verifies root and PoolsVoter runtime, discovers the gauge, checks its
exact code and staking-token/voter reverse links, then reads one consistent block.
`reader.read({ account, blockNumber? })` returns `GaugeSnapshot`:

| Fields                                                                      | Meaning                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `coordinate`, `timestamp`                                                   | Network, chain, block number/hash and seconds.                                                                             |
| `role`, `anchorContractId`, `gauge`, `stakingToken`, `rewardToken`, `voter` | Verified graph at that coordinate.                                                                                         |
| `account`, `stake`, `totalStake`, `custody`                                 | User stake, total beneficial stake and actual token custody. Donations are not additional user stake.                      |
| `alive`                                                                     | Current PoolsVoter gauge lifecycle flag.                                                                                   |
| `earned`, `rewardDecimals`, `rewardRate`, `periodFinish`                    | Streamed reward base units, decimal precision, base units per second and Unix seconds. Earnings are not voter fees or APR. |
| `token`                                                                     | Token SDK wallet balance, allowance to the gauge, decimals and coordinate.                                                 |

### `createGaugeTargetResolver` — bind stake approvals

Use the verified gauge as the approval spender.

`createGaugeTargetResolver({ reader, account })` returns Core's `ExecutionTargetResolver`. Inject it
as `resolveTarget` when creating the execution client. It resolves only the reader's anchor and role
at the supplied coordinate. Applications composing several domains dispatch by anchor/role to the
corresponding resolver; do not return a caller-supplied arbitrary address.

### `createGaugeWriter` — stake, unstake or claim

Select one action and retain principal and reward amounts separately.

`createGaugeWriter({ reader, execution })` returns `GaugeWriter`:

### `prepare`

Read current state and build the exact transaction intent, including the action’s checks and bounds.

**Input → result:** `{ operationId, account, action, bounds }` → `PreparedGauge`.

### `simulate`

Simulate the prepared transaction before requesting submission. Use the preparation created by this
writer.

**Input → result:** Owned preparation → Core `SimulatedTransaction`; an outstanding approval
rejects.

### `submit`

Submit the matching prepared and simulated operation. Retain the returned record for confirmation
and recovery.

**Input → result:** Preparation and its simulation → Core `SubmissionRecord`, after fresh
stake/lifecycle/allowance/age checks.

### `reconcile`

Verify the confirmed transaction against the saved intent and protocol outcome.

**Input → result:** Preparation and durable record →
`{ state, record, receipt, outcome: GaugeOutcome }`.

### Gauge actions and bounds

Staking and unstaking do not automatically claim streamed rewards in this gauge family.

`GaugeAction` is `{ kind: "stake" | "unstake", amount }` (positive staking-token base units) or
`{ kind: "claim-reward" }`. `GaugeBounds` requires positive bigint `maxBlockAge` and bigint
`minReward` in reward-token base units. Stake and unstake require `minReward: 0n`; neither pays
streamed rewards automatically. The claim can be a successful zero payout if no rewards are earned
and the bound permits it. The gauge has no on-chain minimum reward argument: the bound is checked
before submission and reported against the actual payout afterward.

### Prepared state and actual rewards

Any required token approval precedes a fresh preparation.

`PreparedGauge` contains `snapshot`, `action`, `bounds`, `token`, `approval` and exact
`transaction`. Use the [Token SDK](../../tokens/REFERENCE.md) to complete any separate approval,
then prepare again. `GaugeOutcome` contains action `kind`, principal `amount`, `rewardPaid`,
`rewardToken`, `boundsSatisfied` and receipt-block `snapshot`. Reconciliation checks
account/recipient events, token transfers, beneficial stake and wallet ownership; principal and
rewards are never summed. Other activity in the receipt block can cause a mismatch.

Prepare and submit a Savings gauge reward claim using an application-selected provider/wallet
request and durable store. Obtain consent for the exact intent before submitting:

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

const network = getNetwork("mezo-mainnet");

const registry = createContractRegistry();

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

The observation is a tracking result, not yet the reconciled reward. Continue to confirmation and
reconcile before reporting the actual reward amount.

Submission is not completion. Use Core observation/recovery and then
`writer.reconcile(prepared, record)`. Do not blindly repeat a submission when the wallet response is
uncertain. Exact restored preparation and Core records can be reconciled after restart; new
simulations require a new preparation.

### Gauge failures and types

A failed required read does not represent an empty stake or zero earned reward.

`GaugeError` has `code: GaugeErrorCode`: `InvalidInput`, `IdentityMismatch`, `UnavailableState`,
`InsufficientBalance`, `ApprovalRequired`, `StaleState`, `ReconciliationMismatch`. Required state
failures reject; they are not zero balances. EVM, Contracts and Core failures may propagate. Public
types are `GaugeAction`, `GaugeBounds`, `GaugeErrorCode`, `GaugeOutcome`, `GaugeReader`,
`GaugeRole`, `GaugeSnapshot`, `GaugeWriter`, and `PreparedGauge`.

## Lock, boost and voting inputs

The private escrow API extends the gauge API above under
[Protocol execution boundaries](../../../docs/manifest#protocol-execution-boundaries). Select
`EscrowRole`: `vebtc-current` or `vemezo-current`. Current mainnet veBTC and veMEZO generations have
different maximum durations. Reads verify the proxy, implementation, token/voter/booster graph and
the deployment's duration storage. The explorer's partial-verification label remains explicit;
accepted evidence reproduces executable code, with a metadata difference.

### Calculate lock and voting inputs

#### `calculateLockEnd`

Adds duration to the supplied timestamp and floors to a protocol week. Rejects nonfuture or
over-maximum rounded ends and uint256 overflow.

**Call:** `calculateLockEnd({ timestamp, duration, maxLockSeconds })`

#### `calculateLockVotingPower`

Returns `LockVotingPower`: `unboosted`, `boosted`, `effectiveBoostedAmount`, `slope`,
`boostedSlope`. Floors amount/maximum before multiplying by remaining time; boost zero encodes 1x.
Checks nonnegative int128 checkpoint bounds. This is a lock estimate, not a historical checkpoint or
transferable DAO vote balance.

**Call:** `calculateLockVotingPower({ amount, boost, end, permanent, maxLockSeconds, timestamp })`

#### `calculateBoostFactor`

Preserves each deployed floor and checked multiplication; returns the capped factor at 1e18
precision. These are current BoostVoter inputs, not PoolsVoter weights.

**Call:**
`calculateBoostFactor({ gaugeWeight, votingVeTotalWeight, boostableVeTotalWeight, boostableVeWeight })`

#### `calculateVotingEpoch`

Returns `VotingEpoch` with `start`, `voteStart`, `voteEnd`, `next` in Unix seconds. Eligible voting
begins strictly after voteStart; epoch boundaries do not erase allocations.

**Call:** `calculateVotingEpoch(timestamp)`

#### `allocateVotingPower`

One to 64 weights, checked uint256 arithmetic. Returns `VoteAllocation`: per-target `allocations`,
`usedWeight`, `unallocatedFloorDust`. Rejects zero total or any zero floor-rounded target. Does not
validate targets, ownership, live gauges, epoch eligibility or governed target limits.

**Call:** `allocateVotingPower({ votingPower, relativeWeights })`

### Read locks and owner pages

#### `createLockReader`

`LockReaderConfig`: mainnet networkId, explicit role, registry and Core RpcTransport. Returns
`LockReader`.

**Call:** `createLockReader(config)`

#### `reader.read`

At most 32 unique positive IDs; empty IDs reads totals/underlying approval state only. Returns
`LockSnapshot`. Missing/burned IDs have zero owner/amount, not an invented beneficial owner.

**Call:** `reader.read({ account, tokenIds, blockNumber? })`

#### `reader.listOwned`

Explicit bigint offset and limit 1–32; validates each returned NFT owner. Returns snapshot, offset,
nextOffset/null and total. Pin the same block for subsequent pages; ownership can change at another
block.

**Call:** `reader.listOwned({ account, offset, limit, blockNumber? })`

### Configure lock execution

#### `createLockTargetResolver`

Core resolver for the reader's verified `escrow-token` role. Required for separate underlying
approvals through the escrow root. Does not grant an NFT operator approval.

**Call:** `createLockTargetResolver({ reader, account })`

#### `forecastLock`

Pure `LockForecast` with amount, end, permanent, unboostedPower, deposit and withdraw. Optional
later timestamp supports inclusion calculations using predecessor state; it is not a fresh RPC
observation.

**Call:** `forecastLock({ snapshot, action, atTimestamp? })`

#### `createLockWriter`

Returns a `LockWriter` for the six ordinary self-owned operations below.

**Call:** `createLockWriter({ reader, execution, transport })`

### Lock writer methods

#### `writer.prepare`

Captures a fresh snapshot/forecast and separate underlying approval plan in `PreparedLock`. Sends no
native value.

**Call:** `writer.prepare({ operationId, account, action, bounds })`

#### `writer.simulate`

Requires sufficient confirmed approval and a newly prepared object. Exact-call simulation checks
current forecast, allowance and the returned mint ID for create. Core retains this verifier for the
final simulation.

**Call:** `writer.simulate(prepared)`

#### `writer.submit`

Revalidates operation eligibility, allowance, deployment, freshness and bounds before Core invokes
the explicitly selected wallet.

**Call:** `writer.submit(prepared, simulated)`

#### `writer.reconcile`

Confirms canonical receipt and intent, NFT mint/burn, underlying transfers, lock operation event,
lock state, supply/permanent balances, direct custody, wallet balances and native gas. Matching
restored intent can be reconciled without re-submitting.

**Call:** `writer.reconcile(prepared, record)`

### Choose a lock operation

Each action applies to the ordinary self-owned lock profile described below.

`LockAction` is one of:

| kind               | Additional fields                    | Result                                                                        |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------- |
| `create`           | positive amount, duration in seconds | Creates a timed NFT for the caller.                                           |
| `increase`         | tokenId, positive amount             | Adds underlying to an unexpired timed or permanent lock.                      |
| `extend`           | tokenId, duration in seconds         | Extends to a later rounded end; duration is measured from current time.       |
| `make-permanent`   | tokenId                              | Unexpired timed lock becomes permanent with end zero.                         |
| `unlock-permanent` | tokenId                              | Permanent lock becomes timed at the maximum rounded duration.                 |
| `withdraw`         | tokenId                              | At or after expiry, burns the timed NFT and returns underlying to the caller. |

The initial writer requires a normal, unvoted NFT owned by the caller, with no grant, managed
custody, delegation or associated boost gauge. Readers expose broader state. Operator callers,
grants, managed NFTs, split/merge and voting or reward mutations are not enabled by this lock
writer. A withdrawal also requires sufficient direct escrow liquidity; global ledger supply and
direct token custody are separate quantities because managed reward flows can hold tokens elsewhere.
The reader does not claim an audit of aggregate backing or attribute a difference to a specific
historical flow.

### Lock bounds and inclusion time

The contract takes a duration, so a later inclusion time can change the rounded end.

`LockBounds` contains nonnegative `minLockedAmount`, `minUnboostedPower`, `maxLockEnd` (absolute
Unix seconds) and `maxBlockAge`. These are preflight conditions. The contract accepts duration
rather than an absolute maximum end, so a week boundary between signing and inclusion can change the
end. `LockOutcome.boundsSatisfied` reports inclusion-state compliance; never retry an already
included operation automatically when it is false.

### Lock state and exported types

`EscrowKind` is `normal`, `locked` or `managed`. Each `EscrowLock` retains:

| Fields                                                             | Meaning                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `tokenId`, `owner`, `approved`, `callerApproved`, `kind`           | NFT identity, custody, permissions and escrow kind.                                       |
| `amount`, `end`, `permanent`, `storedBoost`                        | Stored lock amount, Unix end time, permanent flag and checkpoint boost.                   |
| `currentBoost`, `boostGauge`                                       | Current boost state; both values are null for nonboostable veMEZO.                        |
| `voted`, `voters`                                                  | Voting flag and up to 16 voter associations.                                              |
| `managedTokenId`, `delegatee`, `grantManager`, `vestingEnd`        | Managed custody, delegation and grant state.                                              |
| `currentVotingPower`, `currentUnboostedPower`, `atTimeVotingPower` | Current and explicit-time power observations.                                             |
| `ownershipChangeSuppressed`, `lockPowerEstimate`                   | Whether same-block ownership suppresses current power, and the independent lock estimate. |

Current boosted power can be suppressed in the block of an ownership change. The at-time value
remains separate, and current boost can differ from stored checkpoint boost.

`LockSnapshot` records:

| Fields                                                                 | Meaning                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `role`, `contract`, `coordinate`, `timestamp`, `account`               | Selected escrow, block/time and account.                                                           |
| `underlying`, `maxLockSeconds`, `forwarder`, `primaryVoter`, `booster` | Token, duration and verified dependency graph.                                                     |
| `ownedCount`, `lastMintedTokenId`, `locks`                             | NFT counters and the explicitly requested positions.                                               |
| `supply`, `permanentBalance`, `virtualPermanentBalance`                | Escrow ledger quantities, distinct from direct token custody.                                      |
| `totalVotingPower`, `totalUnboostedPower`, `epoch`                     | Aggregate power and voting-period inputs.                                                          |
| `nativeBalance`, `token`, `escrowTokenBalance`                         | Wallet native balance, Tokens balance/allowance/spender/target snapshot and direct escrow custody. |

Amounts and voting power use 18-decimal integers; times use seconds. Explicit position reads do not
enumerate all owners or infer beneficial ownership.

`PreparedLock` contains snapshot, action, bounds, forecast, approval and exact Core transaction.
`LockOutcome` contains kind, tokenId, post-state snapshot, forecast at inclusion, gasFee and
boundsSatisfied. `ReconciledLock` contains state (`reconciled`), record, canonical receipt and
outcome. Core's getReceiptExecutionFee validates the required gas fields. Native BTC's token balance
includes execution gas; MEZO's token balance does not, and its native wallet balance is checked
separately. Ambiguous same-block account/protocol changes cause reconciliation to reject.

`IncentiveError`/`IncentiveErrorCode` add escrow-specific errors: InvalidInput, IdentityMismatch,
LimitExceeded, UnavailableState, IneligibleOperation, ApprovalRequired, BoundExceeded,
ReconciliationMismatch. Existing GaugeError behavior is unchanged. EVM/Core/Tokens/provider errors
retain their owners.

### Lock examples

Calculate a rounded lock end, voting power, epoch and relative allocation from synthetic values
without RPC:

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

The returned allocation uses integer floors, so inspect `unallocatedFloorDust` along with each
target’s allocation. These chosen durations illustrate the calculation; real limits come from the
selected escrow generation.

Read the first page of an account’s veBTC NFTs with an application-supplied transport:

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

Use `nextOffset` for the next page and retain `page.snapshot.coordinate.blockNumber` across the
entire traversal. A new block may contain different ownership.

Prepare an ordinary veBTC lock with a configured wallet request and atomic store. Preserve
application consent before executing any approval or lock transaction:

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

const network = getNetwork("mezo-mainnet");

const registry = createContractRegistry();

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
  const simulated = await writer.simulate(prepared);

  const record = await writer.submit(prepared, simulated);

  const observation = await execution.observe(record);

  if (observation.state === "confirmed")
    console.log((await writer.reconcile(prepared, observation.record)).outcome);
} else {
  console.log(prepared.approval, prepared.snapshot.token);
  // Complete the explicit Tokens approval flow, then call writer.prepare again.
}
```

If allowance is insufficient, the example exposes the approval plan rather than sending the lock.
After approval confirmation, prepare again. A submitted record still needs observation and
reconciliation.

The [Tokens reference](../../tokens/REFERENCE.md) shows reset/approve, confirmation and re-read.
Supply `prepared.snapshot.token` as its TokenReadInput; the spender is the verified escrow and
target uses the escrow-token role. A reset is not the subsequent positive approval. The application
presents each requested approval and retains the user's operation intent across confirmations.

Opt-in commands after a workspace build:

```sh
node packages/protocols/incentives/test/locks-live.ts "$SOURCE_RPC_URL"
node packages/protocols/incentives/test/locks-fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL" /tmp/mdk-native-token-fixture/out/NativeTokenFixture.sol/NativeTokenFixture.json
```

The first is read-only. The second requires a fresh Anvil mainnet fork, restores its snapshot, and
uses explicit native ERC-20 ledger fixtures with zero gas price. It tests real escrow/voter/library
composition, not mezod native engine behavior. Nonzero gas arithmetic has separate unit coverage;
native-engine compatibility and qualified release review remain separate.

## Voting and reset

### `createVotingReader` — select a voting domain

Pools, boost and validator voting use distinct domains and escrow inputs.

`createVotingReader({networkId, domain, registry, transport}): VotingReader` uses
`VotingReaderConfig`; `domain` is Contracts' `VotingDomain`: `pools`, `boost`, or `validator`. Pools
and validators use veBTC; boost uses veMEZO. ThirdPartyVoter MEZO Gauges have a separate
[knowledge model](../../../knowledge/protocols/incentives/generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives).
They are outside this reader/writer's domain set; a boost-domain call does not represent a MEZO
Gauge vote. `read({account, tokenId, targets, blockNumber?}): Promise<VotingSnapshot>` reads one
NFT, up to 32 requested targets, and every existing allocation (up to 32). Their union is bounded
at 64. A pool target is a pool address; the other domains use gauge addresses. No list is inferred
from RPC reverts or partial weight sums.

### Voting snapshot and target records

Requested targets and existing allocations are both retained for the selected NFT.

`VotingSnapshot` contains `domain`, `contract`, `escrow: LockSnapshot`, `tokenId`, `forwarder`,
`totalWeight`, `usedWeight`, `lastVoted`, `maxVotingNum`, `whitelisted`, `deactivated`,
`voterAuthorized`, `previousTargets`, and `targets`. Each `VotingTarget` has `target`, `gauge`,
`registered`, `alive`, `weight`, `vote`, and `rewards`. Each `VotingRewardState` has `role`,
`address`, `balance`, `totalSupply`, checkpoint counts (`numCheckpoints`, `supplyNumCheckpoints`),
and nullable latest timestamps (`checkpointTimestamp`, `supplyCheckpointTimestamp`). The reader
verifies deployed voters, escrow authority, compiler-derived storage, reward factory children
including all immutables, and accounting at one block.

### `forecastVoting` — calculate vote or reset

Relative weights describe a split; the calculation reports the resulting integer allocations.

`forecastVoting({snapshot, action, atTimestamp?}): VotingForecast` handles `VotingAction`:
`{kind: "reset"}` or `{kind: "vote", targets, relativeWeights}`. It returns ordered `targets`,
`allocations`, `usedWeight`, `votingPower`, and `lastVoted`. Quantities are bigint base units;
relative weights need no fixed sum. Every floored allocation must be positive. The explicit snapshot
timestamp keeps its observed ownership suppression; later timestamps produce lock-based estimates.
Both operations require a new epoch strictly after its opening window. Voting also checks the
closing window (except whitelisted NFTs), governed target limit, and live gauges. Reset can remove
killed targets after the closing window and preserves `lastVoted`. Empty votes are excluded: use the
distinct reset action.

### `createVotingWriter` — prepare a vote or reset

The caller must own an eligible ordinary NFT.

`createVotingWriter({reader, execution, transport}): VotingWriter` supports ordinary self-owned
NFTs. It excludes grants, managed custody and delegation; independent votes in other voter domains
are preserved. Its methods are:

### `prepare`

Read current state and build the exact transaction intent, including the action’s checks and bounds.

**Input → result:** `{operationId, account, tokenId, action, bounds: VotingBounds}` →
`PreparedVoting`

### `simulate`

Simulate the prepared transaction before requesting submission. Use the preparation created by this
writer.

**Input → result:** Owned preparation → Core `SimulatedTransaction`

### `submit`

Submit the matching prepared and simulated operation. Retain the returned record for confirmation
and recovery.

**Input → result:** Preparation and its simulation → Core `SubmissionRecord`

### `reconcile`

Verify the confirmed transaction against the saved intent and protocol outcome.

**Input → result:** Preparation and persisted record → `ReconciledVoting`

### Voting bounds and simulation

Keep minimum allocations in the same order as the requested targets.

`VotingBounds` requires `minAllocations` in action target order (empty for reset) and `maxBlockAge`.
`PreparedVoting` contains `snapshot`, `action`, `bounds`, `forecast`, and exact `transaction`. All
exact simulations re-read the matching coordinate; submission rechecks identity, ownership, power,
liveness and the preparation's epoch. Voter operations need no token approval or target resolver.

### Reconciled vote outcome

Reconciliation checks allocation changes and reward accounting together.

`ReconciledVoting` contains `state`, `record`, `receipt`, and `VotingOutcome`: receipt-block
`snapshot`, recalculated `forecast`, `gasFee`, `boundsSatisfied`. It matches every Abstained/Voted
and reward Withdraw/Deposit event, target/global weight changes, overwritten/appended reward
checkpoints and escrow voter flags. Reconciliation retains old targets after reset and checks gas
balances.

Prepare a vote for one supplied pool with an existing execution client and account. The NFT ID and
minimum allocation are illustrative; obtain consent before submission:

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

const simulated = await writer.simulate(prepared);

const record = await writer.submit(prepared, simulated);

// Observe confirmation using Core before reconciling.
console.log(record);
```

The returned record identifies the submitted vote. Confirm and reconcile it to verify the actual
allocation and `boundsSatisfied`.

## Voting fees and bribes

### `createVotingRewardReader` — inspect fees or bribes

Select one verified reward contract and explicitly bound how many epochs may be examined.

`createVotingRewardReader({voting: VotingReader, transport, maxEpochs}): VotingRewardReader` reads
one verified reward child per request. `maxEpochs` is an explicit integer budget from 1 to 52.
`VotingRewardReadInput` requires `account`, `tokenId`, `target`, `role` (`fees` or `bribe`), 1–8
distinct registered `tokens`, and optional `blockNumber`. Fees are available in the pools domain. A
killed gauge does not itself prevent claiming its existing reward entitlement.

The reader bounds checkpoint counts at 4096 and history before calling `earned`. It reproduces
past-epoch checkpoint allocation and compares the result to the contract. It never treats
current-epoch funding or an unavailable history as claimable zero. A history over budget throws
`LimitExceeded`.

### Reward-token results

Each token keeps its own precision, wallet balance, custody and earned amount.

`VotingRewardSnapshot` contains `voting: VotingSnapshot`, `target`, `reward`, and
`tokens: VotingRewardToken[]`. Token fields are `token`, `decimals`, `walletBalance`, `custody`,
`lastEarn`, `firstClaimEpoch`, `epochs`, and `earned`. Amounts and timestamps are bigint; token
amounts retain their own decimals.

### `createVotingRewardWriter` — prepare a reward claim

A claim pays the ordinary NFT owner and requires no token approval.

`createVotingRewardWriter({reader, execution, transport}): VotingRewardWriter` prepares the voter's
`claimFees`/`claimBribes` for one verified child and its token list. It requires the ordinary NFT
owner as direct caller and pays that owner. Managed/granted/delegated claims, donations, rebases and
arbitrary reward calls are outside this writer. No token approval is required for claiming.

### Reward preparation and outcome

Choose one minimum per reward token and inspect actual ordered payouts after reconciliation.

`prepare` accepts the read fields except `blockNumber`, plus `operationId` and
`bounds: VotingRewardBounds` (`minAmounts` in token order, `maxBlockAge`). It returns
`PreparedVotingReward` (`snapshot`, `bounds`, `transaction`). `simulate` and `submit` preserve the
same ownership/epoch/freshness and exact-call contract as the voting writer. `reconcile` returns
`ReconciledVotingReward` (`state`, `record`, `receipt`, `outcome: VotingRewardOutcome`). The outcome
holds receipt-block `snapshot`, ordered `paid`, `gasFee`, and `boundsSatisfied`. Settlement matches
owner claim events even for zero payout, exact positive token transfers, custody/wallet deltas,
`lastEarn`, and unchanged vote accounting.

Prepare a claim for one explicitly selected bribe token. Supply the voting reader, transport,
execution client and verified target:

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

The preparation exposes per-token earned amounts and the exact transaction. The zero minimum permits
a zero payout; choose the actual user policy before execution.

Voting allocations and claim minimums are client policy: the contracts have no on-chain minimum
arguments. A mined transaction may exceed policy despite a successful preflight; inspect
`boundsSatisfied`. Adjacent-block settlement is conservative: unrelated changes to touched state, an
NFT transfer, or a claim crossing an epoch can prevent reconciliation. Core confirmation alone does
not prove this protocol outcome. Fee-on-transfer and rebasing token effects are not silently
accepted as ordinary ERC-20 payouts.

The opt-in `locks-fork.ts` command above accepts a final `voting` argument to run the three voter
domains and fee/bribe claims instead of the full lock expiry sequence. It uses native ERC-20 ledger
fixtures and zero gas; fee funding invokes real notification from a locally impersonated gauge. It
restores the snapshot. These checks do not qualify the Mezo native engine or release support.

## veMEZO rebases

### `createRebaseReader` — inspect a veMEZO claim window

The reader verifies the distributor and the NFT’s escrow state at one block.

`createRebaseReader({networkId: "mezo-mainnet", registry, transport}): RebaseReader` reads
`account`, `tokenId` and optional `blockNumber`. It verifies the registered distributor/minter
runtimes, escrow graph and reverse mappings at one anchored block. `RebaseSnapshot` contains
`contract`, `minter`, `escrow: LockSnapshot`, `tokenId`, `activePeriod`, `tokenLastBalance`,
`userPointEpoch`, distributor `custody: TokenSnapshot`, `periods` and recomputed `claim`. Its
`RebaseCursorInput` fields are `startTime`, `lastTokenTime`, `timeCursor` and `firstUserTimestamp`
(null when no user point exists).

### `calculateRebaseClaim` — calculate a bounded claim

The cursor records where processing should continue through completed reward weeks.

`calculateRebaseClaim(cursor & {periods: RebasePeriod[]}): RebaseClaim` is pure. Each period
supplies `week`, `votingPower`, `totalVotingPower` and `allocated`. It requires all contiguous weeks
in the contract's bounded window, computes each integer product/division with Solidity uint256
bounds and floors, and uses denominator one for zero total power. The result has `amount`,
`epochStart` (the pre-clamp event start), `nextCursor`, `periods` (count) and `hasMore`. Amounts,
timestamps, cursors and counts are bigint; MEZO amounts use 18 decimals. Each call processes at most
50 completed weeks. `hasMore` requires another explicit claim after the first settles; it does not
imply full history was consumed. The reader compares this bounded calculation to on-chain
`claimable`.

### `forecastRebaseClaim` — determine locked or liquid delivery

An eligible claim can increase locked MEZO or pay the owner after expiry.

`forecastRebaseClaim({snapshot, atTimestamp?}): RebaseForecast` adds `disposition` (`locked`,
`liquid`, `none`), resulting `lockedAmount` and `unboostedPower`. Only ordinary self-owned veMEZO
NFTs are admitted: no grants, managed custody or delegation. Existing votes remain untouched and do
not prevent this claim. The minter's active period must be current; the writer does not run upkeep.
Positive claims deposit into active/permanent locks, or pay liquid MEZO to the owner at/after timed
expiry. Distributor custody, tracked balance and its escrow allowance must suffice; the owner needs
no token approval.

### `createRebaseWriter` — execute a rebase claim

Use the forecast disposition and chosen minimum when preparing.

`createRebaseWriter({reader, execution, transport}): RebaseWriter` exposes
`prepare({operationId, account, tokenId, bounds: RebaseBounds})`, `simulate`, `submit` and
`reconcile`. Bounds are `minAmount` and `maxBlockAge`. `PreparedRebase` holds `snapshot`,
`forecast`, frozen `bounds` and `transaction`. Simulation checks the exact claim's uint256 return;
submission rechecks ownership, cursor, epoch, disposition, age, identity and amount. Only objects
prepared and simulated by that writer may be submitted. `reconcile` accepts a persisted submission
record and returns `ReconciledRebase` (`state`, `record`, `receipt`, `outcome: RebaseOutcome`). The
outcome contains the receipt-block `snapshot`, actual `forecast`, `gasFee` and `boundsSatisfied`.

### Rebase settlement

The outcome must match cursor progress and the actual locked or liquid delivery.

Settlement requires exact positive `Claimed` and token transfer events, cursor progress, distributor
balance/accounting, owner wallet or escrow deposit, checkpoint count, lock/supply changes, and
unchanged voter flags. Zero claims advance the cursor without emitting `Claimed` or transferring
MEZO. Native BTC gas is reconciled separately. Unrelated touched-state changes can prevent the
conservative adjacent-block proof. Minimum amounts and disposition are client policy, not on-chain
claim arguments; inspect `boundsSatisfied` after mining.

Prepare a veMEZO rebase claim for a supplied account using configured transport and execution
dependencies:

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

`disposition` explains whether the claim is locked, liquid or empty. `hasMore` means another bounded
claim may remain after this one settles. This excerpt does not submit.

The opt-in `locks-fork.ts` command accepts a final `rebase` argument. It runs real minter upkeep and
permanent/active/expired/zero claims, with explicit native-token balances, supply, mint dispatch and
restored distributor allowance as local fixtures. All mutations are confined to localhost and
snapshot-restored. This qualifies neither native mint authority nor release support.

## CL gauge positions and rewards

### `createCLGaugeReader` — compose a verified position reader

Bind a Pools reader to one selected CL pool before requesting gauge state.

`createCLGaugeReader(config: CLGaugeReaderConfig): CLGaugeReader` requires a Contracts `registry`,
Core `transport`, and an injected `positions: CLGaugePositionReader`. Bind the public Pools CL
reader to one selected key as shown below. The port owns complete verified pool/NFT discovery and
fee math; it must preserve that reader contract. Incentives owns the required structural subset and
adds reward and gauge-operation checks. No package dependency from Incentives to Pools is
introduced.

### Position-reader port

This injected port must preserve Pools’ verification contract; decoded field shape alone is
insufficient.

`CLGaugePositionReader.read({account, tokenIds, blockNumber?})` returns `CLGaugePoolState`. The
gauge reader supplies exactly one positive NFT ID and requires exactly that position, account and
coordinate. `CLGaugePoolState` contains the Pools reader's coordinate/time/account/key, resolved
factory/implementation/manager, pool/gauge, price/tick/unlocked state, active/staked liquidity,
global fee growth, token wallet snapshots, pool custody, native balance, NFT counts, writer
compatibility, ticks and positions. `CLGaugePositionState` is the position subset: token ID,
owner/approval, staked/depositor proof, bounds/liquidity, last fee-growth checkpoints, stored owed
amounts and `fees0`/`fees1` (`insideX128`, `tokensOwed`, `overflowed`). Extra fields from Pools are
permitted. An arbitrary decoded object does not establish this verified port contract.

### `CLGaugeReader.read` — inspect one NFT

The result separates stake ownership, approvals and earned reward state.

`CLGaugeReader.read({account, tokenId, blockNumber?})` returns `CLGaugeState`:

| Field                               | Meaning                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pool`, `position`                  | Verified port state and its one requested NFT.                                                          |
| `contract`, `gauge`                 | Registered gauge implementation template and verified dynamic clone.                                    |
| `staked`                            | Supplied account's stake-set membership, checked against NFT custody/depositor.                         |
| `gaugeApproved`, `operatorApproved` | Exact per-NFT or existing operator permission to the gauge; the writer never creates operator approval. |
| `reward`, `rewardCustody`           | MEZO wallet TokenSnapshot and actual gauge custody, in base units.                                      |
| `earned`                            | New accrual from the deployed getter; excludes already stored rewards. Zero for a non-staked NFT.       |
| `rewards`                           | `CLGaugeRewardState` needed to reconstruct the source update sequence.                                  |

### Reward growth and stored credit

Fresh accrual and already stored rewards are separate values.

`CLGaugeRewardState` contains bigint `rewardRate`, Unix `periodFinish`, `globalX128`, `reserve`,
`rollover`, Unix `lastUpdated`, `lowerOutsideX128`, `upperOutsideX128`, `positionInsideX128`, Unix
`positionLastUpdate`, and `stored`. Gauge/pool rate and period must agree. The reader verifies the
accepted clone/manager generations, gauge topology and canonical MEZO identity/precision. It
compares computed accrual to exact `earned(account, tokenId)` for a proven stake and rechecks the
final chain/hash.

### `calculateCLGaugeEarned` and `forecastCLGauge`

Calculate accrual or an operation’s update sequence from the supplied verified state.

`calculateCLGaugeEarned(snapshot, atTimestamp?): bigint` calculates new accrual from modular uint256
reward growth and uint128 NFT liquidity. Time defaults to the snapshot. It preserves the pool
getter's zero-growth sentinel. `forecastCLGauge({snapshot, action, atTimestamp?}): CLGaugeForecast`
additionally models stored rewards and the action's update sequence. Forward forecasts assume
unchanged tick, liquidity, rates and reserves apart from that sequence; they are not a yield
projection. Timestamp must fit the deployed uint32 pool clock.

### CL gauge actions and eligibility

The CL gauge lifecycle has different fee and reward side effects from Savings and vault receipt
gauges.

`CLGaugeAction` is `approve`, `stake`, `unstake` or `claim-reward`. Stake requires a live gauge,
positive signed-int128 NFT liquidity and ordinary self ownership. Claim/unstake require stake-set
ownership and can exit a dead gauge. The initial writer accepts verified MUSD/mUSDC positions.
Deposit and withdrawal collect ordinary fees first; withdrawal also pays rewards. A claim does not
collect those fees. An unchanged position-update timestamp skips new reward accrual and pays only
stored credit. Pool emission updates consume the bounded reserve even with no active staked
liquidity, assigning that emission to rollover. Period end alone does not replace the source reserve
calculation.

### CL gauge forecast result

Fee caps describe accounting; actual payout is verified separately.

`CLGaugeForecast` returns `action`, MEZO `reward`, collection accounting `feeCap0`/`feeCap1`, signed
`stakeDelta`, in-range `activeStakeDelta`, and `rewardsAfter: CLGaugeRewardState`. Newly deposited
NFTs start at the resulting inside-growth baseline. Collection caps can exceed actual token payout
by pool rounding; settlement reports actual transfers independently.

Bind a verified Pools CL reader to one pool, then inspect a selected NFT’s gauge state:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCLPoolReader } from "@mezo-dev-kit/pools";
import type { CLPoolKey } from "@mezo-dev-kit/pools";
import { createCLGaugeReader, createCLGaugeTargetResolver } from "@mezo-dev-kit/incentives";
import type { RpcTransport } from "@mezo-dev-kit/core";

declare const transport: RpcTransport;
declare const key: CLPoolKey;
declare const account: `0x${string}`;
declare const tokenId: bigint;

const registry = createContractRegistry();

const pools = createCLPoolReader({ networkId: "mezo-mainnet", registry, transport });

const reader = createCLGaugeReader({
  registry,
  transport,
  positions: { read: (input) => pools.read({ key, ...input }) },
});

const state = await reader.read({ account, tokenId });

const resolveTarget = createCLGaugeTargetResolver({ reader, account, tokenId });

console.log(state.earned, state.rewards.stored, resolveTarget);
```

`earned` is new accrual, while `rewards.stored` is existing credit. The resolver binds later gauge
execution to the same verified NFT and pool.

### `createCLGaugeTargetResolver` — resolve the selected gauge

Bind execution to the verified dynamic gauge for the requested NFT.

`createCLGaugeTargetResolver({reader, account, tokenId}): ExecutionTargetResolver` accepts only the
implementation anchor and `cl-gauge` role at the requested coordinate, rereading the selected
position and verified dynamic gauge. Pass it to Core's `resolveTarget`. NFT approvals target the
registered manager directly.

### `createCLGaugeWriter` — prepare NFT staking or claims

Approve the individual NFT before staking when required, then prepare again.

`createCLGaugeWriter({reader, execution, transport}): CLGaugeWriter` provides
`prepare({operationId, account, tokenId, action, bounds})`, `simulate(prepared)`,
`submit(prepared, simulated)` and `reconcile(prepared, record)`. `CLGaugeBounds` requires
nonnegative bigint `minReward`, `minFee0`, `minFee1`, and `maxBlockAge`. An expected positive payout
requires a positive explicit minimum; an expected zero requires zero. These are client
forecast/final-preflight bounds, not contract arguments. The exact calls return void; simulation
proves execution success and rechecks state, without pretending to decode payout amounts.

### NFT approval and prepared intent

The writer creates individual-NFT approval only.

`PreparedCLGauge` contains `snapshot`, `action`, frozen `bounds`, `forecast`, `approvalRequired`,
and the exact zero-value `transaction`. `approve` encodes manager `approve(gauge, tokenId)` only.
Confirm it and reprepare the stake; no `setApprovalForAll`, automatic approval, reward-token
allowance, or voter-only `getReward(address)` call is constructed. Claim uses `getReward(uint256)`.
Matching writer-owned preparations/simulations are required; stale age, changed
identity/ownership/liveness, missing approval and unmet minimums reject sending.

### Actual CL rewards and fees

Inspect actual payments and bounds after confirmation.

`ReconciledCLGauge` contains `state: "reconciled"`, Core `record`, `receipt`, and
`outcome: CLGaugeOutcome`. The outcome contains receipt-block `snapshot`, `forecast`, actual
`reward`, `fee0`, `fee1`, native BTC `gasFee`, and `boundsSatisfied`. Recovery checks persisted
calldata and target identity before provider access. Adjacent-block reconciliation checks NFT
approval/transfer and stake-set/counts, unchanged principal, tick virtual stake, reward
reserve/growth/ cursor/stored balances, fee accounting, actual payments/custody and gas. It uses the
receipt timestamp to model emission updates. Unrelated same-block activity can prevent exact
attribution and is not silently accepted.

Prepare a CL gauge reward claim with a configured reader and execution client. Supply the account
and NFT ID:

```ts
import { createCLGaugeWriter } from "@mezo-dev-kit/incentives";
import type { CLGaugeReader } from "@mezo-dev-kit/incentives";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";

declare const reader: CLGaugeReader;
declare const execution: ExecutionClient;
declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const tokenId: bigint;

const writer = createCLGaugeWriter({ reader, execution, transport });

const prepared = await writer.prepare({
  operationId: "application-owned-unique-claim",
  account,
  tokenId,
  action: "claim-reward",
  bounds: { minReward: 1n, minFee0: 0n, minFee1: 0n, maxBlockAge: 2n },
});

console.log(prepared.transaction); // Application consent precedes simulation and submission.
```

This example prepares the exact call only. Its positive reward minimum rejects a zero-reward
forecast; simulate and submit only after consent, then reconcile actual payments.
