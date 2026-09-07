# Memory lifecycle examples

These synthetic JSON files demonstrate the provider-neutral memory schemas.
They are documentation fixtures, not entries in the live shared or local memory
stores.

| File                              | Store example | Status       | Purpose                                       |
| --------------------------------- | ------------- | ------------ | --------------------------------------------- |
| `example-discovered-local.json`   | local         | `discovered` | Unverified observation retained for follow-up |
| `example-verified-shared.json`    | shared        | `verified`   | Reviewed compact pointer                      |
| `example-promoted-pointer.json`   | shared        | `promoted`   | Canonical owner now contains the decision     |
| `example-deprecated-context.json` | shared        | `deprecated` | Stale context routes to its replacement       |

`local-index.example.json` and `shared-index.example.json` show the matching
selection metadata. The examples intentionally contain no credentials,
private endpoints, personal data, deployed addresses, ABIs, or raw logs.

Use the manual validation procedure in the
[`memory management guide`](../../MEMORY_MANAGEMENT.md). Do not copy these
fixtures into a live store as real findings.
