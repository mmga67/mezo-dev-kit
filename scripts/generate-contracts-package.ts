import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertGeneratedPackageCurrent,
  buildContractsPackageFile,
} from "./lib/foundational-package-generation.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "packages/contracts/src/data.generated.ts");
assertInsidePackage(outputPath, "contracts");
const checkOnly = parseArguments(process.argv.slice(2));
const generated = await buildContractsPackageFile(repositoryRoot);

if (checkOnly) {
  const current = await readFile(outputPath, "utf8").catch((error: unknown) => {
    throw new Error("Contracts generated data is missing; run the generator", { cause: error });
  });
  assertGeneratedPackageCurrent(current, generated, "Contracts");
} else {
  await writeFile(outputPath, generated.output, "utf8");
}
process.stdout.write(`Contracts package data is current (${generated.digest}).\n`);

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
