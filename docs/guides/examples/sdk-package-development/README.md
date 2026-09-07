# Disposable SDK package example

`repository/` contains a fictional private reader package and a consumer. It
is source material for `docs/guides/SDK_PACKAGE_DEVELOPMENT.md`, not a live MDK
workspace package and not a package template or generator promise.

The fixture must be copied into a temporary workspace before it is run. The
guide copies the current root toolchain configuration alongside it and links
the already-installed root `node_modules`; it does not install a dependency or
modify `pnpm-lock.yaml`. The consumer links the temporary package only because
the disposable workspace has not run `pnpm install`. Its TypeScript and runtime
source import the declared package name, so the package export map—not `src/`
or a relative cross-package path—is what resolves.

The manual and coding-agent demonstrations each start from a separate
temporary copy, run the same commands, and are removed afterward. The expected
result is identical source, generated output, declarations, JavaScript, tests,
boundary diagnostics, and built-consumer behavior.
