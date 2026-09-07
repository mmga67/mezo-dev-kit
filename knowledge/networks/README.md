# Mezo network knowledge

This module is the canonical MDK input for capability-profile chain identity,
published Mezo RPC endpoints, and bounded endpoint observations. It is the
Networks pilot of the accepted knowledge-module v0.4 contract.

## Current status

All four Network identities passed qualified Level 3 review and are supported
within their declared identity/capability scope. Ethereum Mainnet and Base
Mainnet select no RPC endpoints, so their acceptance does not imply provider
availability, bridge-route support, protocol support, or untested RPC
capabilities. Eight published Mezo endpoints with successful bounded
observations are supported; the two Imperator entries remain
`docs-only` because their checks failed. Endpoint health is more volatile than
chain identity and must be rechecked after its review date or before sensitive
use. Support never implies provider uptime or untested RPC capabilities.

## Human use

For a readable snapshot of chain values, review state, freshness, and endpoint
status, open [`generated/reference.md`](./generated/reference.md). It is derived
from indexed records and must not be edited manually.

For exact machine-readable data:

1. open [`index.json`](./index.json);
2. choose a stable resource ID such as `mezo-mainnet`, `ethereum-mainnet`,
   `base-mainnet`, or `rpc-endpoints`;
3. follow its indexed path;
4. check `status`, `supportStatus`, `reviewStatus`, `verifiedAt`, `reviewAfter`,
   `scope`, and `limitations` before using a value;
5. inspect sources or bounded evidence only when the decision requires proof or
   re-verification.

Stable chain identity and volatile endpoint state are deliberately separate.
Do not infer endpoint availability, archive access, optional methods,
subscriptions, batching, or reliability from a network record.

## Maintenance

Follow the repository
[`knowledge-management standard`](../../docs/standards/knowledge-management.md).
Canonical records are under `records/`, source metadata under `sources/`,
bounded observations under `evidence/`, executable domain schemas under
`schema/`, and non-canonical migration/review material under `review/`.

Run from the repository root:

```bash
node scripts/validate-knowledge-structure.ts --module networks
node scripts/test-network-profiles.ts
node scripts/validate-network-knowledge.ts
node scripts/generate-network-reference.ts --check
```

Do not copy chain IDs, currency metadata, explorer URLs, or RPC URLs into docs,
skills, examples, or packages. Resolve logical IDs through the module index or
generate a declared projection.
