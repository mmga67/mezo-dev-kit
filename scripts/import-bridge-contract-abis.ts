import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [nttRepository, mezodRepository, nativeBridgeCompilerOutput] = process.argv.slice(2);
if (!nttRepository || !mezodRepository || !nativeBridgeCompilerOutput) {
  throw new Error(
    "usage: node scripts/import-bridge-contract-abis.ts " +
      "<ntt-repository> <mezod-repository> <native-bridge-compiler-output>",
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputDirectory = join(
  repositoryRoot,
  "knowledge",
  "contracts",
  "artifacts",
  "abis",
  "bridge",
);

const managerFactoryPath = "evm/ts/src/ethers-contracts/1_1_0/factories/NttManager__factory.ts";
const transceiverFactoryPath =
  "evm/ts/src/ethers-contracts/1_1_0/factories/WormholeTransceiver__factory.ts";
const managerFactory = await readFile(join(nttRepository, managerFactoryPath), "utf8");
const transceiverFactory = await readFile(join(nttRepository, transceiverFactoryPath), "utf8");
assertSha256(
  managerFactory,
  "11ecedfda4242865639467c005fdfdcae2a417947b182fbc4a8e9b3759b33044",
  managerFactoryPath,
);
assertSha256(
  transceiverFactory,
  "c15603a88afba883e395fed535a654973c35dbccbefc1783de66be27740421a4",
  transceiverFactoryPath,
);
const managerAbi = extractTypechainAbi(managerFactory, managerFactoryPath);
const transceiverAbi = extractTypechainAbi(transceiverFactory, transceiverFactoryPath);
const precompileAbiBytes = await readFile(
  join(mezodRepository, "precompile", "assetsbridge", "abi.json"),
  "utf8",
);
assertSha256(
  precompileAbiBytes,
  "24f8a28498c9e9f7bf1ed3b1d2ac70b0e72d3269ddc7fbe4f798bea6864bb6e1",
  "precompile/assetsbridge/abi.json",
);
const precompileAbi = nonEmptyArray(
  JSON.parse(precompileAbiBytes) as unknown,
  "Assets Bridge precompile",
);
const compilerOutput = object(
  JSON.parse(await readFile(nativeBridgeCompilerOutput, "utf8")) as unknown,
  "compiler output",
);
const contracts = object(compilerOutput.contracts, "compiler output contracts");
const sourceContracts = object(
  contracts["contracts/MezoBridge.sol"],
  "MezoBridge source contracts",
);
const nativeBridge = object(sourceContracts.MezoBridge, "MezoBridge compiler output");
const nativeBridgeAbi = nonEmptyArray(nativeBridge.abi, "native Mezo bridge");

await mkdir(outputDirectory, { recursive: true });
const outputs: [string, unknown[]][] = [
  ["musd-ntt-manager.json", managerAbi],
  ["musd-wormhole-transceiver.json", transceiverAbi],
  ["native-assets-precompile.json", precompileAbi],
  ["native-mezo-bridge.json", nativeBridgeAbi],
];
for (const [fileName, abi] of outputs) {
  await writeFile(join(outputDirectory, fileName), `${JSON.stringify(abi, null, 2)}\n`, "utf8");
}

process.stdout.write(
  `Imported bridge ABIs: manager ${managerAbi.length}, transceiver ${transceiverAbi.length}, ` +
    `precompile ${precompileAbi.length}, native portal ${nativeBridgeAbi.length}.\n`,
);

function extractTypechainAbi(source: string, label: string): unknown[] {
  const prefix = "const _abi = ";
  const start = source.indexOf(prefix);
  const terminator = " as const;";
  const end = source.indexOf(terminator, start + prefix.length);
  if (start < 0 || end < 0) throw new Error(`${label} does not contain a TypeChain ABI literal`);
  const literal = source.slice(start + prefix.length, end);
  const json = literal
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,(\s*[}\]])/g, "$1");
  return nonEmptyArray(JSON.parse(json) as unknown, label);
}

function assertSha256(value: string, expected: string, label: string): void {
  const actual = createHash("sha256").update(value).digest("hex");
  if (actual !== expected) throw new Error(`${label} digest ${actual} differs from ${expected}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} ABI is empty`);
  return value as unknown[];
}
