# Build an external application with MDK

Use MDK from an independent TypeScript application through its documented
package entrypoints. Your application owns its source, framework, providers,
wallet integration, storage, and configuration.

MDK currently offers private workspace packages and a
[private standalone-project tooling pilot](MDK_CLI.md). There is no public
package-registry release or production support promise. Each
[package owner](../reference/sdk.md#package-selection) defines its available
APIs, required inputs, verification, and protocol-writer qualification.

## Start with a working project

Choose the path that matches your starting point:

| Starting point                      | Next step                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New application                     | [Open the guided console](MDK_CLI.md#guided-setup) with `pnpm cli` in MDK, or `node start.ts` in a prebuilt private kit                                           |
| Existing TypeScript application     | Follow [existing-application setup](MDK_CLI.md#initialize-an-existing-application)                                                                                |
| Explore APIs before creating an app | Run the [offline source example](../../examples/README.md#run-the-offline-foundation-examples), then read a [focused package example](../../examples/PACKAGES.md) |

The generated starter runs a deterministic fixture without an RPC connection.
Its setup guide shows how to install the matching artifacts and verify the
project. Keep MDK package and reference artifacts from the same compatible set.

The starter includes four foundation packages and TypeScript, foundation and
memory skills. From its `pnpm mdk` menu, choose **Add capabilities or skills**
to add a domain set such as borrowing, swaps or liquidity. The CLI previews and
installs the selected packages and matching guidance together. Individual
skills can be selected separately; their required domains are included.
See [capability additions](MDK_CLI.md#add-a-capability-set-or-skill).

## Application Model

For browser and SSR applications, follow the [browser integration guide](BROWSER_APPLICATIONS.md).
The optional `frontend` capability set adds foundation packages and a dedicated consumer
skill; it preserves the application's framework, wallet library and design system.

Normal applications live outside the MDK monorepo. Repository examples and
templates demonstrate integrations and project generation.

```text
MDK public package entrypoints and matching references
  → application-owned integration
      → provider and wallet adapters
      → protocol workflows and durable submission storage
      → framework, UI, and application state
```

MDK's generated applications and maintained integration examples use TypeScript;
JSX uses TSX. Document any narrow tool-required language exception in the
application. Include typechecking alongside tests and framework build checks.

### Choose packages and supply inputs

1. Select the owner in the [SDK reference](../reference/sdk.md). Follow its
   package reference for exact methods, imports, and limitations.
2. Declare the package dependency and use a documented export. Keep dependency
   versions and private artifact overrides consistent with the selected set.
3. Supply application-owned network selection, RPC requests, and any wallet,
   timeouts, confirmation policy, and durable storage required by that API.
4. Keep financial amounts in integer base units and validate external inputs
   through the owning public boundary.
5. Preserve returned block coordinates and availability results. For a writer,
   follow that package's preparation, simulation, submission, and outcome checks.

The [connection example](../../examples/SETUP.md) shows the concrete ports and
factory construction. Focused examples keep the owning protocol calls visible
so an application can reuse their composition.

### Verify the integration

Run your application's typecheck, tests, and build as applicable. Test the
actual installed package entrypoints and your supplied adapters. For a project
using the CLI, `pnpm exec mdk doctor --json` checks its SDK/configuration/guidance
compatibility.

A compatibility check does not verify live protocol state or a transaction
outcome. Review the chosen package's evidence scope and verify the behavior
your application uses. Bridge preparation/recovery and delivery observation,
for example, have distinct inputs and outcomes in the
[Bridges reference](../../packages/bridges/REFERENCE.md).

## Distribution

The CLI runs as a project-local development dependency; global installation
is optional. The [utility guide](MDK_CLI.md) owns private artifact packaging,
installation, offline reference retrieval, updates, and recovery.

Private versions alone do not identify an exact evolving source snapshot.
The tooling pilot checks built inventories and matching bundle identities.
Use the references delivered with the selected artifact rather than assuming
a different checkout describes your installed APIs.

## Documentation Ownership

| Owner                                  | Responsibility                                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| MDK package docs and indexed knowledge | Canonical API contracts and evidence-backed Mezo facts          |
| Generated consumer reference bundle    | Version-compatible distribution of selected canonical resources |
| Application source and configuration   | Integration choices and application behavior                    |
| Application `AGENTS.md`, when used     | Application-specific coding-agent instructions                  |
| MDK consumer skills, when installed    | Guidance for using the matching public MDK APIs                 |

The utility provides a complete index of its declared consumer corpus, a small
local selection, and verified retrieval of additional bundled resources. An
optional complete download makes that corpus available offline. The
[knowledge access guide](MDK_CLI.md#how-the-agent-gets-knowledge) describes its
scope and provenance.

## Agent Guidance

Agent assistance is optional. Applications using it have two instruction owners:

- **Application-owned `AGENTS.md`:** describes the product, architecture,
  conventions, and routing to MDK guidance. Initialization creates it only
  when absent; MDK updates must not overwrite it.
- **MDK consumer skills:** describe supported application-facing usage.
  Install the version-compatible consumer selection into the application's
  chosen discovery root. Contributor maintenance skills belong to MDK itself.

The installed memory skill works with application-owned local observations and
reviewed team context. Nothing is captured automatically and no memory service
is required. See [application memory](APPLICATION_MEMORY.md) for a complete
cross-session example. MDK updates preserve your memory and custom skills.

The ordinary discovery root is `.agents/skills/`; documented compatibility
roots receive the same portable skill directories. Use
[guidance setup and updates](MDK_CLI.md#add-skills-and-update-guidance) for CLI
commands and conflict handling.

Maintainers changing distributable guidance use the
[skill-authoring guide](SKILL_AUTHORING.md). Its source is
`agents/consumer/`, with audience selection in the agent catalog.
The [consumer distribution baseline](../manifest#standalone-project-tooling)
owns compatibility and preservation requirements.

MCP is optional. Static instructions and bundled references work without an
external service; any future adapter must resolve the same API and knowledge
owners.
