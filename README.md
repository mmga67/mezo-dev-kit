# Mezo Developer Kit

**Mezo Developer Kit (MDK)** helps developers build on Mezo with composable
TypeScript packages, evidence-backed protocol knowledge, and working examples.
Use it to explore APIs, understand protocol boundaries, and build applications
with explicit network, wallet, and storage integrations.

> **Availability:** MDK is an experimental GitHub source alpha with private
> workspace packages and a private standalone-project tooling pilot. Packages
> are not published to npm. Compatibility, verification, and protocol-writer
> qualification are documented by each [package owner](docs/reference/sdk.md);
> there is no stable release or production support promise.

## Start Here

| I want to…                             | Start with                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Try MDK locally                        | [Run the offline example](#try-the-offline-example) below                                                        |
| Create a standalone TypeScript project | [Project tooling guide](docs/guides/MDK_CLI.md) — build private artifacts and create a project                   |
| Learn a workflow                       | [Examples](examples/README.md) — borrowing, Savings, lending, liquidity, swaps, bridges, and more                |
| Choose a package or find an API        | [SDK reference](docs/reference/sdk.md#package-selection) — package selection, methods, inputs, and errors        |
| Understand Mezo                        | [Knowledge overview](knowledge/README.md) — networks, deployments, prices, and protocols with their evidence     |
| Contribute to MDK                      | [SDK development quickstart](docs/guides/SDK_DEVELOPMENT.md) — checkout, setup, verification, and a first change |
| Understand the design                  | [Architecture](ARCHITECTURE.md) — package ownership, dependencies, and workflow composition                      |

Browse the [documentation index](docs/INDEX.md) for the full collection of
guides, references, standards, and troubleshooting.

## Try the offline example

Use Node.js 24+ and pnpm 11.0.8, as declared in [package configuration](package.json).
Run these commands from a new source checkout:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
pnpm install --frozen-lockfile
pnpm --filter '@mezo-dev-kit/examples...' build
pnpm --filter @mezo-dev-kit/examples foundations
```

The program prints results for exact amount conversion, network and contract
metadata, price policy, repayment allocation, and project configuration. It
needs no RPC connection or wallet. Read the [example source](examples/foundations.ts)
to see the inputs and calls, then choose an operation from the
[package example index](examples/PACKAGES.md).

For transaction demonstrations, follow the
[local-fork setup](examples/README.md#build-and-run) and the chosen workflow's
prerequisites.

## Building Applications with MDK

Applications normally live in their own repositories. The
[external application guide](docs/guides/EXTERNAL_APPLICATIONS.md) explains
package integration, application-owned configuration, and matching documentation.
The private tooling pilot supplies a TypeScript starter and matching references;
it retains the availability limits above.

Coding-agent support is optional. Use the
[agent guidance overview](agents/README.md) to choose application or contributor
setup. Human setup and package usage work independently of agent instructions.

## Contributing and Help

Start with the [contributor guide](CONTRIBUTING.md) for scope, review, and
verification. Development uses `feat/next`; reviewed changes merge into
canonical `main` through the [branch workflow](docs/guides/BRANCH_WORKFLOW.md).
The [repository scripts manual](scripts/README.md) helps you choose a check,
generator, evidence tool, or local task command.

For problems, use [setup troubleshooting](docs/guides/SDK_DEVELOPMENT.md#troubleshooting)
or the [Mezo troubleshooting index](knowledge/troubleshooting/README.md).
Report security issues through the private process in [Security](SECURITY.md).

MDK is maintained by `@mmga67` during the alpha and licensed under the
[MIT License](LICENSE).
