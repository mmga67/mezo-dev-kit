import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, text, texts, values, type JsonObject } from "./lib/json.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const rpcUrl = "https://mezo-mainnet.boar.network";
const explorerApiUrl = "https://api.explorer.mezo.org";
const evidenceId = "contract-incentives-probes-2026-08-21";
const sourceId = "incentives-explorer-executable-reproductions";
const evidenceBlockNumber = 11291582;
const evidenceBlockTag = `0x${evidenceBlockNumber.toString(16)}`;
const expectedBlockHash = "0x014b488982ad103b19fd36191ab673027187280739f21c4a06e64d24dc4f5f49";
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const upgradedTopic = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";

const definitions = [
  {
    contractId: "incentives.pools-voter",
    contractName: "PoolsVoter",
    sourceContractName: "Voter",
    domains: ["incentives", "gauges", "voting"],
    address: "0x48233ccc97b87ba93bca212cbee48e3210211f03",
    implementation: "0xa62060d57e04d6c799b58188dc654b85addd1465",
    abiFile: "pools-voter.json",
    expectedCompilerVersion: "v0.8.24+commit.e11b9ed9",
    expectedDeployedBytecodeSha256:
      "4f5949739ad463e691414ce46bb2f9c9bff2cfaab00ec123c2c81a319d2c2b42",
    creationExecutableSha256: "5de583b8d005130d185d0361062ade1290adb0c4f16985841bf5812d46d3f9b2",
    runtimeExecutableSha256: "9269778e57299bdc4b83dfbff23fde9e63095b32baf361ebbc7d18491eb1e487",
    immutableSubstitutions: 4,
  },
  {
    contractId: "incentives.ve-btc",
    contractName: "veBTC",
    sourceContractName: "VeBTC",
    domains: ["incentives", "locks", "ve-btc"],
    address: "0x3d4b1b884a7a1e59fe8589a3296ec8f8cbb6f279",
    implementation: "0x2a05272b526e3dc2e42b6b4d6e926e83de9be65c",
    abiFile: "ve-btc.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "4324989e6a7866455c62a59e289bf41155a8c9f72ba7845cdbd4c1854d4cd5f7",
    creationExecutableSha256: "0043eae26f8ce5f1889be837290febed6214dde5fbb8e75684ea951078b74fce",
    runtimeExecutableSha256: "2c30b0960ce10cec8022632974abf0d9dbbd6ce3826fab1a3a92878f741f7cfb",
    immutableSubstitutions: 0,
  },
  {
    contractId: "incentives.boost-voter",
    contractName: "BoostVoter",
    sourceContractName: "BoostVoter",
    domains: ["incentives", "boost", "voting"],
    address: "0x2ba614a598cffa5a19d683cdca97bac3a49313d1",
    implementation: "0xa696dc56522e41811d06bbda83c1a6d976637624",
    abiFile: "boost-voter.json",
    expectedCompilerVersion: "v0.8.24+commit.e11b9ed9",
    expectedDeployedBytecodeSha256:
      "9c84d580cbcacca181b716d42ce17c455d23bbb81126620f864c8699d30a97cc",
    creationExecutableSha256: "7f8cf126797c2856e254613b372b11ed8f2e5717915a08831f46eec51a8a230c",
    runtimeExecutableSha256: "77e5d5f2a73599747ba8a8eca0cede4d75702a2a806eba026fdbfe421cfccb8c",
    immutableSubstitutions: 4,
  },
  {
    contractId: "incentives.ve-mezo",
    contractName: "veMEZO",
    sourceContractName: "VeMEZO",
    domains: ["incentives", "locks", "ve-mezo"],
    address: "0xb90fdad3dfd180458d62cc6acedc983d78e20122",
    implementation: "0xa1acc19aa9f7010c0013d8f043aff63a0527dd5e",
    abiFile: "ve-mezo.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "7966f3b011232a190deb9fb48c8b9a0190818eedfd8b444add50e8f68e90b5e1",
    creationExecutableSha256: "c6a293e6da455b482a250d2ed44b94a453f70abcdc3a0f5146b25df673514a09",
    runtimeExecutableSha256: "06160bcb391ecedf7404d1e93061db8fcdb51f71216a2676d1e672a20e735bbf",
    immutableSubstitutions: 0,
  },
  {
    contractId: "incentives.factory-registry",
    contractName: "FactoryRegistry",
    sourceContractName: "FactoryRegistry",
    domains: ["incentives", "gauges"],
    address: "0x04b94f55780682478c8d8329368aaafd320f4d32",
    implementation: null,
    abiFile: "factory-registry.json",
    expectedCompilerVersion: "v0.8.24+commit.e11b9ed9",
    expectedDeployedBytecodeSha256:
      "95c7373c5bbe6324b5ecad865a8cfec567c7052010ba8928170a1d7f790b1247",
    creationExecutableSha256: "055ab5f6d1c6ca0eeb3125d40578b9aa382d3a77f22b23855b72702e58807e35",
    runtimeExecutableSha256: "e9a979c3bb0a0e4ca2741516733df1e5d31c6744901b38dfabfb8a61b73d26cc",
    immutableSubstitutions: 3,
  },
  {
    contractId: "incentives.mezo-minter",
    contractName: "MEZO Minter",
    sourceContractName: "MEZOMinter",
    domains: ["incentives", "emissions", "supply"],
    address: "0x66bff681611553b3204a226b2019ec621f39ffc3",
    implementation: null,
    abiFile: "mezo-minter.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "3cc47d2238ddf7b94681c22d1033c66c2f46f1dd8d729adc720338bfb658c1cf",
    creationExecutableSha256: "a9a9bf54b26c83b35c640e0d5156a69c70d9573598761f65f61454e0cf0a7a0f",
    runtimeExecutableSha256: "6079337d174a673afc49463664c9c2368ecee84dcc8f323de0075ade52514b5f",
    immutableSubstitutions: 14,
  },
  {
    contractId: "incentives.mezo-rebase-distributor",
    contractName: "MEZO Rebase Distributor",
    sourceContractName: "RewardsDistributor",
    domains: ["incentives", "emissions", "rebases"],
    address: "0x075108f275ed81c9cfc01065e6e50ceea81d6363",
    implementation: null,
    abiFile: "mezo-rebase-distributor.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "4ab624cec4fd173193a46c9841f008eb5c0ef8db8bc0f34c083c85a0dab6cf79",
    creationExecutableSha256: "4a554ca88ce111e38d1a2cb8339eca0f7af459ea806425ba8c55fccfee84b048",
    runtimeExecutableSha256: "67436e7247e7398a84d4e9b4c9390236c759b71dac8e6be652bc2d8478c574e7",
    immutableSubstitutions: 14,
  },
  {
    contractId: "incentives.mezo-chain-splitter",
    contractName: "MEZO Chain Splitter",
    sourceContractName: "MEZOChainSplitter",
    domains: ["incentives", "emissions", "splitters"],
    address: "0x5c6ef634e279a77d64e21d24b1a1bb4a5e59c5da",
    implementation: null,
    abiFile: "mezo-chain-splitter.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "c6527728f961407c357e51fb5fb2e710167e8b8a1669a9b00f4845e382af61ce",
    creationExecutableSha256: "ba62d4073589e791c0a9722c13b2a2320333e134ba5fe0c42adba99e33ee47bf",
    runtimeExecutableSha256: "0f6a1c95a88e8caeab5fa08deff94550af8fbffec37c170a34acd8042d3fc7c8",
    immutableSubstitutions: 13,
  },
  {
    contractId: "incentives.mezo-ecosystem-splitter",
    contractName: "MEZO Ecosystem Splitter",
    sourceContractName: "MEZOEcosystemSplitter",
    domains: ["incentives", "emissions", "splitters"],
    address: "0xe9e697d49d47c7042e768177f42d5789666d99fa",
    implementation: null,
    abiFile: "mezo-ecosystem-splitter.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "8cbbef3fbaf658efcee1dae99000ef4d7b9966a671a3ab187b9dca2e724e6919",
    creationExecutableSha256: "2b0d1926102b6dcccc1c18dcf3dc81667dcdf79b422abf6455cf32286c3ec61b",
    runtimeExecutableSha256: "a04831547aba96ff9fb907d8ea646fcede1afaec4534c4425881f11136665eaf",
    immutableSubstitutions: 16,
  },
  {
    contractId: "incentives.validators-voter",
    contractName: "Validators Voter",
    sourceContractName: "ValidatorsVoter",
    domains: ["incentives", "emissions", "validators"],
    address: "0xe99a9ad5ed26bd30e4db25397f378817e9b9515a",
    implementation: "0xd96f2ec7750573bcac3ff49b1ac4f03faee2f157",
    abiFile: "validators-voter.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "28669ac5b44a1ce68f011b4f7c80a1160cc059693916d52732bfc8a3ff594c6c",
    creationExecutableSha256: "d134c18460278f3a995d52937c3adc989cf90669afa498d90dc5c39246fa9151",
    runtimeExecutableSha256: "183e98c1fd3df4ae3767ada208d897cff7998c52eac869e11ca5ad436eb63ce0",
    immutableSubstitutions: 4,
  },
  {
    contractId: "incentives.third-party-voter",
    contractName: "Third Party Voter",
    sourceContractName: "ThirdPartyVoter",
    domains: ["incentives", "emissions", "third-party"],
    address: "0x2e6d2f2cacc1d24f9f9358030674eb307397a6eb",
    implementation: "0x8d696ae943b97ff36449014e4400a9560d1664dc",
    abiFile: "third-party-voter.json",
    expectedCompilerVersion: "v0.8.24+commit.e11b9ed9",
    expectedDeployedBytecodeSha256:
      "28cb1826e170088b852928606370599fd9e26605a3fd4c286d7e459a57dd9992",
    creationExecutableSha256: "102663ba7000e81aebf579be7997455f9226263c7b0f4390c2d8a6543bbb040d",
    runtimeExecutableSha256: "7aac4c2d5d45c0a81605bfa16b9eb1d9b2518189052b2f0ee3bc151484930b01",
    immutableSubstitutions: 4,
  },
  {
    contractId: "incentives.chain-splitter-epoch-governor",
    contractName: "Chain Splitter Epoch Governor",
    sourceContractName: "EpochGovernor",
    domains: ["incentives", "emissions", "governance"],
    address: "0x7f8c3a8877368d6a3c727ca18661ec1d681f4365",
    implementation: null,
    abiFile: "chain-splitter-epoch-governor.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "7b7efc7ca35b5296c70a79d52842f87093419aa91db6175c807c0a79aec0dee9",
    creationExecutableSha256: "f6cf1adca5eca9484978122c442ad1a7ba056d4d6ead11e6afb60b6cae5e3844",
    runtimeExecutableSha256: "220a79f19d9d1f9b375a2d1dbcb023164a61c6367d6ec1b173e7ba79cdaf970d",
    immutableSubstitutions: 12,
  },
  {
    contractId: "incentives.ecosystem-splitter-epoch-governor",
    contractName: "Ecosystem Splitter Epoch Governor",
    sourceContractName: "EpochGovernor",
    domains: ["incentives", "emissions", "governance"],
    address: "0xd60f5f641e68a0e2c9bab29e444b22507a0f8ecf",
    implementation: null,
    abiFile: "ecosystem-splitter-epoch-governor.json",
    expectedCompilerVersion: "v0.8.33+commit.64118f21",
    expectedDeployedBytecodeSha256:
      "8d737f2aa09b597b4ab022bfd2cc29b452840f7107c85293afe83b13b2269f44",
    creationExecutableSha256: "f6cf1adca5eca9484978122c442ad1a7ba056d4d6ead11e6afb60b6cae5e3844",
    runtimeExecutableSha256: "7d68605edb36cc89815420ce4851e11892ee539886b5f674178f92cf43528758",
    immutableSubstitutions: 12,
  },
] as const;

