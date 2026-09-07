# MDK Knowledge

`knowledge/` is the maintained retrieval layer for reusable, evidence-backed
Mezo facts. It is used by humans, tools, documentation, packages, and agents.
Canonical means this repository has one maintained owner for a fact; the cited
source or deployed evidence remains the proof for the scope it establishes.

## Find the owning module

`index.json` is the machine entry point. Its `knowledge-module-catalog`
resource maps every stable module ID to the module's human `README.md`, machine
`index.json`, and generated reference when one exists. Paths are resolver
mappings, not cross-domain identities.

| Domain             | Owns                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `networks/`        | Chain identity, endpoints, and bounded capability evidence           |
| `contracts/`       | Deployments, proxy/source/ABI identity, and evidence                 |
| `protocols/`       | Versioned protocol semantics, state, and formulas                    |
| `workflows/`       | Cross-domain execution requirements and observations                 |
| `troubleshooting/` | Reproduced diagnoses and bounded mitigations                         |
| `schema/`          | Repository-wide v0.4 envelope, index, catalog, and reference schemas |

Humans start with this page and the selected module's `README.md` or generated
reference. Tools and agents resolve the module through the root catalog, then
resolve only the required resource through the module index. Do not copy
addresses, ABIs, governed values, formulas, or endpoint lists into another
domain, guide, skill, example, or application.

## Maintaining knowledge

The accepted v0.4 human and shared maintenance contract is
[`docs/standards/knowledge-management.md`](../docs/standards/knowledge-management.md).
It explains module layout, status fields, evidence, freshness, stable
references, schemas, validators, generation, migration, and review. It is
established by
[`ADR-0006`](../docs/decisions/0006-knowledge-module-architecture.md). All sixteen
maintained domain modules use v0.4: Networks, Contracts, shared MUSD,
borrowing, redemptions, institutional MUSD debt, MUSD Savings, mUSDC lending,
the USDC Lending Vault, incentives, pools/liquidity, Prices, bridges,
swaps/routing, transactions, and troubleshooting.

For the end-to-end human and coding-agent procedure, including owner selection,
an executable synthetic module, evidence capture, lifecycle operations, prompt
templates, command selection, and review, use the
[`knowledge-authoring guide`](../docs/guides/KNOWLEDGE_AUTHORING.md). The guide
applies this standard; it is not a second policy or fact owner.

Agents editing this subtree additionally follow [`AGENTS.md`](./AGENTS.md) and
load the knowledge-maintenance plus relevant domain skill. Those files contain
agent routing and procedure, not Mezo facts.

When evidence and a maintained record disagree, preserve the evidence, scope
the conflict precisely, and stop protocol-sensitive promotion until it is
resolved. Memory is retrieval context only and never overrides the maintained
owner or its evidence.
