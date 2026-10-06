# Evidence

Collect bounded, read-only observations through the same API in a browser or the
MDK CLI. Start with [the junior walkthrough](../../docs/guides/EVIDENCE_REFRESH.md)
or the [API reference](REFERENCE.md).

This private candidate provides network identity, selected registered current
runtime identities, the mainnet Skip BTC/USD source, and selected mainnet incentive
configuration/state fields. `evidenceCapabilities()`
lists networks, contract selections, input digests and omissions without RPC.
Reports preserve failed and partial captures. Collection never changes knowledge
files, accepts canonical evidence, proves governance authorization or authorizes a writer.
The incentive recipe compares 34 cataloged fields across five roots, with six
string getters explicitly unavailable. A configuration difference requires review;
ordinary supply, voting-power and count movement is reported separately.

Transport, clock, cancellation, progress and application storage are explicit.
The package imports no Node modules or filesystem. The CLI owns durable local
files; applications own their UI and persistence. New recipes need their own
reviewed domain scope and authoritative evidence.

From the repository root, use `pnpm --filter @mezo-dev-kit/evidence check`.
Regenerate inputs with `node scripts/generate/generate-evidence-package.ts`
after their canonical package generators and `pnpm --filter @mezo-dev-kit/contracts... build`. `pnpm generate:check` checks drift.
Browser execution and qualified review remain required before release.
