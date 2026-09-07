import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, text, values, type JsonObject } from "./lib/json.ts";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const knowledgeDirectory = join(repositoryRoot, "knowledge", "contracts");

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const UPGRADED_TOPIC = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";
const TOKEN_DEPLOYED_TOPIC = "0x91d24864a084ab70b268a1f865e757ca12006cf298d763b6be697302ef86498c";

const EXPECTED_COMMITS = {
  docs: "c9e6cb39361c8d71637f40bdfc9378a24e286555",
  musd: "43ef44123753fa3e28425beffde42c86693fd03c",
  tigris: "0a3b5e840ac8e187cc705fbeddcf00f88b09247e",
};

const networks = {
  "mezo-mainnet": {
    environment: "mainnet",
    chainId: 31612,
    rpcUrl: "https://mezo-mainnet.boar.network",
    explorerApiUrl: "https://api.explorer.mezo.org",
  },
  "mezo-testnet": {
    environment: "testnet",
    chainId: 31611,
    rpcUrl: "https://rpc.test.mezo.org",
    explorerApiUrl: "https://api.explorer.test.mezo.org",
  },
} as const;
type NetworkId = keyof typeof networks;

const musdContracts = [
  ["musd.active-pool", "ActivePool", ["musd", "borrowing", "redemptions"]],
  ["musd.borrower-operations", "BorrowerOperations", ["musd", "borrowing"]],
  ["musd.borrower-operations-signatures", "BorrowerOperationsSignatures", ["musd", "borrowing"]],
  ["musd.coll-surplus-pool", "CollSurplusPool", ["musd", "borrowing", "redemptions"]],
  ["musd.default-pool", "DefaultPool", ["musd", "borrowing"]],
  ["musd.gas-pool", "GasPool", ["musd", "borrowing"]],
  ["musd.governable-variables", "GovernableVariables", ["musd", "borrowing", "redemptions"]],
  ["musd.hint-helpers", "HintHelpers", ["musd", "borrowing", "redemptions"]],
  ["musd.interest-rate-manager", "InterestRateManager", ["musd", "borrowing"]],
  ["musd.token", "MUSD", ["musd", "borrowing", "redemptions", "bridges"]],
  ["musd.pcv", "PCV", ["musd", "borrowing"]],
  ["musd.price-feed", "PriceFeed", ["musd", "borrowing", "redemptions"]],
  ["musd.sorted-troves", "SortedTroves", ["musd", "borrowing", "redemptions"]],
  ["musd.stability-pool", "StabilityPool", ["musd", "borrowing"]],
  ["musd.trove-manager", "TroveManager", ["musd", "borrowing", "redemptions"]],
] as const;

const tigrisContracts = [
  ["mezo-earn.router", "Router", ["gauges", "pools"]],
  ["mezo-earn.pool-factory", "PoolFactory", ["gauges", "pools"]],
  ["mezo-earn.ve-btc-voter", "VeBTCVoter", ["gauges", "ve-btc"], "Voter"],
  [
    "mezo-earn.ve-btc-rewards-distributor",
    "VeBTCRewardsDistributor",
    ["gauges", "ve-btc"],
    "RewardsDistributor",
  ],
  ["mezo-earn.ve-btc-epoch-governor", "VeBTCEpochGovernor", ["gauges", "ve-btc"], "EpochGovernor"],
  ["mezo-earn.chain-fee-splitter", "ChainFeeSplitter", ["gauges", "ve-btc"]],
] as const;

const docsSources = [
  {
    id: "official-docs-contract-reference",
    path: "src/content/docs/docs/users/resources/contracts-reference.md",
    note: "Official current token, bridge, pool, and historical Portal address reference.",
  },
  {
    id: "official-docs-mezo-pools",
    path: "src/content/docs/docs/developers/features/mezo-pools.md",
    note: "Official current basic-pool, concentrated-liquidity, and veBTC root contract reference.",
  },
  {
    id: "official-docs-musd-development",
    path: "src/content/docs/docs/developers/musd/index.md",
    note: "Official MUSD architecture and contract-component development guide.",
  },
  {
    id: "official-docs-musd-redemptions",
    path: "src/content/docs/docs/developers/musd/musd-redemptions/index.md",
    note: "Official redemption integration guide and published MUSD root addresses.",
  },
];

interface Arguments {
  "docs-source": string;
  "musd-source": string;
  "tigris-source": string;
}
interface Definition {
  contractId: string;
  contractName: string;
  sourceContractName?: string;
  domains: readonly string[];
  protocol: string;
  sourceId: string;
  networkIds: readonly NetworkId[];
}
interface DeploymentArtifact extends JsonObject {
  abi: JsonObject[];
  address: string;
  implementation?: string;
  transactionHash: string;
  deployedBytecode?: string;
}
interface PreparedDeployment extends Definition {
  networkId: NetworkId;
  sourcePath: string;
  artifact: DeploymentArtifact;
  artifactSha256: string;
  abiSemanticSha256: string;
}
interface BlockRecord extends JsonObject {
  number: string;
  hash: string;
  timestamp: string;
  evidenceMethod?: string;
}
interface ExplorerContract extends JsonObject {
  name: string;
  file_path: string;
  is_verified: boolean;
  is_fully_verified: boolean;
  is_partially_verified: boolean;
  verified_at: string;
  compiler_version: string;
  license_type: string;
  proxy_type: string | null;
  abi: JsonObject[];
  deployed_bytecode: string;
  implementations?: (JsonObject & { address: string })[];
}
interface UpgradeEvent {
  address: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}
