# Bridge promotion gaps

## MUSD NTT

The current official deployment repository, three fixed-block manager and
transceiver snapshots, and four direction-specific completed transfers now
establish much more than the previous documentation-only leads. Promotion is
still blocked because registry provenance review has accepted the Ethereum/Base Network identities
and bounded manager/transceiver Contract records, but registry acceptance does
not accept routes or writers:

- bridge evidence review qualified review accepted the bounded knowledge surface, but the
  route surface and writer surface were not promoted to support.
- Recipient encoding, instruction encoding, current quote construction,
  allowance/write preconditions, and recovery execution have not been tested
  as a writer interface.

The observed capacities are volatile snapshots. Empty transceiver instructions
reverted in fixed-block quote calls; this is evidence that instruction encoding
is required, not a timeless fee or “bridge unavailable” conclusion.

## Private NTT receipt observer review

The private [Bridges reference](../../../../packages/bridges/REFERENCE.md) defines
a bounded source/destination receipt join. It does not promote route or writer
support. Qualified release review remains pending.

At pinned source commit `8742584991b5f4d1ee63ff10fad8d833a460526c`,
`evm/src/interfaces/INttManager.sol` declares both TransferSent overloads. The
retained 1.1.0 TypeChain manager artifact omits the digest-only event and differs
from Solidity on the six-field event's indexed parameters. This is a concrete
ABI compatibility gap; accepted ABI bytes are not silently corrected here.

The observer uses the correctly represented SendTransceiverMessage event.
`evm/src/libraries/TransceiverStructs.sol` defines its strict manager envelope
and chain-prefixed digest; `evm/src/NttManager/NttManager.sol` emits the same
digest and redeems it in the successful destination mint/unlock transaction.
The four existing completed-transfer records retain their original identities;
private runtime verification does not renew canonical provider/configuration
evidence. A future writer/ABI correction needs its own source-matched validation
and review, plus the current preparation/recovery checks above.

## Relaying semantics

At the recorded blocks, standard and special Wormhole relaying flags were
false for every MUSD peer. Representative source receipts selected NTT manual
relaying mode, yet all four messages were later delivered. Therefore:

- protocol-level manual mode does not prove the user must manually complete;
- successful off-chain delivery does not prove an automatic-delivery SLA;
- only message and destination evidence determines progress and completion.

## Native Bridge

The previous documentation-only gap is resolved at the evidence layer. The
historical v12 evidence owns Assets Bridge execution generation 5 and the
Ethereum binding; fixed-block reads prove the precompile, source tBTC identity,
ten mappings, and volatile BTC/USDC limits. The post-v13 execution-generation
boundary is now verified at block 11358000: the live client reports v13.0.0,
wrapper-v6 bytecode is unchanged, and `getBridgeOutChains()` fails immediately
before activation but returns Ethereum and Bitcoin at activation and latest.
The Ethereum proxy history identifies the exact implementation active for the
sampled transfers and the newer current implementation. One inbound USDC trace
and one outbound BTC trace establish direction-specific completion rules.

Promotion is still blocked because registry provenance review accepted the Ethereum Network
identity and bounded stable Contract records, ABI snapshots, and activation
histories, but token representations and untested mappings are not promoted by
those roots:

- The v13 evidence blocker is resolved. The separate generation-6 Contract
  deployment record is accepted for bounded registry use; route and writer
  support remain absent.
- The sampled Ethereum proxy implementation was superseded after the traces;
  its current implementation, bytecode, sequence, validators, threshold,
  selected minima, token count, fee, and owner are now fixed-block evidence.
  A writer still requires fresh reads, complete token-specific preconditions,
  approvals/authorizations, recipient encoding, and exact-call simulation.
- Only Ethereum USDC→Mezo and Mezo BTC→Ethereum have end-to-end completion
  evidence. The reverse asset directions, other deployed mappings, and Bitcoin
  target chain are not route support claims.
- Qualified review accepted the bounded evidence/model surface; public route,
  relayer, quote, and writer support remain separately gated.

The deployed inbound keeper exposes a critical proof boundary: sequence
acceptance may skip a blocked recipient, missing token mapping, or failed ERC-20
mint. A logless system receipt or advanced sequence is therefore progress, not
standalone recipient-delivery proof.

## Private Native observer review

The private Native observer now joins both saved directions through the explicit
historical Contracts API. Additional source/runtime and consensus-block evidence
is indexed as `native-delivery-qualification-2026-09-12`, with proposed support
and pending qualified review. Ethereum RPC omits non-EVM Cosmos transactions;
its count alone cannot attribute an inbound balance delta. The retained consensus
block has the same hash and one injected transaction. The observer also requires
one bridge entry, stable mapping and exact sequence/recipient state transition.
Pseudo traces are synthesized by the client and do not report actual mint success.

Release review must assess these new historical profiles and attribution limits.
Current source preparation, wider/multi-entry attribution, separate attestation
receipts, other assets and recovery remain separate gaps. The saved replay does
not refresh current transaction preconditions.

## MEZO NTT

Official `ntt-bridge-mezo-mainnet` and testnet repositories were discovered.
The mainnet configuration includes Mezo, Ethereum, Base, BSC, and Solana. It is
not promoted here because the initial evidence slice deliberately covers MUSD
only; MEZO route histories, Solana program/account identity, and every selected
direction still require provider-appropriate proof.