interface Coordinate extends JsonObject {
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  blockEvidenceMethod: string;
  transactionHash?: string;
  logIndex?: number;
}

interface HistoryEntry extends JsonObject {
  implementationAddress: string;
  effectiveFrom: Coordinate;
  effectiveUntilExclusive: Coordinate | null;
}

function fail(message: string): never {
  throw new Error(message);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Hex(hex: unknown): string {
  const normalized = text(hex, "hex bytes").replace(/^0x/, "");
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) fail("invalid hex");
  return sha256(Buffer.from(normalized, "hex"));
}

function semanticAbiDigest(abi: readonly unknown[]): string {
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

function normalizeAddress(value: unknown): string {
  const source = text(value, "address");
  const match = /[a-f0-9]{40}$/.exec(source.toLowerCase());
  if (!match) fail(`invalid address '${source}'`);
  return `0x${match[0]}`;
}

function normalizeHash(value: unknown): string {
  const source = text(value, "hash");
  const normalized = source.toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) fail(`invalid hash '${source}'`);
  return normalized;
}

function hexNumber(value: string): number {
  const result = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(result)) fail(`unsafe hex number '${value}'`);
  return result;
}

async function loadJson(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(
  url: string,
  options?: RequestInit,
): Promise<{ raw: string; value: JsonObject }> {
  const response = await fetch(url, options);
  const raw = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
  return { raw, value: object(parseJson(raw, url), url) };
}

let rpcId = 0;
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const { value } = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (value.error) fail(`${method} failed: ${JSON.stringify(value.error)}`);
  return value.result;
}

