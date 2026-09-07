import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { display, object, objects, text, type JsonObject } from "./lib/json.ts";

const address = process.argv[2];
const apiBase = process.argv[3] ?? "https://api.explorer.mezo.org";
if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) {
  throw new Error(
    "usage: node scripts/reproduce-explorer-contract.ts <address> [explorer-api-base]",
  );
}

const response = await fetch(`${apiBase}/api/v2/smart-contracts/${address}`);
if (!response.ok)
  throw new Error(`explorer request failed: ${response.status} ${response.statusText}`);
const contract = object(await response.json(), "explorer response");
const primarySource = text(contract.source_code, "primary source");
const primaryPath = text(contract.file_path, "primary source path");

const directory = await mkdtemp(join(tmpdir(), "mdk-explorer-source-"));
const sources = [
  { file_path: primaryPath, source_code: primarySource },
  ...optionalObjects(contract.additional_sources, "additional sources"),
];

for (const source of sources) {
  const sourcePath = text(source.file_path, "explorer source path");
  const sourceCode = text(source.source_code, "explorer source contents");
  const path = resolve(directory, sourcePath);
  const relation = relative(directory, path);
  if (relation.startsWith("..") || relation === "") {
    throw new Error(`unsafe explorer source path: ${sourcePath}`);
  }
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, sourceCode);
}

const settings = optionalObject(contract.compiler_settings, "compiler settings");
const libraryLines: string[] = [];
for (const [path, librariesValue] of Object.entries(
  optionalObject(settings.libraries, "compiler libraries"),
)) {
  for (const [name, libraryAddress] of Object.entries(
    object(librariesValue, `compiler libraries ${path}`),
  )) {
    libraryLines.push(`  "${path}:${name}:${display(libraryAddress, "library address")}",`);
  }
}

const compilerVersion = text(contract.compiler_version, "compiler version")
  .replace(/^v/, "")
  .split("+")
  .at(0);
if (compilerVersion === undefined) throw new Error("compiler version is empty");
const evmVersion = settings.evmVersion ?? contract.evm_version;
const metadata = optionalObject(settings.metadata, "compiler metadata settings");
const optimizer = optionalObject(settings.optimizer, "optimizer settings");
const bytecodeHash =
  metadata.bytecodeHash === undefined
    ? "ipfs"
    : text(metadata.bytecodeHash, "metadata bytecode hash");
const appendCbor = metadata.appendCBOR !== false;
const useLiteralContent = metadata.useLiteralContent === true;
const foundryConfig = [
  "[profile.default]",
  'src = "."',
  'out = "out"',
  'cache_path = "cache"',
  `solc_version = "${compilerVersion}"`,
  `optimizer = ${optimizer.enabled === true}`,
  `optimizer_runs = ${Number(optimizer.runs ?? 200)}`,
  ...(typeof evmVersion === "string" && evmVersion !== "default"
    ? [`evm_version = "${evmVersion}"`]
    : []),
  `via_ir = ${Boolean(settings.viaIR)}`,
  `bytecode_hash = "${bytecodeHash}"`,
  `cbor_metadata = ${appendCbor}`,
  `use_literal_content = ${useLiteralContent}`,
  ...(libraryLines.length > 0 ? ["libraries = [", ...libraryLines, "]"] : []),
  "",
].join("\n");
await writeFile(join(directory, "foundry.toml"), foundryConfig);
await writeFile(join(directory, "explorer.json"), `${JSON.stringify(contract, null, 2)}\n`);

process.stdout.write(`${directory}\n`);
process.stdout.write(
  `${display(contract.name, "contract name")}|${primaryPath}|${compilerVersion}|${display(contract.is_fully_verified, "full verification flag")}|${display(contract.is_partially_verified, "partial verification flag")}\n`,
);

function optionalObject(value: unknown, label: string): JsonObject {
  return value === null || value === undefined ? {} : object(value, label);
}

function optionalObjects(value: unknown, label: string): JsonObject[] {
  return value === null || value === undefined ? [] : objects(value, label);
}
