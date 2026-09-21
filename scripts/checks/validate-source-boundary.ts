import { readFileSync } from "node:fs";

import {
  validateSourceHistory,
  validateSourceIndex,
  validateSourcePush,
} from "../lib/source-boundary.ts";

try {
  const args = process.argv.slice(2);
  let diagnostics: readonly string[];
  if (args.length === 1 && args[0] === "--pre-push") {
    diagnostics = validateSourcePush(process.cwd(), readFileSync(0, "utf8"));
  } else if (args.length === 0 || (args.length === 2 && args[0] === "--base")) {
    diagnostics = [
      ...validateSourceIndex(process.cwd()),
      ...(args[1] === undefined ? [] : validateSourceHistory(process.cwd(), "HEAD", args[1])),
    ];
  } else {
    throw new Error(
      "Usage: node scripts/checks/validate-source-boundary.ts [--base <ref> | --pre-push]",
    );
  }
  if (diagnostics.length > 0) {
    process.stderr.write(`Source boundary failed:\n${diagnostics.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Source boundary passed.\n");
  }
} catch (error) {
  process.stderr.write(
    `Source boundary could not be verified: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