async function blockAt(blockNumber: number): Promise<Coordinate> {
  const block = object(
    await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]),
    `block ${blockNumber}`,
  );
  return {
    blockNumber,
    blockHash: normalizeHash(block.hash),
    blockTimestamp: new Date(
      hexNumber(text(block.timestamp, "block timestamp")) * 1000,
    ).toISOString(),
    blockEvidenceMethod: "eth_getBlockByNumber",
  };
}

async function successfulTransaction(transactionHash: string): Promise<JsonObject> {
  const { value } = await fetchJson(`${explorerApiUrl}/api/v2/transactions/${transactionHash}`);
  if (value.status !== "ok") fail(`${transactionHash} did not succeed`);
  return value;
}

async function upgradeHistory(address: string): Promise<HistoryEntry[]> {
  const query = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    address,
    topic0: upgradedTopic,
    fromBlock: "0",
    toBlock: String(evidenceBlockNumber),
  });
  const { value } = await fetchJson(`${explorerApiUrl}/api?${query.toString()}`);
  const events = Array.isArray(value.result) ? objects(value.result, "upgrade events") : [];
  if (value.message !== "OK" || events.length === 0) {
    fail(`${address} has no upgrade history`);
  }
  const history: HistoryEntry[] = [];
  for (const event of events) {
    const coordinate = await blockAt(hexNumber(text(event.blockNumber, "upgrade block number")));
    await successfulTransaction(normalizeHash(event.transactionHash));
    const eventTopics = values(event.topics, "upgrade event topics");
    history.push({
      implementationAddress: normalizeAddress(eventTopics[1]),
      effectiveFrom: {
        ...coordinate,
        transactionHash: normalizeHash(event.transactionHash),
        logIndex: hexNumber(text(event.logIndex, "upgrade log index")),
      },
      effectiveUntilExclusive: null,
    });
  }
  history.sort(
    (left, right) =>
      left.effectiveFrom.blockNumber - right.effectiveFrom.blockNumber ||
      (left.effectiveFrom.logIndex ?? 0) - (right.effectiveFrom.logIndex ?? 0),
  );
  for (let index = 0; index < history.length - 1; index += 1) {
    const current = history[index] ?? fail(`upgrade history entry ${index} is missing`);
    const next = history[index + 1] ?? fail(`upgrade history entry ${index + 1} is missing`);
    current.effectiveUntilExclusive = next.effectiveFrom;
  }
  return history;
}

