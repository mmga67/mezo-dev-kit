# Transaction and RPC Candidate Dispositions

| Candidate | Class | Disposition | Reason |
| --- | --- | --- | --- |
| Explicit client dependencies and pure domain boundary | Architecture candidate | `promoted` through accepted ADR-0002 | Matches the manifest and repository invariants; public API implementation remains separate. |
| Validate → resolve → quote/read → construct → simulate → approve → submit → include → confirm → reconcile | Architecture candidate | `promoted` through accepted ADR-0003 | Accepted lifecycle semantics; state distinctions are executable in `state-machine.json`. |
| Block-coherent logical reads | Architecture candidate | `promoted` through accepted ADR-0002 | Prevents mixed-block financial state. |
| Required/optional logical read outcomes | Architecture candidate | `promoted` through accepted ADR-0002 | Required failures abort the logical read; optional failures remain typed and explicit. |
| Exact approval by default; unlimited only by explicit policy | Architecture/security candidate | `promoted` as accepted requirement | Remains a caller-visible security choice and must be reviewed with each writer. |
| Blind retry of a failed or timed-out write | Unsafe implementation candidate | `reject` | Provider failure does not prove non-acceptance; track or rebroadcast identical signed bytes. |
| Mezo providers have one stable shared batch limit | Hypothesis | `reject` | The bounded evidence demonstrates provider-specific behavior only. |
| Current gauges/ve and MUSD NTT writers | Protocol workflow candidate | `retain-as-gated-design-input` | Deployment-scoped semantics, registry provenance review-accepted registry/activation records, bounded historical createLock/vote integration, and representative bridge delivery evidence now exist. Fresh exact-call writer verification and qualified domain review remain mandatory. |
| Public client library/dependency selection | Architecture/dependency candidate | `retain-as-lead` | No dependency is selected by this task; explicit approval and review are required. |

## Unresolved design questions

- The private dependency-free vertical slice proves the accepted execution
  boundary. Exact public TypeScript result types, package exports, and release
  compatibility remain a separate architecture and implementation decision.
- Confirmation thresholds are explicit policy inputs; protocol/network defaults
  require separately reviewed evidence.
- Provider capability discovery, circuit breaking, and telemetry interfaces
  need implementation evidence before public API commitment.
