# MDK Agent Sources

This directory owns maintained agent guidance. It separates authored sources
from the discovery directories used by particular agent runtimes.

For first-time contributor installation and later refreshes, follow the
[contributor agent setup guide](../docs/guides/CONTRIBUTOR_AGENT_SETUP.md).
Fresh clones contain this canonical source tree; the repository-root
`.agents/` discovery tree is generated locally and ignored by Git.

## Audiences

- `skills/` contains contributor procedures for maintaining MDK itself.
- `consumer/skills/` contains distributable procedures for applications that
  consume released MDK APIs.
- `consumer/APP_AGENTS.template.md` is copied once and then owned by the
  application.
- `memory/` defines the provider-neutral memory contract. Memory is supporting
  context, never canonical protocol evidence.

Contributor skills must not be shipped to consumer applications. Consumer
skills must not depend on repository-internal maintenance workflows.

Contributors trying package usage follow
[`mdk-capability-assessment`](./skills/mdk-capability-assessment/SKILL.md):
connect the task to current public workspace APIs, relevant skills, and indexed
knowledge before implementing or declaring a gap. Reassess those owners as the
checkout evolves. The [behavioral evaluation guide](../docs/guides/CONTRIBUTOR_AGENT_EVALUATION.md)
explains how to test actual decisions separately from structural validation.

## Portable Skill Contract

Each maintained skill is a directory named exactly like its frontmatter
`name`, with `SKILL.md` at its root. MDK uses standard Agent Skills
frontmatter and does not require vendor-specific metadata.

[`catalog.json`](./catalog.json) is the machine-readable inventory. The
dependency-free TypeScript validator checks catalog coverage, portable
frontmatter, stable names, audience separation, and path containment.

For the complete human and coding-agent creation, update, deprecation, review,
testing, and unchanged-materialization workflow, use the
[`skill-authoring guide`](../docs/guides/SKILL_AUTHORING.md). It applies this
portable contract and includes disposable contributor/consumer examples; it
does not make a discovery view or vendor adapter canonical.

Agent discovery roots are installation targets, not sources of authority. The
same selected directories can be copied unchanged to a generic
`.agents/skills/` root or a compatibility root such as `.claude/skills/`.
This is synchronization, not per-agent prompt compilation.

The accepted architecture and its boundary are recorded in
[`ADR-0008`](../docs/decisions/0008-portable-agent-skill-distribution.md).

## Commands

```sh
node scripts/validate-agent-skills.ts
node scripts/materialize-agent-skills.ts --audience contributor --output .agents/skills
```

Materialize only into a new or empty directory. External application setup
selects `--audience consumer` and an application-owned output path instead;
see the [consumer guide](../docs/guides/EXTERNAL_APPLICATIONS.md).
A future public CLI may wrap
this internal contract after its interface and release behavior are approved.

MCP is optional. It is appropriate for live, remote, authenticated, or
structured capabilities, but static skills and canonical knowledge must remain
usable without it.