interface Coordinate extends JsonObject {
  blockNumber: number;
  transactionHash: string;
  logIndex?: number;
  blockHash?: string;
  blockTimestamp?: string;
  blockEvidenceMethod?: string;
}
interface HistoryEntry extends JsonObject {
  implementationAddress: string;
  effectiveFrom: Coordinate;
  effectiveUntilExclusive: Coordinate | null;
}
interface RpcAttempt {
  result: unknown;
  error: JsonObject | null;
}
interface NetworkSnapshot extends JsonObject {
  networkId: NetworkId;
  rpcUrl: string;
  explorerApiUrl: string;
  evmChainId: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  blockEvidenceMethod: string;
}
interface SourceArtifact extends JsonObject {
  sourceId: string;
  path: string;
  sha256: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function parseArguments(argv: readonly string[]): Arguments {
  const result: Partial<Arguments> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) fail("arguments must be --name value pairs");
    const name = key.slice(2);
    if (name !== "docs-source" && name !== "musd-source" && name !== "tigris-source") {
      fail(`unknown argument '${key}'`);
    }
    result[name] = resolve(value);
  }
  for (const required of ["docs-source", "musd-source", "tigris-source"]) {
    if (!result[required as keyof Arguments]) fail(`missing --${required}`);
  }
  return result as Arguments;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Hex(hex: string): string {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail("invalid hexadecimal bytecode");
  }
  return sha256Bytes(Buffer.from(normalized, "hex"));
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

function abiSemanticDigest(abi: readonly unknown[]): string {
  const entries = abi.map((entry) => JSON.stringify(canonicalize(entry))).sort();
  return sha256Bytes(JSON.stringify(entries));
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") fail(`expected address, received ${typeof value}`);
  const match = /[a-f0-9]{40}$/.exec(value.toLowerCase());
  if (!match) fail(`invalid address '${value}'`);
  return `0x${match[0]}`;
}

function normalizeHex(value: unknown): string {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]*$/.test(value)) {
    fail("invalid hex value");
  }
  return value.toLowerCase();
}

function hexNumber(value: string): number {
  const number = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(number)) fail(`unsafe hexadecimal number '${value}'`);
  return number;
}

function timestampsFromBlock(block: BlockRecord): string {
  return block.timestamp.startsWith("0x")
    ? new Date(hexNumber(block.timestamp) * 1000).toISOString()
    : new Date(block.timestamp).toISOString();
}

function sameAddress(left: unknown, right: unknown): boolean {
  return normalizeAddress(left) === normalizeAddress(right);
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function assertCommit(root: string, expected: string, label: string): Promise<void> {
  const actual = (await git(root, "rev-parse", "HEAD")).trim();
  if (actual !== expected) fail(`${label} source is ${actual}; expected ${expected}`);
}

async function loadJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function fileDigest(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson(
  url: string,
  options: RequestInit | undefined,
  label: string,
): Promise<JsonObject> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    fail(`${label} request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const body = await response.text();
  if (!response.ok) fail(`${label} returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  try {
    return object(parseJson(body, label), label);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

let rpcId = 0;
async function rpcAttempt(
  url: string,
  method: string,
  params: unknown[] = [],
): Promise<RpcAttempt> {
  const payload = await fetchJson(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    },
    `${method} at ${url}`,
  );
  return payload.error !== undefined && payload.error !== null
    ? {
        result: null,
        error: object(payload.error, `${method} RPC error`),
      }
    : { result: payload.result, error: null };
}

async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const attempt = await rpcAttempt(url, method, params);
  if (attempt.error) fail(`${method} at ${url} failed: ${JSON.stringify(attempt.error)}`);
  return attempt.result;
}

async function explorerContract(apiBase: string, address: string): Promise<ExplorerContract> {
  return (await fetchJson(
    `${apiBase}/api/v2/smart-contracts/${address}`,
    undefined,
    `explorer contract ${address}`,
  )) as ExplorerContract;
}

async function explorerTransaction(apiBase: string, transactionHash: string): Promise<JsonObject> {
  return fetchJson(
    `${apiBase}/api/v2/transactions/${transactionHash}`,
    undefined,
    `explorer transaction ${transactionHash}`,
  );
}

async function explorerBlock(apiBase: string, blockNumber: number): Promise<BlockRecord> {
  const block = await fetchJson(
    `${apiBase}/api/v2/blocks/${blockNumber}`,
    undefined,
    `explorer block ${blockNumber}`,
  );
  if (block.height !== blockNumber || !block.hash || !block.timestamp) {
    fail(`explorer returned an invalid block record for ${blockNumber}`);
  }
  return {
    number: `0x${blockNumber.toString(16)}`,
    hash: text(block.hash, "explorer block hash"),
    timestamp: text(block.timestamp, "explorer block timestamp"),
    evidenceMethod: "official-explorer-block-fallback",
  };
}

async function explorerUpgradeEvents(
  apiBase: string,
  address: string,
  toBlock: number,
): Promise<UpgradeEvent[]> {
  const query = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    address,
    topic0: UPGRADED_TOPIC,
    fromBlock: "0",
    toBlock: String(toBlock),
  });
  const payload = await fetchJson(
    `${apiBase}/api?${query.toString()}`,
    undefined,
    `explorer upgrade logs ${address}`,
  );
  if (payload.message !== "OK" || !Array.isArray(payload.result)) {
    fail(
      `explorer did not return upgrade logs for ${address}: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return objects(payload.result, "explorer upgrade logs")
    .filter((log) => {
      const topics = values(log.topics, "upgrade log topics");
      return typeof topics[0] === "string" && topics[0].toLowerCase() === UPGRADED_TOPIC;
    })
    .map((log) => {
      const topics = values(log.topics, "upgrade log topics");
      return {
        address: normalizeAddress(topics[1]),
        blockNumber: hexNumber(text(log.blockNumber, "upgrade block number")),
        transactionHash: normalizeHex(log.transactionHash),
        logIndex: hexNumber(text(log.logIndex, "upgrade log index")),
      };
    })
    .sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
}

function explorerSummary(contract: ExplorerContract): JsonObject {
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
    abiEntries: contract.abi?.length,
    abiSemanticSha256: abiSemanticDigest(contract.abi ?? []),
    deployedBytecodeSha256: sha256Hex(contract.deployed_bytecode),
  };
}

function assertExplorerSource(
  contract: ExplorerContract,
  expectedName: string,
  expectedAbiDigest: string,
  expectedCodeDigest: string,
  label: string,
): void {
  if (!contract.is_verified || !contract.is_fully_verified || contract.is_partially_verified) {
    fail(`${label} is not fully verified by the official explorer`);
  }
  if (contract.name !== expectedName) {
    fail(`${label} explorer name is '${contract.name}', expected '${expectedName}'`);
  }
  if (abiSemanticDigest(contract.abi ?? []) !== expectedAbiDigest) {
    fail(`${label} explorer ABI differs from the pinned official artifact`);
  }
  if (sha256Hex(contract.deployed_bytecode) !== expectedCodeDigest) {
    fail(`${label} explorer deployed bytecode differs from RPC bytecode`);
  }
}

function implementationEventRange(events: readonly UpgradeEvent[], index: number): HistoryEntry {
  const event = events[index] ?? fail(`upgrade event ${index} is missing`);
  const next = events[index + 1];
  return {
    implementationAddress: event.address,
    effectiveFrom: {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    },
    effectiveUntilExclusive: next
      ? {
          blockNumber: next.blockNumber,
          transactionHash: next.transactionHash,
          logIndex: next.logIndex,
        }
      : null,
  };
}

async function sourceDescriptors(args: Arguments): Promise<JsonObject[]> {
  const docs: JsonObject[] = [];
  for (const source of docsSources) {
    const content = await git(args["docs-source"], "show", `HEAD:${source.path}`);
    docs.push({
      ...source,
      kind: "official-docs",
      repository: "https://github.com/mezo-org/documentation",
      commit: EXPECTED_COMMITS.docs,
      url: `https://github.com/mezo-org/documentation/blob/${EXPECTED_COMMITS.docs}/${source.path}`,
      sha256: sha256Bytes(content),
    });
  }
  return docs;
}

