import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, scalar, text, values, type JsonObject } from "./lib/json.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const incentivesDirectory = join(repositoryRoot, "knowledge", "protocols", "incentives");
const explorerBase = "https://api.explorer.mezo.org";

const definitions: readonly (readonly [string, string, string, string])[] = [
  [
    "incentives.pools-voter",
    "0xa62060d57e04d6c799b58188dc654b85addd1465",
    "Voter",
    "fully-verified",
  ],
  [
    "incentives.ve-btc",
    "0x2a05272b526e3dc2e42b6b4d6e926e83de9be65c",
    "VeBTC",
    "partially-verified",
  ],
  [
    "incentives.boost-voter",
    "0xa696dc56522e41811d06bbda83c1a6d976637624",
    "BoostVoter",
    "fully-verified",
  ],
  [
    "incentives.ve-mezo",
    "0xa1acc19aa9f7010c0013d8f043aff63a0527dd5e",
    "VeMEZO",
    "partially-verified",
  ],
  [
    "incentives.factory-registry",
    "0x04b94f55780682478c8d8329368aaafd320f4d32",
    "FactoryRegistry",
    "fully-verified",
  ],
  [
    "incentives.mezo-minter",
    "0x66bff681611553b3204a226b2019ec621f39ffc3",
    "MEZOMinter",
    "fully-verified",
  ],
  [
    "incentives.mezo-rebase-distributor",
    "0x075108f275ed81c9cfc01065e6e50ceea81d6363",
    "RewardsDistributor",
    "fully-verified",
  ],
  [
    "incentives.mezo-chain-splitter",
    "0x5c6ef634e279a77d64e21d24b1a1bb4a5e59c5da",
    "MEZOChainSplitter",
    "fully-verified",
  ],
  [
    "incentives.mezo-ecosystem-splitter",
    "0xe9e697d49d47c7042e768177f42d5789666d99fa",
    "MEZOEcosystemSplitter",
    "fully-verified",
  ],
  [
    "incentives.validators-voter",
    "0xd96f2ec7750573bcac3ff49b1ac4f03faee2f157",
    "ValidatorsVoter",
    "fully-verified",
  ],
  [
    "incentives.third-party-voter",
    "0x8d696ae943b97ff36449014e4400a9560d1664dc",
    "ThirdPartyVoter",
    "fully-verified",
  ],
  [
    "incentives.chain-splitter-epoch-governor",
    "0x7f8c3a8877368d6a3c727ca18661ec1d681f4365",
    "EpochGovernor",
    "fully-verified",
  ],
  [
    "incentives.ecosystem-splitter-epoch-governor",
    "0xd60f5f641e68a0e2c9bab29e444b22507a0f8ecf",
    "EpochGovernor",
    "fully-verified",
  ],
];

function fail(message: string): never {
  throw new Error(message);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Hex(hex: string): string {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail("invalid hexadecimal bytecode");
  }
  return sha256(Buffer.from(normalized, "hex"));
}

function semanticAbiDigest(abi: unknown[]): string {
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

async function loadJson(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}

async function fetchContract(
  address: string,
): Promise<{ url: string; raw: string; contract: JsonObject }> {
  const url = `${explorerBase}/api/v2/smart-contracts/${address}`;
  const response = await fetch(url);
  const raw = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return { url, raw, contract: object(parseJson(raw, url), url) };
}

const reproduction = await loadJson(
  join(incentivesDirectory, "evidence", "source-reproduction-2026-08-18.json"),
);
const reproductionByAddress = new Map<string, JsonObject>(
  objects(reproduction.records, "reproduction records").map((record): [string, JsonObject] => [
    text(record.address, "reproduction address"),
    record,
  ]),
);
const summaries: JsonObject[] = [];

for (const [contractId, address, expectedName, expectedVerification] of definitions) {
  const { url, raw, contract } = await fetchContract(address);
  if (contract.name !== expectedName) fail(`${contractId} explorer name drifted`);
  const actualVerification = contract.is_fully_verified
    ? "fully-verified"
    : contract.is_partially_verified
      ? "partially-verified"
      : "unverified";
  if (actualVerification !== expectedVerification) fail(`${contractId} verification label drifted`);
  const abi = values(contract.abi, `${contractId} ABI`);
  if (abi.length === 0) fail(`${contractId} ABI is missing`);

  const prior = reproductionByAddress.get(address);
  const deployedBytecodeSha256 = sha256Hex(
    text(contract.deployed_bytecode, `${contractId} deployed bytecode`),
  );
  const priorRuntime = prior === undefined ? undefined : object(prior.runtime, "prior runtime");
  if (
    priorRuntime?.explorerFullSha256 &&
    priorRuntime.explorerFullSha256 !== deployedBytecodeSha256
  ) {
    fail(`${contractId} deployed bytecode differs from the accepted reproduction evidence`);
  }

  const output = `${JSON.stringify(abi, null, 2)}\n`;
  const outputPath = join(
    contractsDirectory,
    "artifacts",
    "abis",
    "incentives",
    `${contractBasename(contractId)}.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");

  const sourceBundle = {
    filePath: scalar(contract.file_path, "source file path"),
    sourceCode: scalar(contract.source_code, "source code"),
    additionalSources: optionalObjects(contract.additional_sources, "additional sources").sort(
      (left, right) => sourcePath(left).localeCompare(sourcePath(right)),
    ),
  };
  summaries.push({
    contractId,
    address,
    name: scalar(contract.name, "contract name"),
    url,
    retrievedAt: new Date().toISOString(),
    responseSha256: sha256(raw),
    explorerVerification: {
      isVerified: scalar(contract.is_verified, "verification flag"),
      isFullyVerified: scalar(contract.is_fully_verified, "full verification flag"),
      isPartiallyVerified: scalar(contract.is_partially_verified, "partial verification flag"),
    },
    compilerVersion: scalar(contract.compiler_version, "compiler version"),
    compilerSettingsSha256: sha256(JSON.stringify(canonicalize(contract.compiler_settings ?? {}))),
    librariesSha256: sha256(JSON.stringify(canonicalize(contract.external_libraries ?? []))),
    sourceBundleSha256: sha256(JSON.stringify(canonicalize(sourceBundle))),
    creationBytecodeSha256: sha256Hex(
      text(contract.creation_bytecode, `${contractId} creation bytecode`),
    ),
    deployedBytecodeSha256,
    entryCount: abi.length,
    fileSha256: sha256(output),
    abiSha256: sha256(JSON.stringify(canonicalize(abi))),
    abiSemanticSha256: semanticAbiDigest(abi),
    artifactPath: `artifacts/abis/incentives/${contractBasename(contractId)}.json`,
  });
}

process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);

function optionalObjects(value: unknown, label: string): JsonObject[] {
  return value === null || value === undefined ? [] : objects(value, label);
}

function sourcePath(source: JsonObject): string {
  const value = source.file_path ?? source.file_name ?? "";
  return text(value, "additional source path");
}

function contractBasename(contractId: string): string {
  const basename = contractId.split(".").at(-1);
  if (basename === undefined) throw new Error(`contract ID '${contractId}' has no basename`);
  return basename;
}
