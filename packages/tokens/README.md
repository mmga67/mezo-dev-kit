# Token operations

`@mezo-dev-kit/tokens` provides exact ERC-20 balance/allowance reads and explicit
approval preparation, simulation, submission and receipt reconciliation.
This is a private source candidate under [ADR-0016](../../docs/decisions/0016-protocol-writers-and-discovered-targets.md).
Qualified review remains required before release.

Use the [SDK reference](REFERENCE.md) for every method, type and example.
The protocol supplies a verified asset and spender. A token interface alone
does not establish either identity. Dynamic approval destinations require the
owning protocol's Core target resolver. This package does not choose a spender,
grant unlimited allowance automatically, or execute a subsequent protocol action.

Amounts are unsigned bigint token base units. Nonzero allowance changes require
a separate reset to zero, confirmation, then a fresh preparation. Existing
sufficient allowances are left intact. Approvals are exact and independently
recoverable through the application-owned Core submission store.

The package uses Core's injected RPC and signer ports. Node is the tested
runtime; browser bundles and native-token engine behavior need their own tests.
Savings, lending and vault [local integrations](../protocols/musd-savings/test/fork.ts)
exercise this package through its built public entrypoint.
