import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const rpcUrl = process.env.MDK_MEZO_RPC_URL ?? "https://mezo-mainnet.boar.network";
const explorerApiUrl = process.env.MDK_MEZO_EXPLORER_API_URL ?? "https://api.explorer.mezo.org";
const evidenceBlockNumber = 11366264;
const evidenceBlockHash = "0x55ad6c682f5bc9ffcc9be53e1dedd5149f0c00a3a698c3369463e98ee91028b5";
const evidenceId = "contract-validator-incentives-probes-2026-08-24";
const sourceId = "validator-incentives-explorer-executable-reproductions";
const reviewAfter = "2026-09-22T00:00:00Z";

const definitions = [
  {
    contractId: "incentives.non-staking-gauge-factory",
    contractName: "Non-Staking Gauge Factory",
    sourceContractName: "GaugeFactory",
    address: "0x4150dce1c6d013fa7ebaf4ffcd879d08daa0ccad",
    domains: ["incentives", "validators", "gauges"],
    abiFile: "non-staking-gauge-factory.json",
    explorerVerification: "partially-verified",
    compilerVersion: "v0.8.24+commit.e11b9ed9",
    deployedBytecodeSha256: "45b4b915fca6ef1c68ad3b0b8491dc7b5367e59d18c802c55b7a396be59b5010",
    creationExecutableSha256: "df1eb4c14a38c913d15b1fbefed859981787e2b7652bed4c8a3fbce78a55623c",
    runtimeExecutableSha256: "07c67dbfb2a1407ca71a828b4b9bc5a24fc9651504de17bcee596fb6ac17800a",
    immutableSubstitutions: 0,
    creationFullExact: false,
    runtimeFullExact: false,
  },
  {
    contractId: "incentives.voting-rewards-factory",
    contractName: "Voting Rewards Factory",
    sourceContractName: "VotingRewardsFactory",
    address: "0x30019d85a86abd3cda1167f4c052690c32fbdec2",
    domains: ["incentives", "validators", "voting-rewards"],
    abiFile: "voting-rewards-factory.json",
    explorerVerification: "fully-verified",
    compilerVersion: "v0.8.24+commit.e11b9ed9",
    deployedBytecodeSha256: "b143c5256e32e827f46b69493b404e7f670bc967ad548e01ca11b4d8e60cde4f",
    creationExecutableSha256: "c58bf9a56cc8c8cebd9756a3ee3b59a459d18c3b9e168b630225c93603447760",
    runtimeExecutableSha256: "2e490106a85f958c15e4a538fc24cd8b14f47e4ceb721e5d1660eb09e2cad983",
    immutableSubstitutions: 0,
    creationFullExact: true,
    runtimeFullExact: true,
  },
] as const;

type JsonRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function records(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  return value.map((entry) => record(entry, `${label} entry`));
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail(`${label} is not a string array`);
  }
  return value as string[];
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} is not a string`);
  return value;
}

function normalizeHash(value: unknown): string {
  const normalized = String(value).toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) fail(`invalid hash '${String(value)}'`);
  return normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Hex(value: unknown): string {
  const normalized = String(value).replace(/^0x/, "");
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail("invalid hex bytes");
  }
  return sha256(Buffer.from(normalized, "hex"));
}

function semanticAbiDigest(abi: unknown[]): string {
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function upsert(
  collection: JsonRecord[],
  additions: JsonRecord[],
  key: "id" | "path" = "id",
): JsonRecord[] {
  const ids = new Set(additions.map((entry) => text(entry[key], `addition ${key}`)));
  return [
    ...collection.filter((entry) => !ids.has(text(entry[key], `record ${key}`))),
    ...additions,
  ];
}

async function loadJson(path: string): Promise<JsonRecord> {
  return record(JSON.parse(await readFile(path, "utf8")) as unknown, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(
  url: string,
  options?: RequestInit,
): Promise<{ raw: string; value: JsonRecord }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
      const raw = await response.text();
      if (!response.ok) fail(`${url} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
      return { raw, value: record(JSON.parse(raw) as unknown, url) };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  fail(`request failed after retries: ${String(lastError)}`);
}

let rpcId = 0;
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const { value } = await fetchJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (value.error !== undefined || value.result === undefined) {
    fail(`${method} failed: ${JSON.stringify(value.error ?? value)}`);
  }
  return value.result;
}

