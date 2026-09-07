---
name: mdk-synthetic-maintenance
description: Maintain the fictional documentation fixture inside the disposable skill-authoring example. Use only for contributor-side fixture changes; do not distribute it to applications.
---

# Synthetic fixture maintenance

## Purpose

Keep the documentation-only synthetic fixture internally consistent without
claiming that it is canonical MDK or Mezo knowledge.

## Use when / do not use when

Use for contributor maintenance inside a disposable copy of the teaching
fixture. Do not use in an external application, against live systems, or as a
source of protocol facts.

## Required context

Read the current fixture task and inspect only the files selected by that task.
Treat all values as fictional.

## Procedure

1. Confirm the requested fixture outcome and allowed files.
2. Make the smallest internally consistent documentation change.
3. Preserve the synthetic names and contributor-only audience unless the task
   explicitly reviews an identity migration.
4. Report the exact diff without changing external state.

## Verification

Validate the disposable catalog and compare any materialized copy byte for
byte with this source directory.

## Stop conditions

Stop if the request introduces real protocol data, credentials, an external
mutation, consumer distribution, or a new dependency.

## Common failure modes

- Treating a fictional example as canonical evidence.
- Shipping this contributor procedure to an application.
- Editing a materialized discovery copy instead of this source.
