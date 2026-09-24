# Mezo Developer Kit

**Start building on Mezo with a guided console.**

Mezo Developer Kit (MDK) creates a standalone TypeScript project and lets you
add SDK packages, AI coding skills, and matching documentation as your app grows.
Start with the essentials, then add borrowing, savings, swaps, or other
capabilities when you need them.

## Start here

> **Source alpha:** Packages are not yet published to npm. See
> [availability](docs/guides/MDK_CLI.md#availability) and
> [package support boundaries](docs/reference/sdk.md).

Build with MDK using Node.js 24+ and pnpm 11.0.8:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
pnpm install --frozen-lockfile
pnpm cli
```

Choose **Create a project**, enter `../my-mezo-app`, and review the setup plan.
MDK builds the packages, installs your application, and checks its setup.
Preparation can take a few minutes.

Once setup passes, exit the console and continue from your new application:

```sh
cd ../my-mezo-app
pnpm mdk
```

Your project starts with foundation packages and skills for TypeScript, Mezo
foundations, and project memory. Coding-agent support is optional. The CLI stays
local to your project; no global installation or PATH changes are needed.

For example, choose **Add capabilities or skills**, select **Capability set**,
then **MUSD borrowing**. Review the proposed additions to install the packages,
skills, and references for that integration. You build your application's
features using those tools.

Return to `pnpm mdk` whenever you want to add capabilities, browse documentation,
or check your setup.

## Continue building

| I want to…                   | Read next                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Use the console              | [CLI guide](docs/guides/MDK_CLI.md#guided-setup) — setup, menus, and portable kits                                                |
| Use MDK in an existing app   | [Application guide](docs/guides/EXTERNAL_APPLICATIONS.md) — integration and application ownership                                 |
| Find APIs and working code   | [SDK reference](docs/reference/sdk.md#package-selection) and [examples](examples/README.md)                                       |
| Work with an AI coding agent | [Application skills](docs/guides/MDK_CLI.md#how-the-agent-gets-knowledge) and [project memory](docs/guides/APPLICATION_MEMORY.md) |
| Understand Mezo              | [Mezo knowledge](knowledge/README.md) — networks, deployments, and protocols with their evidence                                  |

Browse the [documentation index](docs/INDEX.md) for the full collection of guides
and references.

## Contributing

To improve MDK itself, start with the
[development quickstart](docs/guides/SDK_DEVELOPMENT.md) and
[contributor guide](CONTRIBUTING.md). The [architecture](ARCHITECTURE.md) explains
package ownership and dependencies.

Report security issues through the private process in [Security](SECURITY.md).

MDK is maintained by `@mmga67` during the alpha and licensed under the
[MIT License](LICENSE).
