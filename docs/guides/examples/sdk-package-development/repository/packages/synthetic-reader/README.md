# Synthetic reader package

This package is a disposable, fictional teaching fixture. It contains no Mezo
address, ABI, deployment, price, financial rule, provider endpoint, or writer.

Its deliberately small supported surface demonstrates:

- private source-alpha package metadata and an explicit built export map;
- validation of an external `unknown` response;
- exact `bigint` base units and one pinned block coordinate;
- typed provider, partial-read, invalid-response, and consistency failures;
- explicit optional-item unavailability;
- a pure calculation separated from the injected read port; and
- a deterministic generated model with a named input, SHA-256 digest, and
  `generate:check` drift gate.

`generator-input/synthetic-model.json` is canonical only inside this fictional
fixture. A real Mezo module resolves its input through the owning indexed
`knowledge/` module and repository generator. Runtime code imports only
`src/model.generated.ts`; it never reads the JSON input.
