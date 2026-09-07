# USDC Lending Vault review gaps

- Published audit-to-deployed-generation mapping remains unavailable and is an
  accepted limitation of the bounded reviewed packet.
- Broader wrapper or gauge history remains outside the bounded reviewed packet.
- Separate implementation, simulation, security, and release review is
  required before any public reader or writer.

## Resolved on 2026-08-24

The bounded flow packet reconstructs all three allocator changes and the empty
sentinel event history through the module coordinate, confirms current and
retired candidates with fixed-block reads, and reconciles a representative
deposit/allocation plus withdrawal/deallocation through decoded calls, receipts,
token transfers, adapter events, and adjacent archive state. Broader wrapper or
gauge histories remain outside this bounded packet and any future operation.

## Accepted on 2026-08-25

Qualified Level 3 review accepted the adapter and wrapper Contract roots and
accepted VaultV2/VaultGauge as runtime-verified protocol role candidates rather
than Contract roots. This disposition preserves the missing-creation-input
boundary without inventing an ADR-0005 provenance class. Protocol support
remains proposed and operation support remains none.