function explorerSummary(
  contract: JsonObject,
  deployedBytecodeSha256: string,
  abiSemanticSha256: string,
): JsonObject {
  const abi = values(contract.abi, "explorer ABI");
  return {
    name: contract.name,
    filePath: contract.file_path,
    isVerified: contract.is_verified,
    isFullyVerified: contract.is_fully_verified,
    isPartiallyVerified: contract.is_partially_verified,
    verifiedAt: contract.verified_at,
    compilerVersion: contract.compiler_version,
    licenseType: contract.license_type,
    proxyType: contract.proxy_type,
    abiEntries: abi.length,
    abiSemanticSha256,
    deployedBytecodeSha256,
  };
}

function upsert(records: JsonObject[], additions: JsonObject[], key = "id"): JsonObject[] {
  const additionKeys = new Set(additions.map((record) => record[key]));
  return [...records.filter((record) => !additionKeys.has(record[key])), ...additions];
}

const startedAt = new Date().toISOString();
const chainId = hexNumber(text(await rpc("eth_chainId", []), "chain ID"));
if (chainId !== 31612) fail(`RPC returned chain ${chainId}`);
const snapshotBlock = await blockAt(evidenceBlockNumber);
if (snapshotBlock.blockHash !== expectedBlockHash) fail("fixed evidence block hash drifted");

const abiRecords: JsonObject[] = [];
const deploymentRecords: JsonObject[] = [];
const observations: JsonObject[] = [];
const sourceArtifacts: JsonObject[] = [];

