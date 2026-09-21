# Agent utilities

[Scripts manual](../README.md) · Run from the repository root.

Canonical contributor procedures live in `agents/skills/`; consumer procedures
live in `agents/consumer/skills/`. [agents/catalog.json](../../agents/catalog.json)
selects their audience. `.agents/skills/` is generated local discovery.

For ordinary knowledge and memory retrieval, start with `pnpm context --help`
and the [offline retrieval manual](CONTEXT.md). It provides bounded queries,
record/field selection, retained-source/ABI inspection and memory validation.

| Script                                                           | Invocation after `node scripts/agents/`                                   | Inputs, output, and effect                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [retrieve-context.ts](retrieve-context.ts)                       | `retrieve-context.ts --help`                                              | Reads indexed knowledge and selected memory offline; use the [retrieval manual](CONTEXT.md) for coverage and bounds                 |
| [validate-agent-skills.ts](validate-agent-skills.ts)             | `validate-agent-skills.ts`                                                | Checks the canonical catalog, skill metadata, references, and audience boundaries; no materialization                               |
| [materialize-agent-skills.ts](materialize-agent-skills.ts)       | `materialize-agent-skills.ts --audience contributor --output <directory>` | Validates the catalog and writes the selected skills into a new/empty directory; `--audience consumer` selects application guidance |
| [measure-agent-context.ts](measure-agent-context.ts)             | `measure-agent-context.ts [repository-root]`                              | Prints JSON byte/character measurements for instructions and skills; defaults to the current directory                              |
| [prepare-capability-fixtures.ts](prepare-capability-fixtures.ts) | `prepare-capability-fixtures.ts <new-or-empty-output>`                    | Writes synthetic fixtures for capability-assessment evaluations; requires a new/empty output directory                              |

Fresh contributor installation:

```sh
node scripts/agents/validate-agent-skills.ts
node scripts/agents/materialize-agent-skills.ts --audience contributor --output .agents/skills
```

If discovery already exists, use the
[backup-and-refresh procedure](../../docs/guides/CONTRIBUTOR_AGENT_SETUP.md#refresh-after-a-checkout-update).
The materializer deliberately refuses to merge into an occupied directory.

For consumer installation and application-owned instructions, follow
[external applications](../../docs/guides/EXTERNAL_APPLICATIONS.md).
[Skill authoring](../../docs/guides/SKILL_AUTHORING.md) owns catalog changes,
evaluation, and materialization rules.

Verification uses two runners:

```sh
node --test scripts/tests/test-agent-skills.test.ts
pnpm test:quality scripts/tests/test-capability-fixtures.test.ts
```

Context measurements count bytes and characters, not model tokens or the host's
complete rendered prompt. Fixture setup does not establish a live capability.