function sourcePathFor(definition: Definition, networkId: NetworkId): string {
  if (definition.sourceId === "official-source-musd") {
    const directory = networkId === "mezo-mainnet" ? "mainnet" : "matsnet";
    return `solidity/artifacts/deployments/${directory}/${definition.contractName}.json`;
  }
  const directory = networkId === "mezo-mainnet" ? "mainnet" : "testnet";
  return `solidity/deployments/${directory}/${definition.contractName}.json`;
}

function sourceRootFor(definition: Definition, args: Arguments): string {
  return definition.sourceId === "official-source-musd"
    ? args["musd-source"]
    : args["tigris-source"];
}

function abiPathFor(definition: Definition): string {
  const domain = definition.sourceId === "official-source-musd" ? "musd" : "mezo-earn";
  return `artifacts/abis/${domain}/${definition.contractId.split(".").at(-1)}.json`;
}

function buildDefinitions(): Definition[] {
  return [
    ...musdContracts.map(([contractId, contractName, domains]) => ({
      contractId,
      contractName,
      domains,
      protocol: "musd",
      sourceId: "official-source-musd",
      networkIds: ["mezo-mainnet", "mezo-testnet"] as const,
    })),
    ...tigrisContracts.map(([contractId, contractName, domains, sourceContractName]) => ({
      contractId,
      contractName,
      sourceContractName: sourceContractName ?? contractName,
      domains,
      protocol: "mezo-earn",
      sourceId: "official-source-tigris",
      networkIds: ["mezo-mainnet", "mezo-testnet"] as const,
    })),
  ];
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  await assertCommit(args["docs-source"], EXPECTED_COMMITS.docs, "documentation");
  await assertCommit(args["musd-source"], EXPECTED_COMMITS.musd, "MUSD");
  await assertCommit(args["tigris-source"], EXPECTED_COMMITS.tigris, "Tigris");

  const startedAt = new Date().toISOString();
  const definitions = buildDefinitions();
  const abiCatalogRecords: JsonObject[] = [];
  const sourceArtifacts = new Map<string, SourceArtifact>();
  const preparedDeployments: PreparedDeployment[] = [];

  for (const definition of definitions) {
    const artifacts: {
      networkId: NetworkId;
      sourcePath: string;
      artifact: DeploymentArtifact;
      artifactSha256: string;
    }[] = [];
    for (const networkId of definition.networkIds) {
      const sourcePath = sourcePathFor(definition, networkId);
      const absolutePath = join(sourceRootFor(definition, args), sourcePath);
      const artifact = await loadJson<DeploymentArtifact>(absolutePath);
      const artifactSha256 = await fileDigest(absolutePath);
      artifacts.push({ networkId, sourcePath, artifact, artifactSha256 });
      sourceArtifacts.set(`${definition.sourceId}:${sourcePath}`, {
        sourceId: definition.sourceId,
        path: sourcePath,
        sha256: artifactSha256,
      });
    }

    const firstArtifact =
      artifacts[0] ?? fail(`${definition.contractId} source artifact is missing`);
    const semanticDigest = abiSemanticDigest(firstArtifact.artifact.abi);
    for (const { networkId, artifact } of artifacts.slice(1)) {
      if (abiSemanticDigest(artifact.abi) !== semanticDigest) {
        fail(`${definition.contractId} ABI differs on ${networkId}`);
      }
    }

    const abiPath = abiPathFor(definition);
    const abiFile = `${JSON.stringify(firstArtifact.artifact.abi, null, 2)}\n`;
    await mkdir(dirname(join(knowledgeDirectory, abiPath)), { recursive: true });
    await writeFile(join(knowledgeDirectory, abiPath), abiFile);
    abiCatalogRecords.push({
      id: definition.contractId,
      contractId: definition.contractId,
      provenanceClass: "official-artifact-fully-verified-deployment",
      intendedNetworkIds: definition.networkIds,
      artifactReference: {
        moduleId: "contracts",
        resourceId: `abi.${definition.contractId}`,
      },
      entryCount: firstArtifact.artifact.abi.length,
      fileSha256: sha256Bytes(abiFile),
      abiSha256: sha256Bytes(JSON.stringify(canonicalize(firstArtifact.artifact.abi))),
      abiSemanticSha256: semanticDigest,
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: definition.sourceId,
      },
      sourceArtifacts: artifacts.map(({ networkId, sourcePath, artifactSha256 }) => ({
        networkId,
        path: sourcePath,
        sha256: artifactSha256,
      })),
      status: "verified",
      supportStatus: "proposed",
      reviewStatus: "pending-qualified-review",
      limitations: [
        "The ABI is bound to the declared provenance class, exact source artifacts, and intended network scope.",
        "Support remains proposed until the regenerated catalog and deployments complete qualified Level 3 review.",
      ],
    });

    for (const sourceArtifact of artifacts) {
      preparedDeployments.push({
        ...definition,
        ...sourceArtifact,
        abiSemanticSha256: semanticDigest,
      });
    }
  }

  const networkSnapshots = {} as Record<NetworkId, NetworkSnapshot>;
  const blockCaches = {} as Record<NetworkId, Map<number, BlockRecord>>;
  for (const networkId of Object.keys(networks) as NetworkId[]) {
    const network = networks[networkId];
    const chainId = hexNumber(text(await rpc(network.rpcUrl, "eth_chainId"), "chain ID"));
    if (chainId !== network.chainId) fail(`${networkId} RPC returned chain ${chainId}`);
    const block = object(
      await rpc(network.rpcUrl, "eth_getBlockByNumber", ["latest", false]),
      `${networkId} latest block`,
    ) as BlockRecord;
    networkSnapshots[networkId] = {
      networkId,
      rpcUrl: network.rpcUrl,
      explorerApiUrl: network.explorerApiUrl,
      evmChainId: chainId,
      blockNumber: hexNumber(block.number),
      blockHash: normalizeHex(block.hash),
      blockTimestamp: timestampsFromBlock(block),
      blockEvidenceMethod: "eth_getBlockByNumber",
    };
    blockCaches[networkId] = new Map([[hexNumber(block.number), block]]);
  }

  async function blockAt(networkId: NetworkId, blockNumber: number): Promise<BlockRecord> {
    const cache = blockCaches[networkId];
    if (!cache.has(blockNumber)) {
      const blockValue = await rpc(networks[networkId].rpcUrl, "eth_getBlockByNumber", [
        `0x${blockNumber.toString(16)}`,
        false,
      ]);
      cache.set(
        blockNumber,
        blockValue === null || blockValue === undefined
          ? await explorerBlock(networks[networkId].explorerApiUrl, blockNumber)
          : (object(blockValue, `${networkId} block ${blockNumber}`) as BlockRecord),
      );
    }
    return cache.get(blockNumber) ?? fail(`${networkId} block ${blockNumber} is missing`);
  }

  const observations: JsonObject[] = [];
  const deploymentRecords: JsonObject[] = [];
  for (const prepared of preparedDeployments) {
    const network = networks[prepared.networkId];
    const snapshot = networkSnapshots[prepared.networkId];
    const address = normalizeAddress(prepared.artifact.address);
    const deploymentId = `${prepared.contractId}@${prepared.networkId}`;
    const isProxy = Boolean(prepared.artifact.implementation);
    const observationId = `observe-${deploymentId.replaceAll(".", "-").replace("@", "-")}`;
    process.stdout.write(`Verifying ${deploymentId} at block ${snapshot.blockNumber}...\n`);

    const receiptAttempt = await rpcAttempt(network.rpcUrl, "eth_getTransactionReceipt", [
      prepared.artifact.transactionHash,
    ]);
    const receipt =
      receiptAttempt.result === null || receiptAttempt.result === undefined
        ? null
        : object(receiptAttempt.result, `${deploymentId} receipt`);
    let activationBlockNumber: number;
    let activationEvidenceMethod: string;
    if (receipt) {
      if (hexNumber(text(receipt.status, `${deploymentId} receipt status`)) !== 1) {
        fail(`${deploymentId} source deployment transaction failed`);
      }
      if (receipt.contractAddress) {
        if (!sameAddress(receipt.contractAddress, address)) {
          fail(
            `${deploymentId} deployment receipt created ${text(
              receipt.contractAddress,
              "receipt contract address",
            )}, expected ${address}`,
          );
        }
        activationEvidenceMethod = "eth_getTransactionReceipt";
      } else {
        if (prepared.contractId !== "musd.token") {
          fail(`${deploymentId} receipt has no created contract address`);
        }
        const tokenDeployerPath = join(
          dirname(join(sourceRootFor(prepared, args), prepared.sourcePath)),
          "TokenDeployer.json",
        );
        const tokenDeployer = await loadJson<JsonObject>(tokenDeployerPath);
        const receiptLogs = objects(receipt.logs, `${deploymentId} receipt logs`);
        const deploymentEvent = receiptLogs.find((log) => {
          const topics = values(log.topics, "TokenDeployed log topics");
          return (
            sameAddress(log.address, tokenDeployer.address) &&
            typeof topics[0] === "string" &&
            topics[0].toLowerCase() === TOKEN_DEPLOYED_TOPIC &&
            sameAddress(log.data, address)
          );
        });
        if (!sameAddress(receipt.to, tokenDeployer.address) || !deploymentEvent) {
          fail(`${deploymentId} factory receipt does not contain the official TokenDeployed event`);
        }
        activationEvidenceMethod = "eth_getTransactionReceipt-plus-token-deployed-event";
      }
      activationBlockNumber = hexNumber(
        text(receipt.blockNumber, `${deploymentId} receipt block number`),
      );
    } else {
      const transaction = await explorerTransaction(
        network.explorerApiUrl,
        prepared.artifact.transactionHash,
      );
      const createdContract =
        transaction.created_contract === null || transaction.created_contract === undefined
          ? null
          : object(transaction.created_contract, `${deploymentId} created contract`);
      if (
        transaction.status !== "ok" ||
        createdContract === null ||
        !sameAddress(createdContract.hash, address) ||
        typeof transaction.block_number !== "number" ||
        !Number.isSafeInteger(transaction.block_number)
      ) {
        fail(`${deploymentId} has neither an RPC receipt nor a valid explorer creation record`);
      }
      activationBlockNumber = transaction.block_number;
      activationEvidenceMethod = "official-explorer-transaction-fallback";
    }
    const activationBlock = await blockAt(prepared.networkId, activationBlockNumber);
    const liveCode = text(
      await rpc(network.rpcUrl, "eth_getCode", [address, `0x${snapshot.blockNumber.toString(16)}`]),
      `${deploymentId} runtime code`,
    );
    if (liveCode === "0x") fail(`${deploymentId} has no code at the observation block`);
    const addressCodeSha256 = sha256Hex(liveCode);

    const proxyExplorer = await explorerContract(network.explorerApiUrl, address);
    let activeExplorer = proxyExplorer;
    let proxy: JsonObject | null = null;
    let implementationCodeSha256: string | null = null;
    let implementationHistory: HistoryEntry[] | null = null;
    let artifactBytecodeComparison: (JsonObject & { exactMatch: boolean }) | null = null;

    if (isProxy) {
      const implementationStorage = await rpc(network.rpcUrl, "eth_getStorageAt", [
        address,
        IMPLEMENTATION_SLOT,
        `0x${snapshot.blockNumber.toString(16)}`,
      ]);
      const adminStorage = await rpc(network.rpcUrl, "eth_getStorageAt", [
        address,
        ADMIN_SLOT,
        `0x${snapshot.blockNumber.toString(16)}`,
      ]);
      const implementationAddress = normalizeAddress(implementationStorage);
      const adminAddress = normalizeAddress(adminStorage);
      if (!sameAddress(implementationAddress, prepared.artifact.implementation)) {
        fail(
          `${deploymentId} active implementation ${implementationAddress} differs from official artifact ${prepared.artifact.implementation}`,
        );
      }
      if (proxyExplorer.proxy_type !== "eip1967") {
        fail(`${deploymentId} explorer proxy type is '${proxyExplorer.proxy_type}'`);
      }
      if (
        !proxyExplorer.implementations?.some((entry) =>
          sameAddress(entry.address, implementationAddress),
        )
      ) {
        fail(`${deploymentId} explorer proxy metadata omits the active implementation`);
      }

      const implementationCode = text(
        await rpc(network.rpcUrl, "eth_getCode", [
          implementationAddress,
          `0x${snapshot.blockNumber.toString(16)}`,
        ]),
        `${deploymentId} implementation code`,
      );
      if (implementationCode === "0x") fail(`${deploymentId} active implementation has no code`);
      implementationCodeSha256 = sha256Hex(implementationCode);
      activeExplorer = await explorerContract(network.explorerApiUrl, implementationAddress);
      assertExplorerSource(
        activeExplorer,
        prepared.sourceContractName ?? prepared.contractName,
        prepared.abiSemanticSha256,
        implementationCodeSha256,
        `${deploymentId} implementation`,
      );

      const events = await explorerUpgradeEvents(
        network.explorerApiUrl,
        address,
        snapshot.blockNumber,
      );
      if (events.length === 0) fail(`${deploymentId} has no ERC-1967 Upgraded events`);
      const latestEvent = events.at(-1) ?? fail(`${deploymentId} latest upgrade event is missing`);
      if (!sameAddress(latestEvent.address, implementationAddress)) {
        fail(`${deploymentId} latest upgrade event differs from the implementation slot`);
      }
      implementationHistory = [];
      for (let index = 0; index < events.length; index += 1) {
        const event = implementationEventRange(events, index);
        const eventBlock = await blockAt(prepared.networkId, event.effectiveFrom.blockNumber);
        event.effectiveFrom.blockHash = normalizeHex(eventBlock.hash);
        event.effectiveFrom.blockTimestamp = timestampsFromBlock(eventBlock);
        event.effectiveFrom.blockEvidenceMethod =
          eventBlock.evidenceMethod ?? "eth_getBlockByNumber";
        implementationHistory.push(event);
      }
      proxy = {
        standard: "eip-1967-transparent",
        implementationSlot: IMPLEMENTATION_SLOT,
        adminSlot: ADMIN_SLOT,
        adminAddress,
        currentImplementationAddress: implementationAddress,
        implementationHistory,
      };
    } else {
      assertExplorerSource(
        activeExplorer,
        prepared.sourceContractName ?? prepared.contractName,
        prepared.abiSemanticSha256,
        addressCodeSha256,
        deploymentId,
      );
      if (prepared.artifact.deployedBytecode) {
        const artifactCodeSha256 = sha256Hex(prepared.artifact.deployedBytecode);
        artifactBytecodeComparison = {
          artifactCodeSha256,
          rpcCodeSha256: addressCodeSha256,
          exactMatch: artifactCodeSha256 === addressCodeSha256,
          interpretation:
            artifactCodeSha256 === addressCodeSha256
              ? "exact-match"
              : "constructor-or-immutable-substitution; RPC bytecode still matches fully verified explorer source",
        };
      }
    }

    const activeFrom = isProxy
      ? (implementationHistory?.at(-1) ?? fail(`${deploymentId} current history is missing`))
          .effectiveFrom
      : {
          blockNumber: activationBlockNumber,
          transactionHash: normalizeHex(prepared.artifact.transactionHash),
          blockHash: normalizeHex(activationBlock.hash),
          blockTimestamp: timestampsFromBlock(activationBlock),
        };

    observations.push({
      id: observationId,
      deploymentId,
      networkId: prepared.networkId,
      observedAt: new Date().toISOString(),
      observationBlock: {
        number: snapshot.blockNumber,
        hash: snapshot.blockHash,
        timestamp: snapshot.blockTimestamp,
      },
      methods: [
        "eth_chainId",
        "eth_getBlockByNumber",
        "eth_getTransactionReceipt",
        ...(activationEvidenceMethod === "official-explorer-transaction-fallback"
          ? ["explorer transaction metadata"]
          : []),
        ...(activationEvidenceMethod === "eth_getTransactionReceipt-plus-token-deployed-event"
          ? ["TokenDeployed event"]
          : []),
        "eth_getCode",
        ...(isProxy ? ["eth_getStorageAt", "explorer getLogs"] : []),
        "explorer smart-contract metadata",
      ],
      activation: {
        transactionHash: normalizeHex(prepared.artifact.transactionHash),
        blockNumber: activationBlockNumber,
        blockHash: normalizeHex(activationBlock.hash),
        blockTimestamp: timestampsFromBlock(activationBlock),
        evidenceMethod: activationEvidenceMethod,
        blockEvidenceMethod: activationBlock.evidenceMethod ?? "eth_getBlockByNumber",
        receiptRpcOutcome: receiptAttempt.error
          ? { outcome: "error", error: receiptAttempt.error }
          : { outcome: receipt ? "returned" : "missing" },
      },
      runtime: {
        addressCodeSha256,
        implementationCodeSha256,
        artifactBytecodeComparison,
      },
      proxy,
      explorer: {
        proxyOrDirect: explorerSummary(proxyExplorer),
        activeContract: explorerSummary(activeExplorer),
        officialArtifactAbiMatch: true,
        rpcBytecodeMatch: true,
      },
      outcome: "passed",
    });

    deploymentRecords.push({
      id: deploymentId,
      contractId: prepared.contractId,
      contractName: prepared.contractName,
      sourceContractName: prepared.sourceContractName ?? prepared.contractName,
      protocol: prepared.protocol,
      domains: prepared.domains,
      networkId: prepared.networkId,
      environment: network.environment,
      address,
      provenanceClass: "official-artifact-fully-verified-deployment",
      contractType: isProxy ? "transparent-proxy" : "direct",
      validity: {
        deploymentFrom: {
          blockNumber: activationBlockNumber,
          transactionHash: normalizeHex(prepared.artifact.transactionHash),
          blockHash: normalizeHex(activationBlock.hash),
        },
        currentCodeFrom: activeFrom,
        effectiveUntilExclusive: null,
      },
      proxy,
      abi: {
        catalogReference: {
          moduleId: "contracts",
          resourceId: "contract-abis",
          recordId: prepared.contractId,
        },
        appliesTo: isProxy ? "current-implementation-through-proxy" : "deployment",
      },
      source: {
        sourceReference: {
          moduleId: "contracts",
          resourceId: "contract-sources",
          recordId: prepared.sourceId,
        },
        artifactPath: prepared.sourcePath,
        declaredImplementationAddress: prepared.artifact.implementation
          ? normalizeAddress(prepared.artifact.implementation)
          : null,
      },
      runtime: {
        observedAt: text(
          (observations.at(-1) ?? fail(`${deploymentId} observation is missing`)).observedAt,
          `${deploymentId} observation timestamp`,
        ),
        blockNumber: snapshot.blockNumber,
        blockHash: snapshot.blockHash,
        addressCodeSha256,
        implementationCodeSha256,
        artifactBytecodeComparison,
      },
      evidenceReference: {
        moduleId: "contracts",
        resourceId: "contract-probes-2026-08-18",
        recordId: observationId,
      },
      status: "verified-current",
      supportStatus: "proposed",
      reviewStatus: "pending-qualified-review",
      limitations: [
        "Verification is point-in-time; re-check after the registry review window or before a protocol-sensitive release.",
        "A null effectiveUntilExclusive means no supersession was observed at the verification block, not that the deployment is immutable.",
        ...(isProxy
          ? [
              "Only the current implementation ABI is supported; historical implementation identities are retained as evidence, not as supported ABI snapshots.",
            ]
          : []),
        ...(artifactBytecodeComparison && !artifactBytecodeComparison.exactMatch
          ? [
              "The official build artifact contains constructor/immutable placeholders, so its raw runtime bytes are not expected to equal deployed bytes; fully verified explorer bytecode was matched to RPC instead.",
            ]
          : []),
      ],
    });
  }

  const finishedAt = new Date().toISOString();
  const reviewAfter = new Date(Date.parse(finishedAt) + 30 * 24 * 60 * 60 * 1000).toISOString();
  const evidencePath = "evidence/contract-probes-2026-08-18.json";
  const evidence = {
    schemaVersion: 1,
    kind: "contract-observation-set",
    id: "contract-probes-2026-08-18",
    owner: "contracts-registry",
    status: "verified",
    supportStatus: "none",
    reviewStatus: "pending-qualified-review",
    verifiedAt: finishedAt,
    reviewAfter,
    scope: {
      networkIds: Object.keys(networks),
      deploymentIds: observations.map((observation) => observation.deploymentId),
    },
    limitations: [
      "Observations are bounded to the recorded blocks, explorer responses, methods, and timestamps.",
      "Successful point-in-time checks do not establish future bytecode, proxy, provider, or explorer availability.",
      "Evidence verification does not create an MDK support promise or replace the contract registry review qualified review.",
    ],
    observedFrom: startedAt,
    observedThrough: finishedAt,
    methodology: [
      "Resolve one fixed recent block per Mezo network after confirming eth_chainId.",
      "Confirm each official artifact deployment transaction, activation block, and deployed runtime bytecode using read-only JSON-RPC.",
      "For transparent proxies, read the standard ERC-1967 implementation and admin slots and reconstruct implementation ranges from Upgraded events.",
      "Require the official explorer to report fully verified, non-partial active source; compare its full ABI semantically with the pinned official artifact and its deployed bytecode with RPC.",
      "Compute SHA-256 over decoded bytecode bytes and canonical JSON/ABI representations; no private RPC credentials or unbounded raw responses are retained.",
    ],
    networkSnapshots: Object.values(networkSnapshots),
    observations,
  };
  await writeJson(join(knowledgeDirectory, evidencePath), evidence);
  const evidenceSha256 = await fileDigest(join(knowledgeDirectory, evidencePath));

  const docs = await sourceDescriptors(args);
  const sources = {
    schemaVersion: 1,
    kind: "contract-source-catalog",
    id: "contract-sources",
    owner: "contracts-registry",
    status: "verified",
    supportStatus: "none",
    reviewStatus: "pending-qualified-review",
    verifiedAt: finishedAt,
    reviewAfter,
    scope: {
      networkIds: Object.keys(networks),
      sourceIds: [
        "official-source-musd",
        "official-source-tigris",
        ...docs.map((source) => source.id),
        "official-explorer-contract-observations",
      ],
    },
    limitations: [
      "Pinned source identity establishes provenance only for the exact commits, paths, artifacts, and observations recorded.",
      "The observation source is bounded by its own review window and does not create an availability or support promise.",
    ],
    sources: [
      {
        id: "official-source-musd",
        kind: "official-source-and-deployment-artifacts",
        repository: "https://github.com/mezo-org/musd",
        commit: EXPECTED_COMMITS.musd,
        package: "@mezo-org/musd-contracts",
        packageVersion: "1.1.0",
        license: "GPL-3.0",
        note: "Pinned official MUSD source and chain-scoped Hardhat deployment artifacts with full ABIs and declared active proxy implementations.",
      },
      {
        id: "official-source-tigris",
        kind: "official-source-and-deployment-artifacts",
        repository: "https://github.com/mezo-org/tigris",
        commit: EXPECTED_COMMITS.tigris,
        package: "@mezo-org/tigris-contracts",
        packageVersion: "1.0.0",
        license: "GPL-3.0",
        note: "Pinned official Mezo Earn/Tigris source and chain-scoped Hardhat deployment artifacts for the still-published basic-pool and veBTC roots.",
      },
      ...docs.map((source) => ({ ...source, retrievedAt: finishedAt })),
      {
        id: "official-explorer-contract-observations",
        kind: "on-chain-and-verified-explorer-observation",
        reference: {
          moduleId: "contracts",
          resourceId: "contract-probes-2026-08-18",
        },
        sha256: evidenceSha256,
        retrievedAt: finishedAt,
        endpoints: Object.values(networks).map((network) => network.explorerApiUrl),
        note: "Bounded current code, receipt, ERC-1967 slot, upgrade-event, full-ABI, and verified-source observations.",
      },
    ],
    sourceArtifacts: [...sourceArtifacts.values()].sort((left, right) =>
      `${left.sourceId}:${left.path}`.localeCompare(`${right.sourceId}:${right.path}`),
    ),
  };
  await writeJson(join(knowledgeDirectory, "sources", "catalog.json"), sources);

  await writeJson(join(knowledgeDirectory, "records", "abis.json"), {
    schemaVersion: 1,
    kind: "contract-abi-catalog",
    id: "contract-abis",
    owner: "contracts-registry",
    status: "verified",
    registryStatus: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: finishedAt,
    reviewAfter,
    scope: {
      networkIds: Object.keys(networks),
      contractIds: definitions.map((definition) => definition.contractId),
    },
    limitations: [
      "Each artifact is the current implementation ABI for the verified deployment generation, not a historical implementation catalog.",
      "ABI support remains proposed pending the independent contract registry review registry/security review.",
    ],
    records: abiCatalogRecords,
  });

  await writeJson(join(knowledgeDirectory, "records", "deployments.json"), {
    schemaVersion: 1,
    kind: "contract-deployment-catalog",
    id: "contract-deployments",
    owner: "contracts-registry",
    status: "verified",
    registryStatus: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: finishedAt,
    reviewAfter,
    scope: {
      networkIds: Object.keys(networks),
      contractIds: definitions.map((definition) => definition.contractId),
    },
    limitations: [
      "Catalog verification is point-in-time and must be repeated after reviewAfter or before a protocol-sensitive release.",
      "Open deployment ranges mean no supersession was observed at the verification block; they do not assert immutability.",
      "All deployment support remains proposed and requires the independent contract registry review registry/security review.",
    ],
    records: deploymentRecords,
  });

  await writeJson(join(knowledgeDirectory, "index.json"), {
    schemaVersion: 1,
    knowledgeVersion: "0.4",
    kind: "knowledge-module-index",
    id: "contracts",
    moduleId: "contracts",
    owner: "contracts-registry",
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: finishedAt,
    reviewAfter,
    scope: {
      networkIds: Object.keys(networks),
      contractIds: definitions.map((definition) => definition.contractId),
    },
    limitations: [
      "The registry is evidence-verified bootstrap input and does not create a released MDK support promise.",
      "Open deployment validity ranges and current implementation ABIs require re-verification after upgrades or the review window.",
      "Candidate deployments remain outside promoted resources; accepted ADR-0001 and ADR-0005 govern ownership and provenance classification.",
    ],
    resources: [
      {
        id: "contract-deployments",
        role: "canonical-record",
        kind: "contract-deployment-catalog",
        path: "records/deployments.json",
        recordIds: deploymentRecords.map((record) => text(record.id, "deployment ID")),
        recordCollectionPointer: "/records",
      },
      {
        id: "contract-abis",
        role: "canonical-record",
        kind: "contract-abi-catalog",
        path: "records/abis.json",
        recordIds: abiCatalogRecords.map((record) => text(record.id, "ABI ID")),
        recordCollectionPointer: "/records",
      },
      {
        id: "contract-sources",
        role: "source-catalog",
        kind: "contract-source-catalog",
        path: "sources/catalog.json",
        recordIds: objects(sources.sources, "contract sources").map((source) =>
          text(source.id, "source ID"),
        ),
        recordCollectionPointer: "/sources",
      },
      {
        id: "contract-probes-2026-08-18",
        role: "evidence",
        kind: "contract-observation-set",
        path: evidencePath,
        recordIds: observations.map((observation) => text(observation.id, "observation ID")),
        recordCollectionPointer: "/observations",
      },
      ...definitions.map((definition) => ({
        id: `abi.${definition.contractId}`,
        role: "artifact",
        kind: "contract-abi",
        path: abiPathFor(definition),
      })),
      {
        id: "contract-deployment-schema",
        role: "schema",
        kind: "json-schema",
        path: "schema/v1/deployment-catalog.schema.json",
      },
      {
        id: "contract-abi-catalog-schema",
        role: "schema",
        kind: "json-schema",
        path: "schema/v1/abi-catalog.schema.json",
      },
      {
        id: "contract-source-catalog-schema",
        role: "schema",
        kind: "json-schema",
        path: "schema/v1/source-catalog.schema.json",
      },
      {
        id: "contract-observation-set-schema",
        role: "schema",
        kind: "json-schema",
        path: "schema/v1/observation-set.schema.json",
      },
      {
        id: "contract-abi-artifact-schema",
        role: "schema",
        kind: "json-schema",
        path: "schema/v1/abi-artifact.schema.json",
      },
      {
        id: "contract-candidates",
        role: "review",
        kind: "candidate-inventory",
        path: "review/candidates.md",
      },
      {
        id: "legacy-schema-notes",
        role: "review",
        kind: "superseded-schema-notes",
        path: "review/legacy-schema-v1.md",
      },
      {
        id: "contract-reference",
        role: "generated",
        kind: "human-reference",
        path: "generated/reference.md",
        generatedFrom: [
          { moduleId: "contracts", resourceId: "contract-deployments" },
          { moduleId: "contracts", resourceId: "contract-abis" },
          { moduleId: "contracts", resourceId: "contract-sources" },
          { moduleId: "contracts", resourceId: "contract-probes-2026-08-18" },
        ],
      },
    ],
    checks: [
      {
        id: "common-structure",
        type: "structural",
        command: "node scripts/validate-knowledge-structure.ts --module contracts",
      },
      {
        id: "contract-semantics",
        type: "semantic",
        command: "node scripts/validate-contract-knowledge.ts",
      },
      {
        id: "contract-reference-drift",
        type: "drift",
        command: "node scripts/generate-contract-reference.ts --check",
      },
    ],
    extensions: {
      registryStatus: "verified-current",
      networkReferences: [
        { moduleId: "networks", resourceId: "mezo-mainnet" },
        { moduleId: "networks", resourceId: "mezo-testnet" },
      ],
    },
  });

  await execFileAsync(process.execPath, [join(scriptDirectory, "generate-contract-reference.ts")]);

  process.stdout.write(
    `Imported ${definitions.length} contract IDs, ${deploymentRecords.length} deployments, ` +
      `${abiCatalogRecords.length} full ABIs, and ${observations.length} observations.\n`,
  );
}

await main();
