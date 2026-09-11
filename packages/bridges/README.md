# Bridges

Private, bounded receipt observation for the four recorded MUSD NTT directions
between Mezo and Ethereum/Base. The [SDK reference](REFERENCE.md) owns the public
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

This is historical receipt evidence. Current implementation, peers, pause,
capacity, fees, intended amount/recipient, attestations and relay policy are not
verified. There is no quote, allowance, transfer writer, wallet, automatic retry
or recovery transaction. Native Bridge requires separate tuple and recipient
delivery proof. Canonical route/writer support remains absent; private source
implementation does not satisfy qualified release review.

Run `pnpm --filter @mezo-dev-kit/bridges check`. Root `pnpm check` also verifies
the canonical projection, built imports, reference examples and clean workspace.
Synthetic tests establish failure/confirmation/reorg behavior; historical receipt
verification has a separate scope and does not qualify current bridge writers.
