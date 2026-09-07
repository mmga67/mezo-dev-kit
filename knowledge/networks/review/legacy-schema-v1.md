# Superseded v0.3 network schema notes

**Status:** Superseded by the executable schemas under `schema/v1/` during
network schema migration. Retained as review history; do not use as the current contract.

The following notes describe the pre-v0.4 layout and record semantics that the
pilot was required to preserve. Current routing comes from `index.json`, common
structure from `knowledge/schema/v0.4/`, and domain structure from
`schema/v1/`.

## Network Records

Each `kind: network` record contains:

- stable `id`, environment, owner, status, support status, and review status;
- `verifiedAt` and `reviewAfter` timestamps;
- one `values` object intended for future `packages/chains` projection;
- atomic claims that reference a value by dot-separated `path`;
- evidence references into `sources.json`, with a precise locator and note;
- limitations that prevent broader inference from the verified facts.

Required values are display name, EVM chain ID, Cosmos chain ID, native
currency, explorer, and explicitly scoped capabilities. EVM chain ID and Cosmos
chain ID are separate fields and must not be used interchangeably.

## Source Records

`sources.json` contains stable evidence IDs. Repository sources must pin a full
commit, exact path, and SHA-256 content digest. Local observation sets must pin
their repository path and SHA-256 digest. A source note states exactly what the
source can establish.

## Endpoint Records

`rpc-endpoints.json` separates transport/provider state from chain identity.
Every endpoint declares:

- stable endpoint and network IDs;
- provider, transport, and URL;
- publication status and official source;
- MDK support status;
- operational status at `lastVerifiedAt`;
- evidence observation, `reviewAfter`, and limitations.

`verified` means the endpoint returned the expected EVM chain ID during the
recorded probe. `failed-verification` means the published endpoint did not pass;
it does not prove permanent unavailability. Endpoint records are volatile and
must be rechecked after `reviewAfter` or before sensitive use.

## Observation Records

Evidence files contain normalized results only: target, time, request methods,
outcome, returned chain identity and bounded block metadata, or a concise error
classification. They must not contain credentials, private data, or unbounded
raw responses.

## Claim Status

- `classification` distinguishes external facts, observations, architecture
  decisions, implementation detail, and product policy.
- `disposition: promote` means the fact is placed in this canonical owner.
- `status: verified` means authoritative/current evidence was checked.
- `reviewStatus: pending-qualified-review` blocks release until Level 3 review.
