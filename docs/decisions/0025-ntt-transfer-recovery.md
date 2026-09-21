# ADR-0025 — Private MUSD NTT transfer and recovery

> Historical decision, consolidated on 2026-09-15 into
> [Events and bridge outcomes](../manifest#events-and-bridge-outcomes).
> The original text and acceptance scope below are retained for context;
> the manifest and its delegated owners define current policy.

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-13

Bridges extends the existing four-direction MUSD NTT observer with explicit
source preparation and manual recovery. Core retains exact simulation,
signer identity, durable submission and receipt confirmation. Applications
compose the existing Tokens approval writer as a separate operation. The
Bridges dependency graph is unchanged.

Contracts projects registered NTT runtime identities and the ordinary
six-argument transfer, queue completion/cancellation, approved-message execution
and manual transceiver receive interfaces on Mezo, Ethereum and Base. It does
not expose administrative or relayer-only operations. The accepted TypeChain
manager event artifact is preserved. Source reconciliation uses the separately
verified transceiver envelope and exact intended token, amount, sender and
recipient; it does not decode either TransferSent overload.

Preparation pins each chain independently, checks registered runtimes, token
representation, peers, threshold, enabled transceiver, pause, capacity, fee,
allowance and account balance. The indexed current configurations have one
enabled transceiver at registered index one. The manager view quote uses an
enabled-length instruction array, whereas the transfer path uses the registered
count. The reader calls that enabled transceiver's quote with its actual index
and an explicit manual instruction; initial and final exact source simulations
remain required. No fee or delivery SLA is inferred from retained observations.

Amounts with trimming dust are rejected. Source queues already hold or burn
tokens. Their recovery uses the existing queue sequence and custody, never a
new source transfer. Outbound cancellation depends only on source state.
Destination recovery binds the same confirmed source digest; VAA body matching
does not verify guardian signatures. The deployed transceiver verifies the VAA
during exact simulation and execution. Destination progress still needs the
existing observer's independent confirmation and final anchor checks.

The implementation remains private and the additional qualification is proposed,
pending qualified release review. Local fork authority, balances, time changes
and queue-limit fixtures do not establish live operator authority, relayer
availability or Mezo gas behavior. No live value-bearing verification or release
is authorized by this decision.
