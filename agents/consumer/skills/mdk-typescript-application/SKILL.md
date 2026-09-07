---
name: mdk-typescript-application
description: Build or review a TypeScript application that consumes released Mezo Developer Kit APIs. Use for application source, tests, configuration, and integrations; do not use for maintaining the MDK repository itself.
---

# MDK TypeScript application

## Purpose

Keep applications built with MDK TypeScript-first while preserving public SDK
boundaries, runtime validation, and canonical ownership of Mezo facts.

## Use when / do not use when

Use this skill when adding or reviewing application code, tests, configuration,
or framework integration that consumes an installed MDK release.

Do not use it to maintain the MDK monorepo, infer an unpublished SDK feature,
copy internal repository source, or approve a protocol-sensitive write that the
installed release does not support.

## Required context

1. Read the application's root and nearest nested `AGENTS.md` files.
2. Read the application's own coding standard when one exists; MDK contributor
   repository policy is not application authority.
3. Inspect its package manifest, TypeScript configuration, installed MDK
   versions, and the public types actually exported by those packages.
4. Load only the additional version-compatible MDK consumer skill required by
   the task.
5. Inspect the affected application source and tests before changing them.

## Procedure

1. Add application source and tests in `.ts`; use `.tsx` only for source that
   contains JSX.
2. For a new TypeScript test toolchain, default to Vitest. Preserve an
   established application runner unless the current task includes migration.
3. Consume installed public MDK exports. Do not import MDK repository internals
   or guess APIs described only on a newer branch or website.
4. Preserve useful domain types across application boundaries and narrow
   `unknown` values at RPC, wallet, environment, user-input, storage, and
   protocol boundaries.
5. Keep deterministic calculations separate from RPC, wallet, UI, storage,
   and global state.
6. Reuse released MDK network, deployment, ABI, and protocol owners. Do not
   create an application-owned duplicate merely for convenience.
7. Model failures explicitly. Do not hide unsupported networks, rejected
   simulations, reverted transactions, stale quotes, or reconciliation errors.
8. Keep framework adapters thin over public core or protocol APIs.

## Verification

- Run the application's relevant TypeScript typecheck.
- Run targeted tests and the affected framework or package build.
- For an external boundary, test invalid and unavailable input as well as the
  successful case.
- Confirm imports resolve from installed public package exports rather than
  workspace or repository-internal paths.

## Stop conditions

Stop and ask for direction when the required capability is absent from the
installed public API, version-compatible guidance conflicts with deployed
evidence, a new dependency is required, or a protocol-sensitive assumption
cannot be verified.

## Common failure modes

- Adding JavaScript alongside TypeScript as a second implementation path.
- Using `any` to bypass an unknown runtime boundary.
- Copying an address, ABI, or protocol rule into application code.
- Assuming a public writer exists because a read model or knowledge record
  exists.
- Loading contributor maintenance instructions into a consumer application.
