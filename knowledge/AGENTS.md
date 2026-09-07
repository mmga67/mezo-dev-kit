# Knowledge agent instructions

These rules apply to all work under `knowledge/`.

- Read `docs/standards/knowledge-management.md`, the selected module's
  `README.md` and `index.json`, and only the resources needed for the task.
- Load `agents/skills/mdk-knowledge-maintenance/SKILL.md` for maintenance work,
  then the relevant domain skill for domain-specific evidence and checks.
- Treat records as maintained projections, not proof. Preserve exact source,
  network/version/block scope, freshness, limitations, and review gates.
- Give each fact one owner. Reference stable IDs; do not copy addresses, ABIs,
  endpoint lists, governed values, formulas, or evidence into instructions.
- Update canonical inputs before generated outputs. Never hand-edit a generated
  fact when a generator exists.
- Run the v0.4 structural check and every affected domain semantic validator.
- Resolve the module through `knowledge/index.json` / resource
  `knowledge-module-catalog`, reject unindexed maintained files, and preserve
  all-v0.4 conformance.

Stop for human direction when evidence conflicts or cannot be pinned, scope or
ownership must change, a protocol-sensitive review is missing, an external
dependency is required, or validation would need to be weakened.

Add a nested `AGENTS.md` only when a subtree has concise always-applicable rules
that the knowledge and domain skills cannot express without ambiguity.
