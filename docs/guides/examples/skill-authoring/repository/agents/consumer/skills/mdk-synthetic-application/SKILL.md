---
name: mdk-synthetic-application
description: Use the fictional documentation fixture from a disposable application example. Use only to demonstrate consumer skill distribution; do not infer released MDK behavior.
---

# Synthetic application fixture

## Purpose

Demonstrate a small portable consumer procedure without depending on MDK
repository-maintenance instructions or real protocol facts.

## Use when / do not use when

Use only inside the disposable application created by the skill-authoring
guide. Do not use to maintain MDK, infer a public package, or contact a live
service.

## Required context

Read the application-owned `AGENTS.md` and the local fixture task. Those
application instructions remain authoritative for the example project.

## Procedure

1. Inspect the application fixture before changing it.
2. Keep the example TypeScript-first and local to the disposable directory.
3. Treat every MDK capability as unavailable unless the fixture explicitly
   supplies a local fake.
4. Preserve application-owned instructions and report the exact local diff.

## Verification

Run the fixture's local checks and confirm this skill was copied unchanged
from the selected consumer source.

## Stop conditions

Stop if the request requires an unpublished API, contributor-only guidance,
credentials, network access, or any external write.

## Common failure modes

- Importing contributor guidance into the application.
- Overwriting the application's `AGENTS.md` during skill synchronization.
- Presenting synthetic behavior as released MDK support.