for (const definition of definitions) {
  const activeAddress = definition.implementation ?? definition.address;
  const endpointPath = `api/v2/smart-contracts/${activeAddress}`;
  const { raw: explorerRaw, value: explorer } = await fetchJson(
    `${explorerApiUrl}/${endpointPath}`,
  );
  if (explorer.name !== definition.sourceContractName)
    fail(`${definition.contractId} source name drifted`);
  if (explorer.compiler_version !== definition.expectedCompilerVersion) {
    fail(`${definition.contractId} compiler version drifted`);
  }
  const deployedBytecodeSha256 = sha256Hex(explorer.deployed_bytecode);
  if (deployedBytecodeSha256 !== definition.expectedDeployedBytecodeSha256) {
    fail(`${definition.contractId} explorer bytecode drifted`);
  }

  const abiPath = join(contractsDirectory, "artifacts", "abis", "incentives", definition.abiFile);
  const abiBytes = await readFile(abiPath);
  const abi = values(parseJson(abiBytes.toString("utf8"), abiPath), `${definition.contractId} ABI`);
  const abiSemanticSha256 = semanticAbiDigest(abi);
  if (abiSemanticSha256 !== semanticAbiDigest(values(explorer.abi, "explorer ABI")))
    fail(`${definition.contractId} ABI drifted`);
  const sourceBundleSha256 = sha256(
    JSON.stringify(
      canonicalize({
        filePath: explorer.file_path,
        sourceCode: explorer.source_code,
        additionalSources: objects(
          explorer.additional_sources ?? [],
          "additional explorer sources",
        ).sort((left, right) =>
          text(left.file_path ?? left.file_name ?? "", "additional source path").localeCompare(
            text(right.file_path ?? right.file_name ?? "", "additional source path"),
          ),
        ),
      }),
    ),
  );
  const compilerSettingsSha256 = sha256(
    JSON.stringify(canonicalize(explorer.compiler_settings ?? {})),
  );
  const librariesSha256 = sha256(JSON.stringify(canonicalize(explorer.external_libraries ?? [])));
  const responseSha256 = sha256(explorerRaw);
  sourceArtifacts.push({ sourceId, path: endpointPath, sha256: responseSha256 });

  const observationId = `observe-${definition.contractId.replaceAll(".", "-")}-mezo-mainnet`;
  const deploymentId = `${definition.contractId}@mezo-mainnet`;
  const provenanceEvidence = {
    reproduction: {
      explorerVerification: {
        isVerified: explorer.is_verified,
        isFullyVerified: explorer.is_fully_verified,
        isPartiallyVerified: explorer.is_partially_verified,
      },
      sourceBundleSha256,
      compilerVersion: explorer.compiler_version,
      compilerSettingsSha256,
      librariesSha256,
      buildProcedure:
        "Fetch the recorded explorer source bundle, generate an isolated Foundry project with scripts/reproduce-explorer-contract.ts, run forge build with the exact compiler/settings, then compare creation/runtime executables and ABI semantics with scripts/compare-explorer-build.ts.",
      creationExecutableMatch: true,
      runtimeExecutableMatch: true,
      fullBytecodeDifference: `Creation/runtime executables match exactly after ${definition.immutableSubstitutions} recorded runtime immutable substitution(s); full bytecode differs only in Solidity metadata and expected immutable placeholders before substitution.`,
      abiDerivedFromExactBuild: true,
      activationHistoryReference: {
        moduleId: "contracts",
        resourceId: evidenceId,
        recordId: observationId,
      },
    },
  };

  let proxy = null;
  let deploymentFrom;
  let currentCodeFrom;
  let addressCodeSha256;
  let implementationCodeSha256 = null;
  let proxyOrDirectExplorer = explorer;
  if (definition.implementation) {
    const history = await upgradeHistory(definition.address);
    const latestHistory = history.at(-1) ?? fail(`${definition.contractId} history is empty`);
    const firstHistory = history[0] ?? fail(`${definition.contractId} history is empty`);
    if (latestHistory.implementationAddress !== definition.implementation) {
      fail(`${definition.contractId} current upgrade history differs`);
    }
    const implementationStorage = normalizeAddress(
      await rpc("eth_getStorageAt", [definition.address, implementationSlot, evidenceBlockTag]),
    );
    if (implementationStorage !== definition.implementation)
      fail(`${definition.contractId} slot differs`);
    const adminAddress = normalizeAddress(
      await rpc("eth_getStorageAt", [definition.address, adminSlot, evidenceBlockTag]),
    );
    addressCodeSha256 = sha256Hex(await rpc("eth_getCode", [definition.address, evidenceBlockTag]));
    implementationCodeSha256 = sha256Hex(
      await rpc("eth_getCode", [definition.implementation, evidenceBlockTag]),
    );
    if (implementationCodeSha256 !== deployedBytecodeSha256)
      fail(`${definition.contractId} RPC bytecode differs`);
    proxy = {
      standard: "eip-1967-transparent",
      implementationSlot,
      adminSlot,
      adminAddress,
      currentImplementationAddress: definition.implementation,
      implementationHistory: history,
    };
    deploymentFrom = firstHistory.effectiveFrom;
    currentCodeFrom = latestHistory.effectiveFrom;
    proxyOrDirectExplorer = (
      await fetchJson(`${explorerApiUrl}/api/v2/smart-contracts/${definition.address}`)
    ).value;
  } else {
    const addressRecord = (
      await fetchJson(`${explorerApiUrl}/api/v2/addresses/${definition.address}`)
    ).value;
    const transactionHash = normalizeHash(
      addressRecord.creation_transaction_hash ?? addressRecord.creation_tx_hash,
    );
    const transaction = await successfulTransaction(transactionHash);
    const activationBlock = await blockAt(
      Number.parseInt(text(transaction.block, "activation block"), 10),
    );
    deploymentFrom = { ...activationBlock, transactionHash };
    currentCodeFrom = deploymentFrom;
    addressCodeSha256 = sha256Hex(await rpc("eth_getCode", [definition.address, evidenceBlockTag]));
    if (addressCodeSha256 !== deployedBytecodeSha256)
      fail(`${definition.contractId} RPC bytecode differs`);
  }

  const activeSummary = explorerSummary(explorer, deployedBytecodeSha256, abiSemanticSha256);
  const proxyOrDirectSummary = explorerSummary(
    proxyOrDirectExplorer,
    sha256Hex(proxyOrDirectExplorer.deployed_bytecode),
    semanticAbiDigest(values(proxyOrDirectExplorer.abi, "proxy/direct explorer ABI")),
  );
  observations.push({
    id: observationId,
    deploymentId,
    networkId: "mezo-mainnet",
    observedAt: startedAt,
    observationBlock: {
      number: evidenceBlockNumber,
      hash: expectedBlockHash,
      timestamp: snapshotBlock.blockTimestamp,
    },
    methods: [
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      ...(proxy ? ["eth_getStorageAt", "official explorer Upgraded logs"] : []),
      "official explorer address and transaction metadata",
      "official explorer smart-contract source/ABI",
      "isolated exact-compiler Foundry reproduction",
    ],
    activation: deploymentFrom,
    runtime: {
      addressCodeSha256,
      implementationCodeSha256,
      artifactBytecodeComparison: {
        creationExecutableExact: true,
        runtimeExecutableExactAfterImmutableSubstitution: true,
        immutableSubstitutions: definition.immutableSubstitutions,
        creationExecutableSha256: definition.creationExecutableSha256,
        runtimeExecutableSha256: definition.runtimeExecutableSha256,
        explorerFullRuntimeSha256: deployedBytecodeSha256,
        fullExact: false,
      },
    },
    proxy,
    explorer: {
      proxyOrDirect: proxyOrDirectSummary,
      activeContract: activeSummary,
      officialArtifactAbiMatch: false,
      reproducedAbiMatch: true,
      rpcBytecodeMatch: true,
    },
    reproduction: provenanceEvidence.reproduction,
    outcome: "passed",
  });

  abiRecords.push({
    id: definition.contractId,
    contractId: definition.contractId,
    provenanceClass: "deployed-executable-reproduction",
    intendedNetworkIds: ["mezo-mainnet"],
    artifactReference: {
      moduleId: "contracts",
      resourceId: `abi.${definition.contractId}`,
    },
    entryCount: abi.length,
    fileSha256: sha256(abiBytes),
    abiSha256: sha256(JSON.stringify(canonicalize(abi))),
    abiSemanticSha256,
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: sourceId,
    },
    sourceArtifacts: [{ networkId: "mezo-mainnet", path: endpointPath, sha256: responseSha256 }],
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    limitations: [
      "The full ABI is bound to the exact explorer source/build response, reproduced executable, and Mezo Mainnet implementation generation.",
      "registry provenance review and emission evidence review qualified review accepted this bounded ABI identity; executable and ABI equality still do not establish source authorship, repository history, audit coverage, writer safety, or protocol support.",
    ],
  });

  deploymentRecords.push({
    id: deploymentId,
    contractId: definition.contractId,
    contractName: definition.contractName,
    sourceContractName: definition.sourceContractName,
    protocol: "incentives",
    domains: definition.domains,
    networkId: "mezo-mainnet",
    environment: "mainnet",
    address: definition.address,
    provenanceClass: "deployed-executable-reproduction",
    contractType: proxy ? "transparent-proxy" : "direct",
    validity: { deploymentFrom, currentCodeFrom, effectiveUntilExclusive: null },
    proxy,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: definition.contractId,
      },
      appliesTo: proxy ? "current-implementation-through-proxy" : "deployment",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: sourceId,
      },
      artifactPath: endpointPath,
      declaredImplementationAddress: definition.implementation,
    },
    runtime: {
      observedAt: startedAt,
      blockNumber: evidenceBlockNumber,
      blockHash: expectedBlockHash,
      addressCodeSha256,
      implementationCodeSha256,
      artifactBytecodeComparison: object(
        object(observations.at(-1) ?? fail("current observation is missing"), "current observation")
          .runtime,
        "current observation runtime",
      ).artifactBytecodeComparison,
    },
    provenanceEvidence,
    evidenceReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: observationId,
    },
    status: "verified-current",
    supportStatus: "supported",
    reviewStatus: "accepted",
    limitations: [
      "registry provenance review and emission evidence review qualified review accepted this identity for bounded Contract registry use; it creates no reader, writer, route, protocol, or product support.",
      "The explorer verification label is preserved exactly; executable reproduction does not prove official authorship, repository history, or audit coverage.",
      "An open validity range means no later upgrade or replacement was observed through the evidence block, not that the deployment is immutable.",
    ],
  });
}

