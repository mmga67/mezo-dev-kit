import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const moduleDirectory = join(
  repositoryRoot,
  "knowledge",
  "protocols",
  "musd",
  "institutional-debt",
);
const evidenceResourceId = "contract-institutional-debt-probes-2026-08-23";
const sourceId = "institutional-debt-explorer-executable-reproductions";

const definitions = [
  {
    contractId: "musd.enclave-v1",
    contractName: "Enclave v1",
    proxyState: "originalEnclave",
    proxyContract: "originalEnclaveProxy",
    implementationContract: "originalEnclaveImplementation",
    reproductionId: "musd.enclave-v1",
    domains: ["musd", "institutional-debt", "custody", "execution"],
  },
  {
    contractId: "musd.enclave-v2",
    contractName: "Enclave v2",
    proxyState: "secondEnclave",
    proxyContract: "secondEnclaveProxy",
    implementationContract: "secondEnclaveImplementation",
    reproductionId: "musd.enclave-v2",
    domains: ["musd", "institutional-debt", "custody", "execution"],
  },
  {
    contractId: "musd.enclave-debt-manager",
    contractName: "EnclaveDebtManager",
    proxyState: "debtManager",
    proxyContract: "debtManagerProxy",
    implementationContract: "debtManagerImplementationV2",
    reproductionId: "musd.enclave-debt-manager",
    domains: ["musd", "institutional-debt", "positions", "accounting"],
  },
] as const;

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as JsonObject;
}
function array(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value as JsonObject[];
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(`${label} must be an array of strings`);
  }
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string`);
  return value;
}
async function json(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}
async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const state = await json(join(moduleDirectory, "evidence", "fixed-block-state-2026-08-23.json"));
const reproduction = await json(
  join(moduleDirectory, "evidence", "source-reproduction-2026-08-23.json"),
);
const scope = object(state.scope, "state.scope");
const contracts = object(state.contracts, "state.contracts");
const proxies = object(state.proxies, "state.proxies");
const reproductionRecords = array(reproduction.records, "reproduction.records");
const reproductionById = new Map(reproductionRecords.map((record) => [record.id, record]));
const verifiedAt = string(state.verifiedAt, "state.verifiedAt");
const blockNumber = Number(scope.blockNumber);
const blockHash = string(scope.blockHash, "scope.blockHash");
const blockTimestamp = string(scope.blockTimestamp, "scope.blockTimestamp");

const deploymentRecords: JsonObject[] = [];
const abiRecords: JsonObject[] = [];
const observations: JsonObject[] = [];

for (const definition of definitions) {
  const proxy = object(proxies[definition.proxyState], `${definition.proxyState} proxy`);
  const proxyContract = object(contracts[definition.proxyContract], definition.proxyContract);
  const implementationContract = object(
    contracts[definition.implementationContract],
    definition.implementationContract,
  );
  const source = reproductionById.get(definition.reproductionId);
  if (!source) fail(`missing reproduction ${definition.reproductionId}`);
  const sourceAddress = string(source.address, `${definition.contractId}.source.address`);
  const sourceAbi = object(source.abi, `${definition.contractId}.abi`);
  const result = object(source.reproduction, `${definition.contractId}.reproduction`);
  const verification = object(
    source.explorerVerification,
    `${definition.contractId}.explorerVerification`,
  );
  const creation = object(proxyContract.creation, `${definition.proxyContract}.creation`);
  const proxyRuntime = object(proxyContract.runtime, `${definition.proxyContract}.runtime`);
  const implementationRuntime = object(
    implementationContract.runtime,
    `${definition.implementationContract}.runtime`,
  );
  const deploymentId = `${definition.contractId}@mezo-mainnet`;
  const activation = {
    blockNumber: Number(creation.blockNumber),
    blockHash: string(creation.blockHash, `${deploymentId}.creation.blockHash`),
    blockTimestamp: string(creation.blockTimestamp, `${deploymentId}.creation.blockTimestamp`),
    blockEvidenceMethod: "official explorer transaction metadata and eth_getBlockByNumber",
    transactionHash: string(creation.transactionHash, `${deploymentId}.creation.transactionHash`),
  };
  const implementationHistory = array(
    proxy.implementationHistory,
    `${definition.proxyState}.implementationHistory`,
  ).map((entry, index, history) => {
    const next = history[index + 1];
    return {
      implementationAddress: entry.implementationAddress,
      effectiveFrom: entry.effectiveFrom,
      effectiveUntilExclusive: next ? next.effectiveFrom : null,
    };
  });
  const currentCodeFrom = object(
    implementationHistory.at(-1)?.effectiveFrom,
    `${deploymentId}.currentCodeFrom`,
  );
  const evidenceReference = {
    moduleId: "contracts",
    resourceId: evidenceResourceId,
    recordId: `observe-${definition.contractId.replaceAll(".", "-")}-mezo-mainnet`,
  };
  const artifactComparison = {
    creationExecutableExact: true,
    runtimeExecutableExactAfterImmutableSubstitution: true,
    immutableSubstitutions: Number(result.immutableSubstitutions),
    creationExecutableSha256: result.creationExecutableSha256,
    runtimeExecutableSha256: result.runtimeExecutableSha256,
    explorerFullRuntimeSha256: source.explorerRuntimeBytecodeSha256,
    fullExact: false,
  };
  const proxyMetadata = {
    standard: "eip-1967-transparent",
    implementationSlot: proxy.implementationSlot,
    adminSlot: proxy.adminSlot,
    adminAddress: proxy.adminAddress,
    currentImplementationAddress: proxy.currentImplementationAddress,
    implementationHistory,
  };
  const provenance = {
    explorerVerification: verification,
    sourceBundleSha256: source.sourceBundleSha256,
    compilerVersion: source.compilerVersion,
    compilerSettingsSha256: source.compilerSettingsSha256,
    librariesSha256: source.librariesSha256,
    buildProcedure: result.procedure,
    creationExecutableMatch: true,
    runtimeExecutableMatch: true,
    fullBytecodeDifference: result.fullBytecodeDifference,
    abiDerivedFromExactBuild: true,
    activationHistoryReference: evidenceReference,
  };

  observations.push({
    id: evidenceReference.recordId,
    deploymentId,
    networkId: "mezo-mainnet",
    observedAt: verifiedAt,
    observationBlock: { number: blockNumber, hash: blockHash, timestamp: blockTimestamp },
    methods: [
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getStorageAt",
      "official explorer transaction and Upgraded event metadata",
      "official explorer smart-contract source/ABI",
      "isolated exact-compiler Foundry reproduction",
    ],
    activation,
    runtime: {
      addressCodeSha256: proxyRuntime.codeSha256,
      implementationCodeSha256: implementationRuntime.codeSha256,
      artifactBytecodeComparison: artifactComparison,
    },
    proxy: proxyMetadata,
    explorer: {
      activeContract: {
        name: source.name,
        filePath: source.filePath,
        isVerified: verification.isVerified,
        isFullyVerified: verification.isFullyVerified,
        isPartiallyVerified: verification.isPartiallyVerified,
        compilerVersion: source.compilerVersion,
        proxyType: null,
        abiEntries: Number(sourceAbi.entryCount),
        abiSemanticSha256: sourceAbi.abiSemanticSha256,
        deployedBytecodeSha256: source.explorerRuntimeBytecodeSha256,
      },
      reproducedAbiMatch: true,
      rpcBytecodeMatch: source.explorerRuntimeBytecodeSha256 === implementationRuntime.codeSha256,
    },
    reproduction: provenance,
    outcome: "passed",
  });

  deploymentRecords.push({
    id: deploymentId,
    contractId: definition.contractId,
    contractName: definition.contractName,
    sourceContractName: source.name,
    protocol: "musd-institutional-debt",
    domains: definition.domains,
    networkId: "mezo-mainnet",
    environment: "mainnet",
    address: string(proxy.address, `${definition.proxyState}.address`),
    provenanceClass: "deployed-executable-reproduction",
    contractType: "transparent-proxy",
    validity: { deploymentFrom: activation, currentCodeFrom, effectiveUntilExclusive: null },
    proxy: proxyMetadata,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: definition.contractId,
      },
      appliesTo: "current-implementation-through-proxy",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: sourceId,
      },
      artifactPath: `api/v2/smart-contracts/${sourceAddress}`,
      declaredImplementationAddress: proxy.currentImplementationAddress,
    },
    runtime: {
      observedAt: verifiedAt,
      blockNumber,
      blockHash,
      addressCodeSha256: proxyRuntime.codeSha256,
      implementationCodeSha256: implementationRuntime.codeSha256,
      artifactBytecodeComparison: artifactComparison,
    },
    provenanceEvidence: { reproduction: provenance },
    evidenceReference,
    status: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "This deployment identity is block-scoped, proposed, and pending qualified Level 3 review; it creates no reader, writer, route, or product support.",
      "Executable reproduction proves byte correspondence but does not establish source authorship, repository history, audit coverage, or current operation safety.",
      "An open validity range means no later upgrade was observed through the evidence block, not that the proxy or governed state is immutable.",
    ],
  });

  abiRecords.push({
    id: definition.contractId,
    contractId: definition.contractId,
    provenanceClass: "deployed-executable-reproduction",
    intendedNetworkIds: ["mezo-mainnet"],
    artifactReference: { moduleId: "contracts", resourceId: `abi.${definition.contractId}` },
    entryCount: Number(sourceAbi.entryCount),
    fileSha256: sourceAbi.fileSha256,
    abiSha256: sourceAbi.abiSha256,
    abiSemanticSha256: sourceAbi.abiSemanticSha256,
    sourceReference: { moduleId: "contracts", resourceId: "contract-sources", recordId: sourceId },
    sourceArtifacts: [
      {
        networkId: "mezo-mainnet",
        path: `api/v2/smart-contracts/${sourceAddress}`,
        sha256: source.responseSha256,
      },
    ],
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "The full ABI applies only to the recorded current implementation generation through its Mezo Mainnet proxy.",
      "ABI and executable equality do not establish source authorship, audit coverage, writer safety, or support; qualified Level 3 review remains pending.",
    ],
  });
}

const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceResourceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "pending-qualified-review",
  verifiedAt,
  reviewAfter: "2026-09-23T00:00:00Z",
  scope: { networkIds: ["mezo-mainnet"], deploymentIds: deploymentRecords.map(({ id }) => id) },
  limitations: [
    "Evidence is bounded to the pinned block, official explorer source/ABI responses, proxy histories, and exact executable reproductions.",
    "Historical debt-manager v1 reproduction is retained as evidence but does not replace the current v2 ABI.",
  ],
  registryStatus: null,
  observedFrom: verifiedAt,
  observedThrough: verifiedAt,
  methodology: [
    "Discover deployed proxies and implementations through the official explorer.",
    "Pin proxy code, EIP-1967 slots, roles, target pairs, positions, and totals at one block.",
    "Resolve every Upgraded event and activation block hash/timestamp.",
    "Fetch each implementation source/compiler/ABI response.",
    "Compile every implementation independently with exact compiler settings.",
    "Compare creation and runtime executable bytes and derive current ABI artifacts from exact builds.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: 31612,
      blockNumber,
      blockHash,
      blockTimestamp,
      rpcUrl: "https://mezo-mainnet.boar.network",
      explorerApiUrl: "https://api.explorer.mezo.org",
    },
  ],
  observations,
};
const evidencePath = join(
  contractsDirectory,
  "evidence",
  "institutional-debt-contracts-2026-08-23.json",
);
await writeJson(evidencePath, evidence);

const deploymentCatalog = await json(join(contractsDirectory, "records", "deployments.json"));
const deploymentIds = new Set(deploymentRecords.map(({ id }) => id));
deploymentCatalog.records = [
  ...array(deploymentCatalog.records, "deployment records").filter(
    ({ id }) => !deploymentIds.has(id),
  ),
  ...deploymentRecords,
];
deploymentCatalog.verifiedAt = verifiedAt;
deploymentCatalog.reviewAfter = "2026-09-23T00:00:00Z";
deploymentCatalog.limitations = [
  "Catalog verification is point-in-time and must be repeated after reviewAfter or before a protocol-sensitive release.",
  "Open deployment ranges mean no supersession was observed at the verification block; they do not assert immutability.",
  "Support is limited to recorded validity ranges and must be reverified after upgrades or the review window.",
  "The catalog contains 55 accepted bootstrap/registry provenance review deployments plus eighteen proposed emission evidence review/pool evidence review/institutional debt evidence review deployments; record-level lifecycle and provenance govern use.",
];
await writeJson(join(contractsDirectory, "records", "deployments.json"), deploymentCatalog);

const abiCatalog = await json(join(contractsDirectory, "records", "abis.json"));
const abiIds = new Set(abiRecords.map(({ id }) => id));
abiCatalog.records = [
  ...array(abiCatalog.records, "ABI records").filter(({ id }) => !abiIds.has(id)),
  ...abiRecords,
];
abiCatalog.verifiedAt = verifiedAt;
abiCatalog.reviewAfter = "2026-09-23T00:00:00Z";
abiCatalog.limitations = [
  "Each artifact is the current implementation/deployment ABI for the verified generation, not a historical implementation catalog.",
  "ABI support is limited to the current generation and must be reverified after upgrades or the review window.",
  "The catalog contains 30 accepted bootstrap/registry provenance review ABIs plus eighteen proposed emission evidence review/pool evidence review/institutional debt evidence review ABIs; record-level lifecycle and provenance govern use.",
];
await writeJson(join(contractsDirectory, "records", "abis.json"), abiCatalog);

const sourceCatalog = await json(join(contractsDirectory, "sources", "catalog.json"));
const evidenceRaw = await readFile(evidencePath, "utf8");
sourceCatalog.sources = [
  ...array(sourceCatalog.sources, "sources").filter(({ id }) => id !== sourceId),
  {
    id: sourceId,
    kind: "on-chain-explorer-executable-reproduction",
    reference: { moduleId: "contracts", resourceId: evidenceResourceId },
    sha256: sha256(evidenceRaw),
    retrievedAt: reproduction.verifiedAt,
    endpoints: ["https://api.explorer.mezo.org"],
    note: "Official explorer proxy/source/ABI captures, full activation histories, fixed-block state, and exact isolated executable reproductions for institutional Enclaves and EnclaveDebtManager.",
  },
];
sourceCatalog.sourceArtifacts = [
  ...array(sourceCatalog.sourceArtifacts, "sourceArtifacts").filter(
    ({ sourceId: id }) => id !== sourceId,
  ),
  ...reproductionRecords.map((source) => ({
    sourceId,
    path: `api/v2/smart-contracts/${string(source.address, "reproduction source address")}`,
    sha256: source.responseSha256,
  })),
];
const sourceScope = object(sourceCatalog.scope, "source scope");
sourceScope.sourceIds = [
  ...strings(sourceScope.sourceIds, "source IDs").filter((id) => id !== sourceId),
  sourceId,
];
sourceCatalog.verifiedAt = verifiedAt;
sourceCatalog.reviewAfter = "2026-09-23T00:00:00Z";
await writeJson(join(contractsDirectory, "sources", "catalog.json"), sourceCatalog);

const index = await json(join(contractsDirectory, "index.json"));
const indexScope = object(index.scope, "index.scope");
indexScope.contractIds = [
  ...strings(indexScope.contractIds, "contract IDs").filter((id) => !abiIds.has(id)),
  ...abiRecords.map(({ id }) => id),
];
const resources = array(index.resources, "index.resources");
for (const resource of resources) {
  if (resource.id === "contract-deployments")
    resource.recordIds = array(deploymentCatalog.records, "deployment records").map(({ id }) => id);
  if (resource.id === "contract-abis")
    resource.recordIds = array(abiCatalog.records, "ABI records").map(({ id }) => id);
  if (resource.id === "contract-sources")
    resource.recordIds = array(sourceCatalog.sources, "source records").map(({ id }) => id);
  if (resource.id === "contract-reference")
    resource.generatedFrom = [
      ...array(resource.generatedFrom, "contract reference generatedFrom").filter(
        ({ resourceId }) => resourceId !== evidenceResourceId,
      ),
      { moduleId: "contracts", resourceId: evidenceResourceId },
    ];
}
index.resources = [
  ...resources.filter(
    ({ id }) => id !== evidenceResourceId && !abiIds.has(String(id).replace(/^abi\./, "")),
  ),
  {
    id: evidenceResourceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/institutional-debt-contracts-2026-08-23.json",
    recordIds: observations.map(({ id }) => id),
    recordCollectionPointer: "/observations",
  },
  ...abiRecords.map(({ id }) => {
    const abiId = string(id, "ABI ID");
    return {
      id: `abi.${abiId}`,
      role: "artifact",
      kind: "contract-abi",
      path: `artifacts/abis/${abiId.replaceAll(".", "/")}.json`,
    };
  }),
];
index.verifiedAt = verifiedAt;
index.reviewAfter = "2026-09-23T00:00:00Z";
index.limitations = [
  "MDK registry support covers the accepted 30-contract, 55-deployment, 30-ABI baseline; eighteen later emission evidence review/pool evidence review/institutional debt evidence review identities, deployments, and ABIs remain proposed and pending qualified review.",
  "Open validity ranges and current implementation/deployment ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create reader, writer, route, protocol, or product support.",
];
await writeJson(join(contractsDirectory, "index.json"), index);

process.stdout.write(
  `${JSON.stringify({ contractIds: abiRecords.map(({ id }) => id), deploymentCount: array(deploymentCatalog.records, "deployments").length, abiCount: array(abiCatalog.records, "abis").length, blockNumber, blockHash }, null, 2)}\n`,
);
