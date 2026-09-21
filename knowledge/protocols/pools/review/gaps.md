# Pool and liquidity gaps

- Qualified review of retained CL source and `pools-cl-position-calls` was
  accepted on 2026-09-15. This explanatory scope preserves the original
  evidence coordinates and enables no writer.

- pool evidence review qualified Level 3 review accepted the module and seven CL Contract
  identities/ABIs.
- No current official Mezo Quoter identity was established.
- Dynamic pools, gauges, fee modules, liveness, reserves, positions, ownership,
  reward state, and approvals require fresh reads for current use.
- No swap, liquidity, stake, approval, claim, or route writer is supported.
- The official position descriptor remains labeled partially verified even
  though its supplied source bundle reproduces the executable bytes.
- There is no direct enumerable reverse tokenId-to-depositor getter; an unknown
  beneficial depositor remains `null` until established by bounded evidence.
- No concrete pool integration failure was reproduced during bootstrap, so no
  troubleshooting candidate was promoted as a known issue.

The private [Pools reference](../../../../packages/protocols/pools/REFERENCE.md)
now includes mUSDT beside MUSD/mUSDC. Its own indexed Contracts source, runtime,
slot, mapping and precision evidence define the proposed profile. Only tokens
present in a pool are checked. This private implementation does not change
canonical writer support or qualify native engine/bridge execution; independent
Solidity 0.8.29 compilation and qualified release review remain outstanding.
