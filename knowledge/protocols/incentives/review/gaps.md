# Current incentives gaps

Verified at Mezo mainnet block `11212253`:

- PoolsVoter is an EIP-1967 proxy and its `ve()` reference resolves to the
  active veBTC proxy recorded in the topology evidence.
- The active veBTC proxy points to the recorded implementation, identifies
  itself as `veBTC`, and points to PoolsVoter plus BoostVoter.
- BoostVoter is an EIP-1967 proxy with fully verified implementation source;
  its `boostableVe()` points back to active veBTC and its `ve()` points to the
  active veMEZO proxy.
- The active veMEZO proxy identifies itself as `veMEZO`, points to BoostVoter,
  and uses the MEZO token precompile.
- The FactoryRegistry reports the documented concentrated-liquidity gauge
  factory as approved at the same block.

The prior source-behavior blocker is resolved with an explicit distinction:

- The official explorer still marks current veBTC and veMEZO implementation
  pages partially verified.
- Independent isolated builds with the exact compiler settings reproduce both
  creation and runtime executable bytecode exactly; only the 53-byte Solidity
  metadata trailers differ. Fixed-block RPC runtime hashes equal the explorer
  runtime hashes. This establishes behavioral identity for the supplied source
  without relabeling it as fully verified or proving authorship/audit history.

registry provenance review resolved the bounded registry prerequisite: the current PoolsVoter,
BoostVoter, veBTC, veMEZO, and FactoryRegistry roles now resolve to accepted Contracts records
with deployment/upgrade histories, activation coordinates, full ABIs, and
explicit executable-reproduction provenance. That registry
acceptance does not accept the incentives protocol or a writer surface.

emission evidence review emission evidence is pinned independently at Mezo mainnet block
`11291582`:

- The active minter, rebase distributor, chain/ecosystem splitters, validator
  and third-party destinations, and both epoch governors have fixed-block
  deployment/source/ABI evidence with exact executable reproduction.
- One emitted epoch reconstructs the deployed emission, rebase, reward
  remainder, and total-supply transition exactly using the recorded integer
  order.
- The chain and ecosystem split events reconcile the reward budget without an
  additive mint, and a later ecosystem `Nudge` event reconciles the current
  governed needle.
- The whitepaper's locked-supply description conflicts with the deployed
  minter's prior-boundary unboosted voting-power read. The canonical model
  preserves that conflict and gives the scoped executable behavior precedence.
- Eight emission-specific Contract identities, deployments, and ABIs received
  qualified registry acceptance under emission evidence review; the reused registry provenance review roles
  retain their accepted registry lifecycle.

validator evidence review validator-allocation evidence is pinned independently at Mezo mainnet
block `11366264`:

- The accepted ValidatorsVoter proxy history contains three implementation
  generations; the active generation starts at block `10032053` and is used
  for current behavior while the earlier generations remain historical
  provenance.
- The active voter source, fixed-block state, and 1,145 historical voter events
  establish a voting domain independent from PoolsVoter, persistent votes, 24
  dynamic validator gauges, exact boosted-weight allocation, lazy reward-index
  accounting, distribution, streaming, and claim behavior.
- Representative vote, reward notification, gauge distribution, and historical
  beneficiary claim observations reconcile exact event amounts, token
  transfers, integer floors, and post-state.
- The approved non-staking gauge factory and its paired voting-rewards factory
  are accepted Contracts roots under validator evidence review. Their dynamic
  child instances remain evidence coordinates rather than static registry
  records.
- The current official Validator Gauge guide agrees with independent
  persistent voting and beneficiary streaming, but another official validator
  guide describes an equal active-validator split. The deployed executable and
  401 observed `Voted` events take precedence for the current generation; the
  conflict remains pinned as documentation drift.

Remaining public-capability and re-verification gaps:

- Current documentation does not publish the live veBTC/veMEZO/BoostVoter
  graph and still lists a different veBTC generation in its governance table.
- No current public Mezo source repository was found for this deployed
  incentives generation. The archived Tigris repository is not a substitute;
  explorer source bundles plus executable reproduction are the scoped evidence.
- Representative fixed-block lock-power, current-boost, stored-boost, and epoch
  reads match the canonical formulas exactly. Historical `createLock` and
  replacement-`vote` calls also pass exact pre-state replay plus receipt and
  post-state reconciliation. Current write readiness still requires fresh
  implementation/precondition reads and exact-call simulation; reset, poke,
  permanent-lock, boost-gauge, distribution, and claim paths do not yet have
  equivalent integration evidence, and reward-contract implementations remain
  outside a supported writer workflow.
- emission evidence review's emission registry additions, formula/evidence model, and protocol
  boundary received qualified Level 3 acceptance. incentives evidence review qualified review
  accepted the broader bounded protocol model on 2026-08-25. Any current
  reader or writer remains separately gated by implementation, fresh-state,
  simulation, reconciliation, security, and operation-specific review.
- validator evidence review's validator allocation model, two factory roots, fixtures, and
  historical reconciliation received qualified Level 3 acceptance on
  2026-08-25. No reader, writer, validator operation, analytics, or public
  support is enabled by that acceptance.

Documentation conflict retained for resolution:

- The official veBTC page says votes do not persist and must be cast each
  epoch. The deployed Voter does not automatically clear vote mappings or pool
  weights at epoch rollover; a later reset, replacement vote, poke, managed-NFT
  transition, or gauge mutation performs the change. `voting.json` records this
  deployed state fact while leaving reward-contract epoch eligibility scoped
  separately.