async function blockAt(blockNumber: number): Promise<JsonRecord> {
  const block = record(
    await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]),
    `block ${blockNumber}`,
  );
  return {
    blockNumber,
    blockHash: normalizeHash(block.hash),
    blockTimestamp: new Date(
      Number.parseInt(text(block.timestamp, "block timestamp"), 16) * 1000,
    ).toISOString(),
    blockEvidenceMethod: "eth_getBlockByNumber",
  };
}

const capturedAt = new Date().toISOString();
const chainId = Number(BigInt(text(await rpc("eth_chainId", []), "chain ID")));
if (chainId !== 31612) fail(`RPC returned chain ${chainId}`);
const evidenceBlock = await blockAt(evidenceBlockNumber);
if (evidenceBlock.blockHash !== evidenceBlockHash) fail("fixed evidence block hash drifted");

const abiRecords: JsonRecord[] = [];
const deploymentRecords: JsonRecord[] = [];
const observations: JsonRecord[] = [];
const sourceArtifacts: JsonRecord[] = [];

for (const definition of definitions) {
  const endpointPath = `api/v2/smart-contracts/${definition.address}`;
  const { raw: explorerRaw, value: explorer } = await fetchJson(
    `${explorerApiUrl}/${endpointPath}`,
  );
  if (explorer.name !== definition.sourceContractName) {
    fail(`${definition.contractId} explorer name drifted`);
  }
  if (explorer.compiler_version !== definition.compilerVersion) {
    fail(`${definition.contractId} compiler version drifted`);
  }
  const actualVerification = explorer.is_fully_verified
    ? "fully-verified"
    : explorer.is_partially_verified
      ? "partially-verified"
      : "unverified";
  if (actualVerification !== definition.explorerVerification) {
    fail(`${definition.contractId} explorer verification label drifted`);
  }
  if (sha256Hex(explorer.deployed_bytecode) !== definition.deployedBytecodeSha256) {
    fail(`${definition.contractId} explorer runtime drifted`);
  }
  const abi = Array.isArray(explorer.abi)
    ? explorer.abi
    : fail(`${definition.contractId} ABI missing`);
  const abiOutput = `${JSON.stringify(abi, null, 2)}\n`;
  const abiPath = join(contractsDirectory, "artifacts", "abis", "incentives", definition.abiFile);
  await writeFile(abiPath, abiOutput, "utf8");
  const abiSemanticSha256 = semanticAbiDigest(abi);
  const responseSha256 = sha256(explorerRaw);
  sourceArtifacts.push({
    sourceId,
    path: endpointPath,
    sha256: responseSha256,
  });

  const addressResponse = (
    await fetchJson(`${explorerApiUrl}/api/v2/addresses/${definition.address}`)
  ).value;
  const creationTransactionHash = normalizeHash(
    addressResponse.creation_transaction_hash ?? addressResponse.creation_tx_hash,
  );
  const transaction = (
    await fetchJson(`${explorerApiUrl}/api/v2/transactions/${creationTransactionHash}`)
  ).value;
  if (transaction.status !== "ok") fail(`${definition.contractId} creation transaction failed`);
  const creationBlockNumber = Number(transaction.block ?? transaction.block_number);
  if (!Number.isSafeInteger(creationBlockNumber)) {
    fail(`${definition.contractId} creation block is invalid`);
  }
  const deploymentFrom = {
    ...(await blockAt(creationBlockNumber)),
    transactionHash: creationTransactionHash,
  };
  const runtime = text(
    await rpc("eth_getCode", [definition.address, `0x${evidenceBlockNumber.toString(16)}`]),
    `${definition.contractId} runtime`,
  );
  const runtimeSha256 = sha256Hex(runtime);
  if (runtimeSha256 !== definition.deployedBytecodeSha256) {
    fail(`${definition.contractId} RPC runtime differs from explorer`);
  }
  const sourceBundleSha256 = sha256(
    JSON.stringify(
      canonicalize({
        filePath: explorer.file_path,
        sourceCode: explorer.source_code,
        additionalSources: [
          ...records(explorer.additional_sources ?? [], "additional sources"),
        ].sort((left, right) =>
          text(left.file_path ?? left.file_name ?? "", "additional source path").localeCompare(
            text(right.file_path ?? right.file_name ?? "", "additional source path"),
          ),
        ),
      }),
    ),
  );
  const observationId = `observe-${definition.contractId.replaceAll(".", "-")}-mezo-mainnet`;
  const deploymentId = `${definition.contractId}@mezo-mainnet`;
  const reproduction = {
    explorerVerification: {
      isVerified: explorer.is_verified,
      isFullyVerified: explorer.is_fully_verified,
      isPartiallyVerified: explorer.is_partially_verified,
    },
    sourceBundleSha256,
    compilerVersion: definition.compilerVersion,
    compilerSettingsSha256: sha256(JSON.stringify(canonicalize(explorer.compiler_settings ?? {}))),
    librariesSha256: sha256(JSON.stringify(canonicalize(explorer.external_libraries ?? []))),
    buildProcedure:
      "Fetch the recorded explorer source bundle, materialize it with scripts/reproduce-explorer-contract.ts, build with the exact Foundry compiler/settings, and compare creation/runtime executables with scripts/compare-explorer-build.ts.",
    creationExecutableMatch: true,
    runtimeExecutableMatch: true,
    fullBytecodeDifference:
      definition.creationFullExact && definition.runtimeFullExact
        ? "Creation and runtime bytecode, including metadata, match the exact isolated build."
        : "Creation/runtime executables match exactly; full bytes differ only in the 53-byte Solidity metadata trailers.",
    abiDerivedFromExactBuild: true,
    activationHistoryReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: observationId,
    },
  };
  const artifactComparison = {
    creationExecutableExact: true,
    runtimeExecutableExactAfterImmutableSubstitution: true,
    immutableSubstitutions: definition.immutableSubstitutions,
    creationExecutableSha256: definition.creationExecutableSha256,
    runtimeExecutableSha256: definition.runtimeExecutableSha256,
    explorerFullRuntimeSha256: definition.deployedBytecodeSha256,
    fullExact: definition.runtimeFullExact,
  };
  observations.push({
    id: observationId,
    deploymentId,
    networkId: "mezo-mainnet",
    observedAt: capturedAt,
    observationBlock: {
      number: evidenceBlockNumber,
      hash: evidenceBlockHash,
      timestamp: evidenceBlock.blockTimestamp,
    },
    methods: [
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "official explorer address and creation-transaction metadata",
      "official explorer smart-contract source/ABI",
      "isolated exact-compiler Foundry reproduction",
    ],
    activation: deploymentFrom,
    runtime: {
      addressCodeSha256: runtimeSha256,
      implementationCodeSha256: null,
      artifactBytecodeComparison: artifactComparison,
    },
    proxy: null,
    explorer: {
      proxyOrDirect: {
        name: explorer.name,
        filePath: explorer.file_path,
        isVerified: explorer.is_verified,
        isFullyVerified: explorer.is_fully_verified,
        isPartiallyVerified: explorer.is_partially_verified,
        verifiedAt: explorer.verified_at,
        compilerVersion: explorer.compiler_version,
        licenseType: explorer.license_type,
        proxyType: explorer.proxy_type,
        abiEntries: abi.length,
        abiSemanticSha256,
        deployedBytecodeSha256: definition.deployedBytecodeSha256,
      },
      activeContract: {
        name: explorer.name,
        filePath: explorer.file_path,
        isVerified: explorer.is_verified,
        isFullyVerified: explorer.is_fully_verified,
        isPartiallyVerified: explorer.is_partially_verified,
        verifiedAt: explorer.verified_at,
        compilerVersion: explorer.compiler_version,
        licenseType: explorer.license_type,
        proxyType: explorer.proxy_type,
        abiEntries: abi.length,
        abiSemanticSha256,
        deployedBytecodeSha256: definition.deployedBytecodeSha256,
      },
      officialArtifactAbiMatch: false,
      reproducedAbiMatch: true,
      rpcBytecodeMatch: true,
    },
    reproduction,
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
    fileSha256: sha256(abiOutput),
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
      "The full ABI is bound to the exact explorer response, reproduced executable, and Mezo Mainnet deployment.",
      "validator evidence review accepted this factory identity for bounded registry use; it creates no dynamic-instance, reader, writer, protocol, validator-operation, or product support.",
    ],
  });
  deploymentRecords.push({
    id: deploymentId,
    contractId: definition.contractId,
    contractName: definition.contractName,
    sourceContractName: definition.sourceContractName,
    protocol: "incentives",
    domains: [...definition.domains],
    networkId: "mezo-mainnet",
    environment: "mainnet",
    address: definition.address,
    provenanceClass: "deployed-executable-reproduction",
    contractType: "direct",
    validity: {
      deploymentFrom,
      currentCodeFrom: deploymentFrom,
      effectiveUntilExclusive: null,
    },
    proxy: null,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: definition.contractId,
      },
      appliesTo: "deployment",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: sourceId,
      },
      artifactPath: endpointPath,
      declaredImplementationAddress: null,
    },
    runtime: {
      observedAt: capturedAt,
      blockNumber: evidenceBlockNumber,
      blockHash: evidenceBlockHash,
      addressCodeSha256: runtimeSha256,
      implementationCodeSha256: null,
      artifactBytecodeComparison: artifactComparison,
    },
    provenanceEvidence: { reproduction },
    evidenceReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: observationId,
    },
    status: "verified-current",
    supportStatus: "supported",
    reviewStatus: "accepted",
    limitations: [
      "validator evidence review accepted this factory identity for bounded Contract registry use; acceptance creates no reader, writer, validator-operation, or product support.",
      "Dynamic gauge and voting-reward children remain point-in-time discovered instances, not static deployment records.",
      "Executable equality does not establish source authorship, audit coverage, writer safety, or future identity.",
    ],
  });
}

