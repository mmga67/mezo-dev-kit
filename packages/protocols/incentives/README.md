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
associated boost gauges. Wider voter mutations and bribe/fee claims retain their
separate operation boundaries.
Node is the tested runtime. Local fork integrations in
[Savings](../musd-savings/test/fork.ts) and [Vault](../usdc-lending-vault/test/fork.ts)
use explicit native reward-token fixtures because Anvil cannot run mezod's
native engine; gauge and protocol bytecode remain unchanged.
