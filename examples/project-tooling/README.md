# Configure and inspect an MDK application

[configure.ts](configure.ts) shows a concrete `foundationConfig` and validates an
application-supplied configuration value. Start there to understand selected
features and providers without writing files.

[initialize.ts](initialize.ts) shows the actual MDK project CLI API. Its functions
take an explicit project directory plus a bundle directory or inspection date,
and construct the CLI command context. Initialization creates
project artifacts; inspection reports current project state. Invoke initialization
only for an intended application setup operation, not while importing a recipe.
This project tooling is Node-based; it does not belong in a browser bundle.

The [MDK CLI guide](../../docs/guides/MDK_CLI.md) owns command usage and generated
artifacts. These recipes illustrate those APIs without a separate example runner.
