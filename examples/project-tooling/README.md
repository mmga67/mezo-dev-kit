# Configure and initialize an MDK project

[configure.ts](configure.ts) calls the current public CLI-package parser with
unknown input. Its concrete `foundationConfig` selects the foundation domain,
`.agents/skills` and selected references. Unknown fields, duplicate identities,
invalid paths and unsupported format versions reject with `CliError`.

Run the value through the offline [foundation program](../foundations.ts).
Parsing does not create a project, install dependencies, materialize files or
prove a selected domain exists in a particular bundle. Those are separate
project-utility responsibilities.

## Initialize and inspect

[initialize.ts](initialize.ts) shows the public `runCommand` API:

- `initializeFoundationProject(projectDirectory, bundleDirectory)` writes the
  selected foundation/TypeScript guidance to a project with compatible SDK
  artifacts already installed. The generated bundle directory supplies assets.
  The command is offline; it does not install dependencies.
- `inspectProject(projectDirectory, asOf)` runs the doctor against installed
  state with an explicit review date. Inspect `exitCode` and the structured
  diagnostics together.

Here `CommandContext` is an SDK type describing the command environment:
`cwd` selects the application directory, `sourceRoot` supplies the generated
bundle for initialization, `now` supplies the doctor's review date and an
optional `fetch` supplies remote retrieval. It is separate from EVM connections
and the example-owned `ExampleRuntime`. No broad context object is required by
the parsing example.

See the [CLI guide](../../docs/guides/MDK_CLI.md) for building the bundle and
installing matching private artifacts, or the
[package contract](../../packages/cli/README.md) for the other public APIs.