const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "accepted",
  verifiedAt: capturedAt,
  reviewAfter,
  scope: {
    networkIds: ["mezo-mainnet"],
    deploymentIds: deploymentRecords.map((entry) => entry.id),
  },
  limitations: [
    "Evidence is bounded to the recorded block, activation transaction, explorer responses, compiler builds, and direct deployments.",
    "Dynamic children created by these factories are excluded from static deployment identity and require point-in-time discovery.",
    "Executable equality does not establish source authorship, audit coverage, writer safety, or future identity.",
  ],
  observedFrom: capturedAt,
  observedThrough: capturedAt,
  methodology: [
    "Resolved the approved validator gauge factory and its paired voting-rewards factory from accepted FactoryRegistry state at the fixed block.",
    "Pinned direct-deployment activation from successful official-explorer creation transactions and fixed-block runtime code.",
    "Built both explorer source bundles with exact compiler/settings and matched creation/runtime executables while preserving full/partial explorer labels.",
    "Compared each generated full ABI semantically with its exact explorer response and recorded artifact/source digests.",
    "Proposed only the two reusable factory roots; individual validator gauges and reward contracts remain dynamic evidence-scoped instances.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: chainId,
      blockNumber: evidenceBlockNumber,
      blockHash: evidenceBlockHash,
      blockTimestamp: evidenceBlock.blockTimestamp,
      rpcUrl,
      explorerApiUrl,
    },
  ],
  observations,
};
const evidencePath = join(
  contractsDirectory,
  "evidence",
  "validator-incentives-contracts-2026-08-24.json",
);
await writeJson(evidencePath, evidence);
const evidenceSha256 = sha256(await readFile(evidencePath));

