# Knowledge agent instructions

These rules apply to all work under `knowledge/`.

- Load only the resources needed for the task, including missing relevant
  sections of `docs/standards/knowledge-management.md`
  and the selected module's orientation/index; reuse unchanged context.
  Use `pnpm context` to resolve/search/read indexed records and fields before
  opening large catalogs. Its manual is `scripts/agents/CONTEXT.md`.
- Follow `docs/standards/documentation.md` for human pages. Keep README
  orientation separate from agent routing and detailed maintenance procedures.
- Load `agents/skills/mdk-knowledge-maintenance/SKILL.md` for maintenance work,
  then the relevant domain skill for domain-specific evidence and checks.
- Treat records as maintained projections, not proof. Preserve exact source,
  network/version/block scope, freshness, limitations, and review gates.
- Give each fact one owner. Reference stable IDs; do not copy addresses, ABIs,
  endpoint lists, governed values, formulas, or evidence into instructions.
- Update canonical inputs before generated outputs. Never hand-edit a generated
  fact when a generator exists.
- For maintenance, run the structural check and every affected domain semantic
  validator. Ordinary read-only retrieval does not imply maintenance work.
- Resolve the module through `knowledge/index.json` / resource
  `knowledge-module-catalog`, reject unindexed maintained files, and preserve
  the current knowledge layout and schema compatibility.

Stop for human direction when evidence conflicts or cannot be pinned, scope or
ownership must change, a protocol-sensitive review is missing, an external
dependency is required, or validation would need to be weakened.

Add a nested `AGENTS.md` only when a subtree has concise always-applicable rules
that the knowledge and domain skills cannot express without ambiguity.