const finishedAt = new Date().toISOString();
const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "accepted",
  verifiedAt: finishedAt,
  reviewAfter: "2026-09-21T00:00:00Z",
  scope: {
    networkIds: ["mezo-mainnet"],
    deploymentIds: deploymentRecords.map((record) => record.id),
  },
  limitations: [
    "Evidence is bounded to the recorded block, activation logs, source responses, compiler builds, and implementation generations.",
    "Executable equality does not establish source authorship, audit coverage, writer safety, or future proxy identity.",
  ],
  observedFrom: startedAt,
  observedThrough: finishedAt,
  methodology: [
    "Pinned a fresh incentives-emissions topology block after independently confirming chain ID and block hash.",
    "Reconstructed every proxy implementation range from successful official-explorer Upgraded logs and read current ERC-1967 slots at the fixed block.",
    "Read proxy, implementation, and direct runtime code at the fixed block and matched implementation/direct bytes to the official explorer response.",
    "Built each exact explorer source bundle in an isolated Foundry directory with the recorded compiler/settings and matched creation/runtime executables after explicit immutable substitution.",
    "Compared each generated full ABI semantically with the exact reproduced build and retained full/partial explorer verification labels unchanged.",
    "Preserved registry provenance review/emission evidence review qualified acceptance for all thirteen bounded deployment and ABI identities without implying protocol or writer support.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: 31612,
      blockNumber: evidenceBlockNumber,
      blockHash: expectedBlockHash,
      blockTimestamp: snapshotBlock.blockTimestamp,
      rpcUrl,
      explorerApiUrl,
    },
  ],
  observations,
};
const evidencePath = join(contractsDirectory, "evidence", "incentives-contracts-2026-08-21.json");
await writeJson(evidencePath, evidence);
const evidenceSha256 = sha256(await readFile(evidencePath));

