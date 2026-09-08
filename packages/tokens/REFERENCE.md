# Token SDK reference

Import from `@mezo-dev-kit/tokens`. This private implementation follows the
[execution lifecycle](../core/REFERENCE.md) and [package scope](README.md).

| Function                                                 | Contract                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createTokenReader({ transport })`                       | Returns `TokenReader`; `transport` is Core's `RpcTransport`.                                                                      |
| `reader.read(input)`                                     | Returns `Promise<Readonly<TokenSnapshot>>` at an explicit coordinate.                                                             |
| `planApproval({ allowance, requiredAmount })`            | Pure `ApprovalPlan`: `sufficient`, `approve` with exact `amount`, or `reset` with zero `amount` and the desired `requiredAmount`. |
| `createApprovalWriter({ reader, transport, execution })` | Returns `ApprovalWriter` with the methods below.                                                                                  |
| `decodeTokenTransfers(receipt, token)`                   | Returns readonly `TokenTransfer[]`: normalized `from`, `to`, bigint `amount`. Verifies receipt ownership before decoding.         |

`TokenReadInput` requires `target: TokenTarget`, `account`, `spender` and
`coordinate: ReadCoordinate`. `TokenTarget` has registered anchor `contractId`,
actual token `address`, and optional protocol `targetRole`. All addresses must
be nonzero. The reader checks chain identity, ABI values and block consistency;
the protocol must prove the token and spender. `TokenSnapshot` adds bigint
`balance`, bigint `allowance`, and bigint `decimals` (0–255). Amounts are token
base units, never floating point display values.

`writer.prepare({ ...TokenReadInput, operationId, amount, expectedAllowance })`
returns `PreparedApproval`: `before`, `amount`, and exact `transaction`.
Preparation rereads the allowance and rejects stale input. Zero explicitly
revokes allowance; a positive amount requires the current allowance to be zero.
`simulate(prepared)` returns Core's `SimulatedTransaction`.
`submit(prepared, simulated)` returns a `SubmissionRecord`, after another
allowance check. Both methods require objects created by that writer instance.
`reconcile(prepared, record)` verifies exact saved intent, confirmed receipt,
the owner/spender/amount in `Approval`, and receipt-block allowance. It returns
Core's reconciled result with the post-approval `TokenSnapshot` as `outcome`.

An approval is a completed independent step. Reprepare the protocol action
after confirmation. A reset needs another fresh approval preparation; never
retry the whole sequence blindly after an uncertain wallet response. Persist
the Core record and the preparation context; Core `observe`/`inspectHash`
handle pending, uncertain, reverted, replaced and reorged transactions.
Reconciliation can use an equivalent restored preparation without its original
in-process simulation identity. It still checks the exact durable call.

```ts
import { planApproval } from "@mezo-dev-kit/tokens";
const first = planApproval({ allowance: 5n, requiredAmount: 12n });
if (first.kind === "reset") {
  // Confirm a separate approval for first.amount (zero), then reread.
  const next = planApproval({ allowance: 0n, requiredAmount: first.requiredAmount });
  if (next.kind === "approve") console.log(next.amount); // 12n
}
```

For a complete approval plus protocol flow, see
[Savings](../protocols/musd-savings/REFERENCE.md#writer) and its
[local integration](../protocols/musd-savings/test/fork.ts).
Receipt-block state is end-of-block state: another same-block allowance change
can cause a reconciliation mismatch. Client checks do not make approval plus
deposit atomic.

`TokenError` exposes `code: TokenErrorCode`: `InvalidInput`, `StaleAllowance`,
`ResetRequired`, `ReconciliationMismatch`. EVM, registry, RPC and Core errors
retain their owning types. Exported types are `TokenTarget`, `TokenSnapshot`,
`TokenReader`, `TokenReadInput`, `ApprovalPlan`, `PreparedApproval`,
`ApprovalWriter`, `TokenErrorCode`, and `TokenTransfer`.
