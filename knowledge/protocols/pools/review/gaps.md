# Pool and liquidity gaps

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