const abiCatalogPath = join(contractsDirectory, "records", "abis.json");
const abiCatalog = await loadJson(abiCatalogPath);
abiCatalog.verifiedAt = finishedAt;
abiCatalog.reviewAfter = "2026-09-21T00:00:00Z";
const abiScope = object(abiCatalog.scope, "ABI catalog scope");
abiCatalog.scope = abiScope;
abiScope.contractIds = [
  ...new Set([
    ...texts(abiScope.contractIds, "ABI catalog contract IDs"),
    ...definitions.map((item) => item.contractId),
  ]),
];
abiCatalog.limitations = [
  ...texts(abiCatalog.limitations, "ABI catalog limitations").filter(
    (item) => !item.startsWith("The catalog contains"),
  ),
];
const abiCatalogRecords = upsert(
  objects(abiCatalog.records, "ABI catalog records"),
  abiRecords,
  "contractId",
);
abiCatalog.records = abiCatalogRecords;
const supportedAbiCount = abiCatalogRecords.filter(
  (record) => record.supportStatus === "supported",
).length;
const proposedAbiCount = abiCatalogRecords.filter(
  (record) => record.supportStatus === "proposed",
).length;
abiCatalog.limitations = [
  ...texts(abiCatalog.limitations, "ABI catalog limitations"),
  `The catalog contains ${supportedAbiCount} supported ABIs and ${proposedAbiCount} proposed ABIs; record-level lifecycle and provenance govern use.`,
];
await writeJson(abiCatalogPath, abiCatalog);

const deploymentCatalogPath = join(contractsDirectory, "records", "deployments.json");
const deploymentCatalog = await loadJson(deploymentCatalogPath);
deploymentCatalog.verifiedAt = finishedAt;
deploymentCatalog.reviewAfter = "2026-09-21T00:00:00Z";
const deploymentScope = object(deploymentCatalog.scope, "deployment catalog scope");
deploymentCatalog.scope = deploymentScope;
deploymentScope.contractIds = [
  ...new Set([
    ...texts(deploymentScope.contractIds, "deployment catalog contract IDs"),
    ...definitions.map((item) => item.contractId),
  ]),
];
deploymentCatalog.limitations = [
  ...texts(deploymentCatalog.limitations, "deployment catalog limitations").filter(
    (item) => !item.startsWith("The catalog contains"),
  ),
];
const deploymentCatalogRecords = upsert(
  objects(deploymentCatalog.records, "deployment catalog records"),
  deploymentRecords,
);
deploymentCatalog.records = deploymentCatalogRecords;
const supportedDeploymentCount = deploymentCatalogRecords.filter(
  (record) => record.supportStatus === "supported",
).length;
const proposedDeploymentCount = deploymentCatalogRecords.filter(
  (record) => record.supportStatus === "proposed",
).length;
deploymentCatalog.limitations = [
  ...texts(deploymentCatalog.limitations, "deployment catalog limitations"),
  `The catalog contains ${supportedDeploymentCount} supported deployments and ${proposedDeploymentCount} proposed deployments; record-level lifecycle and provenance govern use.`,
];
await writeJson(deploymentCatalogPath, deploymentCatalog);

