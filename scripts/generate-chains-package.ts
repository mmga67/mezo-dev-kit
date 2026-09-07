import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertGeneratedPackageCurrent,
  buildChainsPackageFile,
} from "./lib/foundational-package-generation.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "packages/chains/src/data.generated.ts");
assertInsidePackage(outputPath, "chains");
const checkOnly = parseArguments(process.argv.slice(2));
const generated = await buildChainsPackageFile(repositoryRoot);

if (checkOnly) {
  const current = await readFile(outputPath, "utf8").catch((error: unknown) => {
    throw new Error("Chains generated data is missing; run the generator", { cause: error });
  });
  assertGeneratedPackageCurrent(current, generated, "Chains");
} else {
  await writeFile(outputPath, generated.output, "utf8");
}
process.stdout.write(`Chains package data is current (${generated.digest}).\n`);

function parseArguments(arguments_: readonly string[]): boolean {
  const unknown = arguments_.filter((argument) => argument !== "--check");
  if (unknown.length > 0) throw new Error(`unknown argument '${unknown[0]}'`);
  return arguments_.includes("--check");
}

function assertInsidePackage(path: string, packageName: string): void {
  const packageRoot = resolve(repositoryRoot, "packages", packageName);
  const relation = relative(packageRoot, path);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error(`${packageName} generated output escapes its package`);
  }
}
