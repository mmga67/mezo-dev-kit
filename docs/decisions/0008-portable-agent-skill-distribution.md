# ADR-0008 — Portable agent-skill distribution

- Status: Accepted
- Date: 2026-08-21
- Accepted by: human architecture review on 2026-08-23

## Context

MDK serves two different agent audiences: contributors maintaining this
repository and developers consuming released MDK packages in external
applications. The repository already expresses procedures as text-based
`SKILL.md` files, but their directory names are not consistently valid skill
identities and consumer guidance has no implemented distribution contract.

Current coding agents increasingly recognize the open Agent Skills directory
format, while their discovery roots and optional extensions still differ.
Encoding the same procedure in several vendor-specific prompt formats would
create drift. Requiring MCP for static instructions would add a runtime and
trust boundary without improving the common local workflow.

## Decision

MDK will use a portable Agent Skills profile as its canonical skill-source
format.

- Maintained contributor skills live under `agents/skills/<name>/SKILL.md`.
- Maintained consumer skills live under
  `agents/consumer/skills/<name>/SKILL.md`.
- Every directory basename equals the frontmatter `name`; names are globally
  unique, lowercase, hyphenated, and prefixed with `mdk-`.
- The portable profile permits only standard top-level Agent Skills
  frontmatter. MDK does not require vendor-only fields for a skill to work.
- `agents/catalog.json` records each skill's identity, source directory,
  audience, and routing domains. It is discovery metadata, not a second copy
  of skill instructions.
- Contributor and consumer skills remain separate audiences. Installation
  must select one audience explicitly and must not leak repository-maintenance
  procedures into external applications.

Agent-specific discovery directories are materialized views:

```text
canonical SKILL.md directory
          │ copy unchanged
          ├──> .agents/skills/<name>/
          └──> .claude/skills/<name>/
```

Materialization copies a selected skill directory unchanged. It is an install
or synchronization step, not prompt compilation. Agents may progressively
load the frontmatter and body according to their own runtime behavior, while
MDK keeps one authored source.

Knowledge-derived consumer reference assets may be generated once per MDK
release from canonical `knowledge/` inputs. They are not regenerated for each
agent. Agent-specific wrappers are allowed only when a supported runtime
requires behavior that cannot be represented by the portable core; wrappers
must remain thin and point to the same canonical skill or public API owner.

MCP is optional. A future MCP adapter may expose live, remote, authenticated,
or structured retrieval and tools. It must not become the authority for
protocol facts, duplicate static skills, or be required for filesystem and
shell-capable agents to use MDK.

The reference validator and materializer are dependency-free TypeScript
repository tooling. A public CLI surface remains a separate release decision.

## Consequences

- One text skill can serve multiple compatible agents without per-agent
  compilation.
- Discovery-path differences become deterministic installation adapters.
- Stable names and a catalog make skills testable and make audience leakage
  detectable.
- Vendor-only capabilities can still be supported through optional adapters,
  but are not part of the portable source contract.
- Consumer skills must describe released public behavior only. Contributor
  skills may route to repository internals and are never shipped by default.
- Static knowledge and procedures remain useful with no MCP server or external
  memory provider.

## Alternatives Considered

- Maintain a separately authored skill tree for every agent vendor.
- Compile every skill into a vendor-specific prompt during each agent run.
- Require an MCP server for all skill discovery and knowledge retrieval.
- Put contributor and consumer guidance in one distributable tree.
- Treat discovery directories as canonical sources.

## Acceptance and Release Boundary

Acceptance establishes the portable source, audience-separation, discovery,
and optional-MCP model as repository architecture. portable skill review proves that model
internally by normalizing sources, adding a catalog, piloting a consumer skill,
and testing unchanged materialization. Acceptance does not publish a package,
guarantee support for every agent, or approve a public `mdk agents` command or
MCP service.

Any supported agent integration must document its tested discovery root and
version. A future MCP boundary, generated consumer reference, or vendor wrapper
requires its own scoped design and verification.

## References

- Agent Skills specification: <https://agentskills.io/specification>
- OpenAI Agent Skills: <https://learn.chatgpt.com/docs/build-skills>
- Claude Code skills: <https://code.claude.com/docs/en/skills>
- Cursor Agent Skills: <https://cursor.com/docs/skills>
- GitHub Copilot Agent Skills: <https://docs.github.com/en/copilot/concepts/agents/about-agent-skills>
- Gemini CLI skills: <https://geminicli.com/docs/cli/skills/>
