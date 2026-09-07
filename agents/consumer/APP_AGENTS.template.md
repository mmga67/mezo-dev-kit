# AGENTS.md

## Purpose

This application is built with **Mezo Developer Kit (MDK)**.

This application is **TypeScript-first**. Add application source and tests in
TypeScript by default, use TSX only where JSX is present, and preserve useful
types across MDK and application boundaries. Do not add plain JavaScript as an
alternative implementation path unless this application documents a concrete
tool constraint.

When bootstrapping a new TypeScript test toolchain, use Vitest by default.
Preserve an application's established runner unless the current task explicitly
includes a migration.

This file is owned by the application. Add project-specific architecture, conventions, and constraints here. MDK tooling must not overwrite this file after bootstrap.

MDK's contributor coding standard does not override this application's own
standard. Route project-specific quality rules here or to an application-owned
standard, and use the installed MDK consumer skills for public SDK boundaries.

## MDK Development

For Mezo-specific work:

1. Determine which application domain is affected.
2. Load only the relevant `mdk-*` consumer skill under the application's
   configured discovery root, normally `.agents/skills/`.
3. Inspect the application's existing code and configuration.
4. Implement application behavior in TypeScript and validate untrusted runtime
   data at RPC, wallet, user-input, and protocol boundaries.
5. Use supported public MDK APIs before implementing Mezo behavior manually.
6. Verify network-, contract-, and protocol-sensitive assumptions against the version-compatible MDK guidance.
7. Run the narrowest meaningful typecheck, test, lint, and build checks.

Do not load unrelated MDK skills by default.

## MDK Boundaries

- Treat `@mezo-dev-kit/*` packages as external public dependencies.
- Do not import MDK repository internals or unpublished source paths.
- Do not duplicate contract addresses, ABIs, deployment metadata, or supported protocol logic when MDK provides a canonical API/registry.
- Do not reimplement an MDK-supported workflow solely for convenience.
- Keep application-specific business logic, UI, storage, and architecture inside this application.
- If MDK lacks a required capability, verify the gap before introducing a local workaround.

## Sources of Authority

```text
Current task
→ desired application outcome

Application AGENTS.md / nested AGENTS.md
→ application rules

configured discovery root / mdk-*/
→ version-compatible MDK usage procedures

Application code + tests
→ current application implementation

Installed @mezo-dev-kit/* public APIs
→ available MDK capability
```

For protocol-sensitive behavior, missing or conflicting MDK guidance is a stop condition: verify before implementing.

## Project-Specific Guidance

Add or route project-specific instructions here or through nested `AGENTS.md` files.

Do not place general MDK protocol documentation in this file.
