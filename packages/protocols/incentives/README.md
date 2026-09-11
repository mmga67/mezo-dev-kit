# Incentive operations

`@mezo-dev-kit/incentives` implements Savings and USDC Lending Vault gauge
reads, staking, unstaking and streamed reward claims. It is a private source
candidate under [ADR-0016](../../../docs/decisions/0016-protocol-writers-and-discovered-targets.md);
canonical operation support remains proposed/none pending qualified review.

The [SDK reference](REFERENCE.md) documents the complete public surface.
Gauges are discovered through their registered Savings or wrapper root, matched
against exact runtime templates, and checked against the current PoolsVoter.
They are not invented static registry identities. Rewards, voter revenue and
the user's principal remain separate. A dead gauge blocks new stake but retains
the direct unstake path when simulation permits it.

The package also provides lock/boost/epoch/allocation calculations, bounded
veBTC/veMEZO readers, ownership pages and six ordinary self-owned lock operations
under [ADR-0021](../../../docs/decisions/0021-incentives-locks-and-voting.md).
Create, increase, extend, make permanent, return to timed and withdraw each use
explicit preparation, approval where required, exact simulation and reconciliation.
The initial NFT writer excludes grants, managed custody, delegation, votes and
associated boost gauges. Pool, validator and boost voting now have bounded readers and vote/reset
writers. Fee/bribe claims verify reward children, bounded checkpoint history,
owner payouts and custody deltas. Ordinary veMEZO rebase claims have a bounded
reader, exact weekly calculation and claim writer that distinguishes lock
deposits from expired-lock liquid payouts. It preserves voted NFT state and
requires current minter upkeep. All remain private candidates; managed custody
and wider permissioned operations retain separate boundaries.
Node is the tested runtime. Local fork integrations in
[Savings](../musd-savings/test/fork.ts) and [Vault](../usdc-lending-vault/test/fork.ts)
use explicit native reward-token fixtures because Anvil cannot run mezod's
native engine; gauge and protocol bytecode remain unchanged.

CL gauge operations use an injected verified Pools position reader. Incentives
adds per-NFT reward growth, stored rewards, stake-set ownership and exact NFT
approval, stake, claim and unstake operations. Deposit and withdrawal collect
ordinary fees; withdrawal also settles emissions. The writer separates fee
accounting caps from actual transfers and MEZO rewards from native BTC gas.
Direct claims select `getReward(uint256)`; the address overload is voter-only.
The adapter introduces no Pools package dependency in Incentives. Mainnet
MUSD/mUSDC NFTs are the initial private writer profile; qualified review and
native engine qualification remain outstanding.
