import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifestVersion } from "./lib/manifest-version.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = validateManifestVersion(
  await readFile(join(repositoryRoot, "docs", "manifest"), "utf8"),
  await readFile(join(repositoryRoot, "docs", "manifest-changelog.md"), "utf8"),
);

process.stdout.write(
  `Validated manifest v${result.version} (${result.released}) against ${result.entries} improvement-log entries.\n`,
);