const sourceCatalogPath = join(contractsDirectory, "sources", "catalog.json");
const sourceCatalog = await loadJson(sourceCatalogPath);
sourceCatalog.verifiedAt = finishedAt;
const sourceRecord = {
  id: sourceId,
  kind: "on-chain-explorer-executable-reproduction",
  reference: { moduleId: "contracts", resourceId: evidenceId },
  sha256: evidenceSha256,
  retrievedAt: finishedAt,
  endpoints: [explorerApiUrl],
  note: "Bounded official-explorer source/ABI responses, fixed-block runtime identity, activation histories, and exact isolated executable reproductions for the current incentives and emissions graph.",
};
const sourceCatalogRecords = upsert(objects(sourceCatalog.sources, "source catalog records"), [
  sourceRecord,
]);
sourceCatalog.sources = sourceCatalogRecords;
sourceCatalog.sourceArtifacts = upsert(
  objects(sourceCatalog.sourceArtifacts, "source artifacts"),
  sourceArtifacts,
  "path",
);
const sourceScope = object(sourceCatalog.scope, "source catalog scope");
sourceCatalog.scope = sourceScope;
sourceScope.sourceIds = [
  ...new Set([...texts(sourceScope.sourceIds, "source catalog IDs"), sourceId]),
];
await writeJson(sourceCatalogPath, sourceCatalog);

const indexPath = join(contractsDirectory, "index.json");
const index = await loadJson(indexPath);
index.verifiedAt = finishedAt;
index.reviewAfter = "2026-09-21T00:00:00Z";
const indexScope = object(index.scope, "Contracts index scope");
index.scope = indexScope;
indexScope.contractIds = [
  ...new Set([
    ...texts(indexScope.contractIds, "Contracts index IDs"),
    ...definitions.map((item) => item.contractId),
  ]),
];
index.limitations = [
  "Open deployment validity ranges and current implementation ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create reader, writer, route, protocol, market, vault, or product support.",
  `MDK registry support covers ${supportedAbiCount} accepted Contract identities/ABIs and ${supportedDeploymentCount} supported deployments; ${proposedAbiCount} identities/ABIs and ${proposedDeploymentCount} deployments remain proposed and pending qualified review.`,
];
let indexResources = objects(index.resources, "Contracts index resources");
for (const [resourceId, recordIds] of [
  [
    "contract-deployments",
    deploymentCatalogRecords.map((record) => text(record.id, "deployment ID")),
  ],
  ["contract-abis", abiCatalogRecords.map((record) => text(record.id, "ABI ID"))],
  ["contract-sources", sourceCatalogRecords.map((record) => text(record.id, "source ID"))],
] as const) {
  const resource =
    indexResources.find((item) => item.id === resourceId) ??
    fail(`Contracts index resource ${resourceId} is missing`);
  resource.recordIds = recordIds;
}
indexResources = indexResources.filter(
  (resource) =>
    resource.id !== evidenceId &&
    !definitions.some((item) => resource.id === `abi.${item.contractId}`),
);
const reviewResourceIndex = indexResources.findIndex((resource) => resource.role === "review");
if (reviewResourceIndex < 0) fail("Contracts review resource is missing");
indexResources.splice(
  reviewResourceIndex,
  0,
  {
    id: evidenceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/incentives-contracts-2026-08-21.json",
    recordIds: observations.map((observation) => observation.id),
    recordCollectionPointer: "/observations",
  },
  ...definitions.map((definition) => ({
    id: `abi.${definition.contractId}`,
    role: "artifact",
    kind: "contract-abi",
    path: `artifacts/abis/incentives/${definition.abiFile}`,
  })),
);
index.resources = indexResources;
await writeJson(indexPath, index);

process.stdout.write(
  `Imported ${definitions.length} accepted incentives contract IDs and ${observations.length} class-scoped observations (${evidenceSha256}).\n`,
);
