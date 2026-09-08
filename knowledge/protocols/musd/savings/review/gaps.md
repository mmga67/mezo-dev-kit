# MUSD Savings review gaps

- Complete gauge stake/claim event reconciliation and any broader Savings
  history required by a separately scoped reader; the current packet includes
  a representative protocol-yield, user-yield, and withdrawal trace.
- Published audit-to-deployed-bytecode mapping for Savings and converter.
- Runtime implementation and support review remain separate from knowledge
  acceptance. The current bounded source-alpha reader is described by the
  [Savings package owner](../../../../../packages/protocols/musd-savings/README.md).
  Wider reader scope and writers still require their own implementation and review.

Savings evidence review qualified review accepted the first two evidence gaps as explicit
limitations of the bounded knowledge packet. They remain requirements only if
a later task claims broader historical, audit, reader, or operation support.

## Resolved on 2026-08-24

Contracts now records all five Savings implementation generations with exact
closed ranges, official `Upgraded` event coordinates, before/at ERC-1967 slot
checks, and generation-specific explorer source metadata. The current
`0xB33C…9e87` generation begins at block 9088927 and is the default for present
operations; historical generations remain coordinate-resolvable but have no
canonical ABI or exact executable-reproduction claim in this packet.
