import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageNames = ["evm", "chains", "contracts", "core"] as const;

for (const packageName of packageNames) {
  const packageRoot = resolve(repositoryRoot, "packages", packageName);
  const manifest = parseManifest(await readFile(resolve(packageRoot, "package.json"), "utf8"));
  const files = await readdir(resolve(packageRoot, "dist"));
  if (!files.includes("index.js") || !files.includes("index.d.ts")) {
    throw new Error(`${packageName} is missing its built JavaScript or declaration entrypoint`);
  }
  if (JSON.stringify(manifest.exports).includes("/src/")) {
    throw new Error(`${packageName} export map leaks package source`);
  }
  for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
    const source = await readFile(resolve(packageRoot, "dist", file), "utf8");
    if (/from\s+["'][^"']*knowledge\//.test(source)) {
      throw new Error(`${packageName} built runtime imports repository knowledge from '${file}'`);
    }
  }
}

const contractData = await readFile(
  resolve(repositoryRoot, "packages/contracts/dist/data.generated.js"),
  "utf8",
);
if (/"stateMutability": "(?:nonpayable|payable)"/.test(contractData)) {
  throw new Error("Contracts built data contains a state-changing function ABI");
}

const coreFiles = await readdir(resolve(repositoryRoot, "packages/core/dist"));
for (const forbidden of [
  "client.js",
  "errors.js",
  "lifecycle.js",
  "model.generated.js",
  "validation.js",
]) {
  if (coreFiles.includes(forbidden))
    throw new Error(`Core build leaked internal proof '${forbidden}'`);
}

runNode(
  resolve(repositoryRoot, "examples/foundational-readonly"),
  [
    "const packages = await Promise.all([",
    "  import('@mezo-dev-kit/chains'),",
    "  import('@mezo-dev-kit/contracts'),",
    "  import('@mezo-dev-kit/core'),",
    "]);",
    "const expected = [",
    "  ['ChainRegistryError', 'createChainRegistry', 'getNetwork', 'isNetworkId', 'listNetworks'],",
    "  ['ContractRegistryError', 'createContractRegistry', 'isContractId', 'listContractIds', 'resolveContract'],",
    "  ['CoreReadError', 'createCoreReadClient', 'serializeCoreReadError'],",
    "];",
    "for (let index = 0; index < packages.length; index += 1) {",
    "  const actual = Object.keys(packages[index]).sort();",
    "  if (JSON.stringify(actual) !== JSON.stringify(expected[index])) process.exit(2);",
    "}",
  ].join("\n"),
  0,
  "declared built entrypoints",
);

for (const deepImport of [
  "@mezo-dev-kit/evm/address",
  "@mezo-dev-kit/chains/registry",
  "@mezo-dev-kit/contracts/data.generated",
  "@mezo-dev-kit/core/client",
]) {
  runNode(
    resolve(repositoryRoot, "examples/foundational-readonly"),
    `await import('${deepImport}');`,
    1,
    `undeclared deep import '${deepImport}'`,
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
}

runNode(
  resolve(repositoryRoot, "examples/foundational-readonly"),
  [
    "import assert from 'node:assert/strict';",
    "import { EvmValueError, parseRpcQuantity, toRpcQuantity, parseUnitsExact, formatUnitsExact, parseAddress, parseUserAddress, parseHash32 } from '@mezo-dev-kit/evm';",
    "assert.equal(parseRpcQuantity(toRpcQuantity(2n ** 256n)), 2n ** 256n);",
    "assert.equal(parseUnitsExact(formatUnitsExact(1234567n, 6), 6), 1234567n);",
    "assert.throws(() => parseRpcQuantity('0x00'), EvmValueError);",
    "assert.throws(() => parseUnitsExact('1.001', 2), { code: 'ExcessPrecision' });",
    "assert.equal(parseAddress('0x' + 'AB'.repeat(20)), '0x' + 'ab'.repeat(20));",
    "assert.equal(parseHash32('0x' + 'AB'.repeat(32)), '0x' + 'ab'.repeat(32));",
    "assert.throws(() => parseUserAddress('0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed'), { code: 'InvalidChecksum' });",
  ].join("\n"),
  0,
  "built EVM value contracts",
);

const temporaryRoot = await mkdtemp(join(tmpdir(), "mdk-missing-artifact-"));
try {
  const packageDirectory = resolve(temporaryRoot, "node_modules/@mezo-dev-kit/core");
  await mkdir(packageDirectory, { recursive: true });
  const coreManifest = await readFile(
    resolve(repositoryRoot, "packages/core/package.json"),
    "utf8",
  );
  await writeFile(resolve(packageDirectory, "package.json"), coreManifest, "utf8");
  runNode(
    temporaryRoot,
    "await import('@mezo-dev-kit/core');",
    1,
    "missing built artifact",
    "ERR_MODULE_NOT_FOUND",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write("Foundational built package boundaries passed.\n");

function parseManifest(text: string): Readonly<{ exports: unknown }> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || !("exports" in value)) {
    throw new Error("package manifest has no export map");
  }
  return value;
}

function runNode(
  workingDirectory: string,
  source: string,
  expectedStatus: number,
  label: string,
  expectedStderr?: string,
): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: workingDirectory,
    encoding: "utf8",
  });
  if (result.status !== expectedStatus) {
    throw new Error(`${label} returned ${String(result.status)}: ${result.stderr}`);
  }
  if (expectedStderr && !result.stderr.includes(expectedStderr)) {
    throw new Error(`${label} did not report ${expectedStderr}: ${result.stderr}`);
  }
}