const abiCatalogPath = join(contractsDirectory, "records", "abis.json");
const abiCatalog = await loadJson(abiCatalogPath);
abiCatalog.verifiedAt = capturedAt;
abiCatalog.reviewAfter = reviewAfter;
const abiCatalogScope = record(abiCatalog.scope, "ABI catalog scope");
abiCatalog.scope = abiCatalogScope;
abiCatalogScope.contractIds = unique([
  ...strings(abiCatalogScope.contractIds, "ABI contract IDs"),
  ...definitions.map((definition) => definition.contractId),
]);
abiCatalog.records = upsert(records(abiCatalog.records, "ABI records"), abiRecords);
const supportedAbiCount = records(abiCatalog.records, "ABI records").filter(
  (entry) => entry.supportStatus === "supported",
).length;
const proposedAbiCount = records(abiCatalog.records, "ABI records").filter(
  (entry) => entry.supportStatus === "proposed",
).length;
abiCatalog.limitations = [
  ...strings(abiCatalog.limitations, "ABI limitations").filter(
    (entry) => !entry.startsWith("The catalog contains"),
  ),
  `The catalog contains ${supportedAbiCount} supported ABIs and ${proposedAbiCount} proposed ABIs; record-level lifecycle and provenance govern use.`,
];
await writeJson(abiCatalogPath, abiCatalog);

