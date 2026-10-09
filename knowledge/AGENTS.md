# Knowledge agent instructions

These rules apply to all work under `knowledge/`.

- Load only the resources needed for the task. Follow
  [knowledge retrieval](../docs/standards/knowledge-management.md#read-or-use-knowledge):
  use the relevant skill and `pnpm context` to select records, fields, and
  evidence; reuse unchanged context and avoid reading entire indexes.
  Knowledge READMEs are human orientation. Read them for edits, reviews, useful
  explanations, or missing context, rather than as a routine lookup prerequisite.
  Package documentation still owns supported APIs. The retrieval command manual
  is `scripts/agents/CONTEXT.md`.
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
