# Set up contributor agent skills

Use this guide when working on MDK or trying its workspace packages inside
this repository. Fresh clones contain the canonical skill sources in
`agents/skills/` and their inventory in `agents/catalog.json`. The root
`.agents/` directory is local, Git-ignored installation output and is not
included in the source snapshot. Package installation does not create it.

External applications use the separate
[consumer setup](./EXTERNAL_APPLICATIONS.md); do not install contributor
procedures into an application. [ADR-0008](../decisions/0008-portable-agent-skill-distribution.md)
owns the source, audience, and distribution boundaries.

## Install in a fresh clone

Use Git and the Node version required by the root
[`package.json`](../../package.json), currently Node 24 or newer. These
dependency-free setup scripts run directly with Node; they need no package
build, pnpm install, API key, MCP server, or external memory service.

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
node --version
node scripts/validate-agent-skills.ts
node scripts/materialize-agent-skills.ts --audience contributor --output .agents/skills
```

In an existing checkout, run the last two commands from its repository root.
The output must be new or empty. If it already contains files, use the refresh
procedure below; the materializer deliberately refuses to overwrite them.
The script validates the catalog, selects contributor entries only, and copies
each entire skill directory unchanged. It reports the selected count and path.
Placeholder folders containing only `.gitkeep` are not cataloged skills and
are not installed.

The clone's default `main` branch is suitable for trying the published source.
For contribution work, follow the maintainer-selected branch and the
[SDK development guide](./SDK_DEVELOPMENT.md#checkout-and-branch-policy).
Run these setup commands in the checkout where the agent executes, including
remote or disposable workspaces that do not share your local files.

## Verify files and runtime discovery

Spot-check the assessment skill and verify that discovery output stays local:

```sh
diff -r agents/skills/mdk-capability-assessment .agents/skills/mdk-capability-assessment
git ls-files .agents
git status --short -- .agents
git check-ignore .agents/skills/mdk-capability-assessment/SKILL.md
```

The first three commands should print nothing. The final command should print
the ignored path. The `diff` checks one representative directory; compare other
cataloged skills the same way when investigating a specific copy. Comparing
the whole `agents/skills` tree also includes uninstalled placeholder folders.
File checks establish installation integrity; the agent's skill selector
separately establishes discovery.

Open the repository as the agent's workspace. In Codex CLI or the IDE
extension, run `/skills` or type `$` and look for `mdk-capability-assessment`.
Codex scans `.agents/skills` from its working directory up to the Git root and
detects skill changes automatically; restart it if the new skills do not
appear. These host behaviors follow the
[official OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills),
checked on 2026-09-08. Record your agent/version and check its actual selector;
successful file copying does not prove discovery in every agent runtime.

For another agent, consult its official discovery documentation and supply
that supported directory as `--output`. Keep the skill directories unchanged
and keep local discovery output out of version control. The portable format
does not promise that every host scans `.agents/skills`. Avoid installing a
second copy of the same MDK skills into user-global and repository locations.

Once discovery works, start a fresh session with an ordinary task, for example:

> As an MDK contributor, demonstrate a deterministic contract read using the
> current workspace packages. Run the applicable checks and explain what they
> establish.

The agent should select relevant procedures, inspect current public APIs and
canonical knowledge, and distinguish offline verification from live behavior.
Installing all contributor skill directories makes them available for
selection; it does not require loading every skill body for each task. Use the
[behavioral evaluation guide](./CONTRIBUTOR_AGENT_EVALUATION.md) when assessing
the agent's decisions beyond basic discovery.

## Refresh after a checkout update

After pulling changes, switching branches, or editing canonical skills,
regenerate discovery from the current catalog. Git does not update ignored
copies. Make authored changes under `agents/skills/`; local copies are replaced
during refresh.

The following recipe replaces an existing `.agents/skills` installation. It
generates the new set first and retains the entire old set under ignored
`local/agent-skill-backups/`:

```sh
mkdir -p local/agent-skill-backups
mdk_skill_refresh="$(mktemp -d local/agent-skill-backups/refresh-XXXXXX)"
node scripts/materialize-agent-skills.ts \
  --audience contributor --output "$mdk_skill_refresh/new-skills" &&
  mv .agents/skills "$mdk_skill_refresh/previous-skills" &&
  mv "$mdk_skill_refresh/new-skills" .agents/skills
```

The `&&` sequence stops if validation, generation, or a move fails. Inspect the
reported error and the backup before continuing. If no installation exists,
use the fresh-install command instead.

If the previous directory also contained personal or third-party skills,
review and restore those directories from `previous-skills` after checking for
name collisions. Do not restore obsolete MDK directories removed from the
current catalog. Compare MDK copies against their canonical directories and
check runtime discovery again. Retain the backup until you have reviewed any
local edits; there is no automatic deletion or merge of those edits.

Existing clones upgrading from the formerly tracked `.agents/` tree may lose
the old tracked copies when Git applies their removal. Re-run local setup after
the update. Preserve any local edits before pulling; they belong in canonical
sources if they are intended MDK changes.

## Troubleshooting

- **No MDK skills in the selector:** check the actual workspace/root, host
  discovery path, enabled skills, and a fresh/restarted session. Root
  `AGENTS.md` still points to canonical procedures; a filesystem-capable agent
  can read those sources directly while resolving setup.
- **Target must be empty:** an installation or custom files already exist.
  Use the backup-and-refresh procedure; do not force-copy over the directory.
- **Catalog validation fails:** fix the reported canonical source/catalog
  issue first. Copying old discovery files does not repair it.
- **Duplicate or stale descriptions:** inspect repository and user-global
  installations, then refresh the intended checkout's copy.
- **Permission denied:** install in the agent's writable workspace or run
  setup from your local terminal. Do not redirect contributor skills into a
  consumer application to work around a permissions error.
- **Package imports fail after setup:** skill installation does not build
  workspace packages. Follow the [SDK quickstart](./SDK_DEVELOPMENT.md) for
  the root-pinned pnpm install/build/check workflow.

For materializer regression checks, run `node --test scripts/test-agent-skills.test.ts`.
`pnpm test:clean` separately proves package checks without local discovery
copies, then contributor and consumer CLI materialization in the disposable
workspace. Neither check starts an agent UI or proves protocol execution.
