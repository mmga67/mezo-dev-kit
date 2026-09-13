# Bridges

Private MUSD NTT preparation, manual recovery and bounded observation for the
four recorded directions, plus observation of two evidenced Native Bridge directions.
The [SDK reference](REFERENCE.md) owns the public
contract, injected transports, limits and examples.

`createNttDeliveryObserver` joins one source message to destination redemption
evidence by its NTT digest. It validates receipt/log identity and registered
emitters, checks both chain identities, applies explicit confirmation policies,
and rechecks canonical block anchors. Applications supply up to 32 destination
transaction candidates; the observer does not discover exhaustive history.

EVM, Chains, Contracts and Core retain value, identity, ABI and transport
ownership. The [bridge module](../../knowledge/workflows/bridges/index.json)
owns route/message semantics; its generated profile supplies runtime references
without runtime knowledge-file access.

The NTT observer supplies historical receipt evidence. The separate
`createNttTransferReader` checks current runtime, peers, token representations,
capacity and fees. `createNttTransferWriter` prepares exact ordinary source calls
and preserves separate approval and source outcomes. `createNttRecoveryWriter`
handles explicitly selected queue and attestation operations. Applications own
wallets, durable submission storage and recovery decisions. No automatic retry
or delivery service is selected.

`createNativeDeliveryObserver` separately validates the included direct source
call and joins the Native sequence/recipient/token/amount tuple. Inbound USDC
requires the system payload, stable mapping, exact sequence and recipient balance
transition, and consensus-block coverage excluding other transactions. Outbound
BTC requires attestation, confirmation and fee/net token settlement. Historical
Contracts evidence bounds both directions to their explicitly qualified
observation coordinates; it does not backdate current ABI or writer support.

Canonical route/writer support remains absent; private source
implementation does not satisfy qualified release review.

Run `pnpm --filter @mezo-dev-kit/bridges check`. Root `pnpm check` also verifies
the canonical projection, built imports, reference examples and clean workspace.
Synthetic tests establish failure/confirmation/reorg behavior; historical receipt
verification has a separate scope and does not qualify current bridge writers.
