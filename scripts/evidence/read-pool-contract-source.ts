import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPoolSourceBundle, selectPoolSource } from "../lib/pool-source.ts";

const [contractId, fileOption, filePath, ...extra] = process.argv.slice(2);
if (
  !contractId ||
  extra.length > 0 ||
  (fileOption !== undefined && (fileOption !== "--file" || !filePath))
) {
  process.stderr.write(
    "Usage: node scripts/evidence/read-pool-contract-source.ts <contract-id> [--file <source-path>]\n",
  );
  process.exitCode = 2;
} else {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const bundle = await loadPoolSourceBundle(repositoryRoot, contractId);
  process.stdout.write(selectPoolSource(bundle, filePath));
}