const deploymentCatalogPath = join(contractsDirectory, "records", "deployments.json");
const deploymentCatalog = await loadJson(deploymentCatalogPath);
deploymentCatalog.verifiedAt = capturedAt;
deploymentCatalog.reviewAfter = reviewAfter;
const deploymentCatalogScope = record(deploymentCatalog.scope, "deployment catalog scope");
deploymentCatalog.scope = deploymentCatalogScope;
deploymentCatalogScope.contractIds = unique([
  ...strings(deploymentCatalogScope.contractIds, "deployment contract IDs"),
  ...definitions.map((definition) => definition.contractId),
]);
deploymentCatalog.records = upsert(
  records(deploymentCatalog.records, "deployment records"),
  deploymentRecords,
);
const supportedDeploymentCount = records(deploymentCatalog.records, "deployment records").filter(
  (entry) => entry.supportStatus === "supported",
).length;
const proposedDeploymentCount = records(deploymentCatalog.records, "deployment records").filter(
  (entry) => entry.supportStatus === "proposed",
).length;
const historicalDeploymentCount = records(deploymentCatalog.records, "deployment records").filter(
  (entry) => entry.supportStatus === "historical",
).length;
deploymentCatalog.limitations = [
  ...strings(deploymentCatalog.limitations, "deployment limitations").filter(
    (entry) => !entry.startsWith("The catalog contains"),
  ),
  `The catalog contains ${supportedDeploymentCount} supported deployments, ${proposedDeploymentCount} proposed deployments, and ${historicalDeploymentCount} superseded historical deployments; record-level lifecycle and provenance govern use.`,
];
await writeJson(deploymentCatalogPath, deploymentCatalog);

const sourceCatalogPath = join(contractsDirectory, "sources", "catalog.json");
const sourceCatalog = await loadJson(sourceCatalogPath);
sourceCatalog.verifiedAt = capturedAt;
sourceCatalog.reviewAfter = reviewAfter;
const sourceRecord: JsonRecord = {
  id: sourceId,
  kind: "on-chain-explorer-executable-reproduction",
  reference: { moduleId: "contracts", resourceId: evidenceId },
  sha256: evidenceSha256,
  retrievedAt: capturedAt,
  endpoints: [explorerApiUrl],
  note: "Bounded official-explorer source/ABI responses, fixed-block runtime identity, direct activation, and exact isolated executable reproductions for the validator gauge and voting-rewards factory roots.",
};
sourceCatalog.sources = upsert(records(sourceCatalog.sources, "contract sources"), [sourceRecord]);
sourceCatalog.sourceArtifacts = upsert(
  records(sourceCatalog.sourceArtifacts, "source artifacts"),
  sourceArtifacts,
  "path",
);
const sourceCatalogScope = record(sourceCatalog.scope, "source catalog scope");
sourceCatalog.scope = sourceCatalogScope;
sourceCatalogScope.sourceIds = unique([
  ...strings(sourceCatalogScope.sourceIds, "source IDs"),
  sourceId,
]);
await writeJson(sourceCatalogPath, sourceCatalog);

const indexPath = join(contractsDirectory, "index.json");
const index = await loadJson(indexPath);
index.verifiedAt = capturedAt;
index.reviewAfter = reviewAfter;
const indexScope = record(index.scope, "Contracts index scope");
index.scope = indexScope;
indexScope.contractIds = unique([
  ...strings(indexScope.contractIds, "Contracts index IDs"),
  ...definitions.map((definition) => definition.contractId),
]);
index.limitations = [
  "Open deployment validity ranges and current implementation ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create reader, writer, route, protocol, market, vault, validator-operation, or product support.",
  `MDK registry support covers ${supportedAbiCount} accepted Contract identities/ABIs and ${supportedDeploymentCount} supported deployments; ${historicalDeploymentCount} superseded deployment remains historical and ${proposedAbiCount} identities/ABIs plus ${proposedDeploymentCount} deployments remain proposed.`,
];
let indexResources = records(index.resources, "Contracts resources");
for (const [resourceId, recordIds] of [
  [
    "contract-deployments",
    records(deploymentCatalog.records, "deployment records").map((entry) =>
      text(entry.id, "deployment record ID"),
    ),
  ],
  [
    "contract-abis",
    records(abiCatalog.records, "ABI records").map((entry) => text(entry.id, "ABI record ID")),
  ],
  [
    "contract-sources",
    records(sourceCatalog.sources, "contract sources").map((entry) =>
      text(entry.id, "source record ID"),
    ),
  ],
] as const) {
  const resource = indexResources.find((entry) => entry.id === resourceId);
  if (!resource) fail(`Contracts resource ${resourceId} is missing`);
  resource.recordIds = recordIds;
}
const artifactIds = new Set(definitions.map((definition) => `abi.${definition.contractId}`));
indexResources = indexResources.filter(
  (resource) => resource.id !== evidenceId && !artifactIds.has(String(resource.id)),
);
const reviewIndex = indexResources.findIndex((resource) => resource.role === "review");
if (reviewIndex < 0) fail("Contracts review resource is missing");
indexResources.splice(
  reviewIndex,
  0,
  {
    id: evidenceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/validator-incentives-contracts-2026-08-24.json",
    recordIds: observations.map((entry) => entry.id),
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
  `Imported ${definitions.length} accepted validator-incentives factory identities (${evidenceSha256}).\n`,
);
