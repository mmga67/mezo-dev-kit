# External Applications with MDK

MDK is being built as a **library/tooling product**. The current GitHub source
alpha does not publish packages and is not a production-application support
promise. The model below describes the later external-application boundary;
package distribution requires separate approval.

The [SDK reference](../reference/sdk.md) covers the current private workspace
APIs, including direct MUSD borrowing, Savings, lending, vault, gauge and
approval workflows using Core execution. These writer implementations
await qualified protocol review before release; current
consumer guidance does not establish released writer support.

MDK applications are TypeScript-first. Generated templates, examples, consumer
guidance, and documented integration code use TypeScript by default, with TSX
for React source containing JSX. An application can document a narrow
tool-required exception, but MDK does not present JavaScript as an equivalent
default integration path.

Do not create normal user applications as packages inside the MDK monorepo. The monorepo may contain `examples/` and `templates/` only for testing, demonstrations, and project generation.

## Application Model

```text
MDK monorepo
├── packages/               private SDK/tooling workspace modules today
├── templates/              project sources
└── agents/consumer/        canonical consumer-agent sources
          │
          │ release / generate
          ▼
external application
├── package.json            @mezo-dev-kit/* dependencies
├── tsconfig.json           application TypeScript configuration
├── AGENTS.md               application-owned
├── .agents/skills/         portable discovery root
│   └── mdk-*/              unchanged MDK consumer skill directories
└── src/
```

Once external application support is released, an application should use only
documented MDK APIs. Framework layers should consume MDK core/protocol APIs
rather than duplicate Mezo protocol behavior.
Application checks should include TypeScript typechecking in addition to
runtime tests and the framework's build checks.

## Agent Guidance

External applications use two instruction layers.

### `AGENTS.md` — application-owned

Created once when the application is bootstrapped.

It defines:

- what the application is;
- its architecture and conventions;
- project-specific rules;
- how agents should route Mezo-specific work to MDK guidance.

After creation, MDK upgrades must **not overwrite this file**.

Canonical bootstrap source:

```text
agents/consumer/APP_AGENTS.template.md
```

### Consumer skill directories — MDK-owned

Each `mdk-*` directory contains one versioned consumer skill and any bounded
assets or references needed for building **with** MDK. Canonical sources live
under `agents/consumer/skills/` and are indexed by `agents/catalog.json`.

It should contain only consumer-relevant guidance: public APIs, supported workflows, required patterns, troubleshooting, and links/references to deeper documentation.

It must not expose MDK contributor workflows, internal architecture rules,
release procedures, or unrelated protocol knowledge. Contributor skills and
consumer skills are separate catalog audiences and must be installed
separately.

For an agent that discovers the common root, install the directories under
`.agents/skills/`. For a supported runtime that requires a compatibility root,
the same directories may instead be copied unchanged; Claude Code's project
root is `.claude/skills/`. The skill body is not recompiled or rewritten for
either target.

These directories may be synchronized when MDK is upgraded. An
application-owned `AGENTS.md` remains outside that synchronization boundary.

## Distribution

The intended workflow is:

```text
create-mezo-app / mdk init
→ create application AGENTS.md if absent
→ install matching MDK consumer guidance

mdk sync
→ refresh the selected consumer-skill discovery root
→ never overwrite application AGENTS.md

mdk doctor
→ check SDK/config/guidance compatibility
```

Until the public CLI exists, repository maintainers can validate and
materialize the current sources with dependency-free TypeScript tooling:

```sh
node scripts/validate-agent-skills.ts
node scripts/materialize-agent-skills.ts \
  --audience consumer \
  --output <application>/.agents/skills
```

Use a new or empty output directory. To test a supported compatibility target,
change only `--output`; the selected source directories remain unchanged.
Templates may also copy the cataloged consumer directories directly.

Maintainers creating, updating, reviewing, or deprecating those portable
consumer sources follow the
[`skill-authoring guide`](./SKILL_AUTHORING.md). In particular, they validate
audience separation, materialize into a new/empty target, compare source and
output unchanged, and confirm the application-owned `AGENTS.md` was not
modified.

Consumer guidance must match the MDK source or future installed release being
used. During the source alpha, treat materialized consumer skills as repository
development artifacts, not a package compatibility guarantee. A future
versioned consumer must not rely on documentation from a different SDK
version.

## Documentation Ownership

```text
MDK repository docs/knowledge
→ canonical MDK documentation and verified knowledge

agents/consumer/
→ canonical source for distributable consumer-agent guidance

external AGENTS.md
→ application-specific instructions

external discovery root / mdk-*/
→ synchronized MDK consumer guidance
```

Do not copy the full MDK documentation or knowledge tree into applications. Copy only the small operational guidance required for correct MDK usage and reference deeper version-compatible documentation when needed.

MCP is not required for static MDK instructions or release-pinned reference
assets. A future MCP adapter may add value for live, remote, authenticated, or
structured capabilities, but it must resolve the same public API and canonical
knowledge owners rather than become a parallel source of truth.

Private basic pool integrations can use Pools for verified instance discovery,
MUSD/mUSDC liquidity and wallet fee claims, then Swaps for bounded candidate
quotes and exact-input swaps. Follow each [SDK reference](../reference/sdk.md),
configure the pool target resolver for approvals/claims, and keep approval,
submission and reconciliation records separate. Initial writers accept the
verified MUSD/mUSDC assets; broader quoted routes are not automatically executable.

The private institutional debt reader exposes bounded requested positions,
independent aggregate fees and both Enclave authority models. Keep unavailable
price/health visible and preserve subset coverage. Recorded triparty UTXOs need
separate Bitcoin/custody evidence before any backing claim; role membership is
not transaction consent. See the [SDK reference](../reference/sdk.md).
