# Transaction lifecycle

A transaction hash identifies a submission. Inclusion, confirmation, and
protocol reconciliation are separate steps; only reconciliation establishes
the intended protocol outcome.

- [Detailed lifecycle model](../../knowledge/workflows/transactions/generated/reference.md)
  — states, transitions, errors, and recorded observations.
- [Execution baseline](../manifest#shared-client-and-transaction-lifecycle)
  — shared responsibilities and transaction rules.
- [SDK reference](sdk.md) — current package APIs and their verification scope.
- [Machine-readable transaction index](../../knowledge/workflows/transactions/index.json)
  — stable resources for structured retrieval.

The accepted model defines transaction semantics. Each implementation and
protocol writer retains its own support and release qualification.
