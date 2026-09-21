# Token SDK reference

Use `@mezo-dev-kit/tokens` to read ERC-20 balances and allowances, plan an exact approval, and
verify a completed approval transaction.

An **allowance** is the amount an account permits a **spender** contract to transfer. `planApproval`
tells you whether the current allowance is sufficient, needs an approval, or first needs resetting
to zero. All amounts are bigint token base units. An approval and the protocol action that uses it
are separate transactions.

Start with the pure planner below, or use `createTokenReader` with a protocol's verified token and
spender. See [package scope](README.md) and the
[execution lifecycle](../core/REFERENCE.md#transaction-execution).

On this page:

- [Functions](#functions)
- [Approval writer](#approval-writer)
- [Approval sequence and recovery](#approval-sequence-and-recovery)
- [Errors and public types](#errors-and-public-types)

## Functions

### `createTokenReader`

Returns `TokenReader`; `transport` is Core's `RpcTransport`.

**Call:** `createTokenReader({ transport })`

### `reader.read`

Returns `Promise<Readonly<TokenSnapshot>>` at an explicit coordinate.

**Call:** `reader.read(input)`

### `planApproval`

Pure `ApprovalPlan`: `sufficient`, `approve` with exact `amount`, or `reset` with zero `amount` and
the desired `requiredAmount`.

**Call:** `planApproval({ allowance, requiredAmount })`

Plan an allowance change using synthetic base-unit amounts. This local calculation does not request
wallet approval:

```ts
import { planApproval } from "@mezo-dev-kit/tokens";

const first = planApproval({ allowance: 5n, requiredAmount: 12n });

if (first.kind === "reset") {
  // Confirm a separate approval for first.amount (zero), then reread.
  const next = planApproval({ allowance: 0n, requiredAmount: first.requiredAmount });

  if (next.kind === "approve") {
    console.log(next.amount); // 12n
  }
}
```

The first plan requires resetting the allowance to `0n`. After that separate transaction is
confirmed and the allowance is reread, the next plan requests exactly `12n`. The example prints that
second amount; it executes neither transaction.

### `createApprovalWriter`

Returns `ApprovalWriter` with the methods below.

**Call:** `createApprovalWriter({ reader, transport, execution })`

### `decodeTokenTransfers`

Returns readonly `TokenTransfer[]`: normalized `from`, `to`, bigint `amount`. Verifies receipt
ownership before decoding.

**Call:** `decodeTokenTransfers(receipt, token)`

### Read inputs and token snapshots

`TokenReadInput` requires `target: TokenTarget`, `account`, `spender` and
`coordinate: ReadCoordinate`. `TokenTarget` has registered anchor `contractId`, actual token
`address`, and optional protocol `targetRole`. All addresses must be nonzero. The reader checks
chain identity, ABI values and block consistency; the protocol must prove the token and spender.
`TokenSnapshot` adds bigint `balance`, bigint `allowance`, and bigint `decimals` (0–255). Amounts
are token base units, never floating point display values.

## Approval writer

### `writer.prepare`

`writer.prepare({ ...TokenReadInput, operationId, amount, expectedAllowance })` returns
`PreparedApproval`: `before`, `amount`, and exact `transaction`. Preparation rereads the allowance
and rejects stale input. Zero explicitly revokes allowance; a positive amount requires the current
allowance to be zero.

### `writer.simulate`

`simulate(prepared)` returns Core's `SimulatedTransaction`.

### `writer.submit`

`submit(prepared, simulated)` returns a `SubmissionRecord`, after another allowance check. Both
methods require objects created by that writer instance.

### `writer.reconcile`

`reconcile(prepared, record)` verifies exact saved intent, confirmed receipt, the
owner/spender/amount in `Approval`, and receipt-block allowance. It returns Core's reconciled result
with the post-approval `TokenSnapshot` as `outcome`.

## Approval sequence and recovery

An approval is a completed independent step. Reprepare the protocol action after confirmation. A
reset needs another fresh approval preparation; never retry the whole sequence blindly after an
uncertain wallet response. Persist the Core record and the preparation context; Core
`observe`/`inspectHash` handle pending, uncertain, reverted, replaced and reorged transactions.
Reconciliation can use an equivalent restored preparation without its original in-process simulation
identity. It still checks the exact durable call.

For a complete approval plus protocol flow, see
[Savings](../protocols/musd-savings/REFERENCE.md#writer) and its
[local integration](../protocols/musd-savings/test/fork.ts). Receipt-block state is end-of-block
state: another same-block allowance change can cause a reconciliation mismatch. Client checks do not
make approval plus deposit atomic.

## Errors and public types

`TokenError` exposes `code: TokenErrorCode`: `InvalidInput`, `StaleAllowance`, `ResetRequired`,
`ReconciliationMismatch`. EVM, registry, RPC and Core errors retain their owning types. Exported
types are `TokenTarget`, `TokenSnapshot`, `TokenReader`, `TokenReadInput`, `ApprovalPlan`,
`PreparedApproval`, `ApprovalWriter`, `TokenErrorCode`, and `TokenTransfer`.
