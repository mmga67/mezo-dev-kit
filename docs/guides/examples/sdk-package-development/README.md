# Disposable SDK package example

Learn how an MDK package exposes a small reader API and how a second package
consumes its built exports. The [reader fixture](repository/packages/synthetic-reader/README.md)
and consumer under `repository/` are fictional teaching source, outside the
live workspace.

## Try the example

Follow the [disposable package walkthrough](../../SDK_PACKAGE_DEVELOPMENT.md#disposable-manual-and-agent-proof)
to copy the fixture, build and test it, and check the consumer's public imports.
The walkthrough supplies the commands and expected failures. Its optional
agent exercise uses a separate copy of the same source.

## How the fixture runs

The fixture must be copied into a temporary workspace before it is run. The
guide copies the current root toolchain configuration alongside it and links
the already-installed root `node_modules`; it does not install a dependency or
modify `pnpm-lock.yaml`. The consumer links the temporary package only because
the disposable workspace has not run `pnpm install`. Its TypeScript and runtime
source import the declared package name, so the package export map—not `src/`
or a relative cross-package path—is what resolves.

The demonstrations each start from a separate temporary copy and are removed
afterward. The expected
result is identical source, generated output, declarations, JavaScript, tests,
boundary diagnostics, and built-consumer behavior.
