import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const poolsDirectory = join(repositoryRoot, "knowledge", "protocols", "pools");
const evidenceResourceId = "contract-pool-probes-2026-08-23";
const sourceId = "pools-explorer-executable-reproductions";

const definitions = [
  [
    "mezo-earn.cl-factory",
    "CLFactory",
    "clFactory",
    ["pools", "concentrated-liquidity", "discovery"],
  ],
  [
    "mezo-earn.cl-pool-implementation",
    "CLPool implementation",
    "clPoolImplementation",
    ["pools", "concentrated-liquidity", "implementation"],
  ],
  [
    "mezo-earn.cl-swap-router",
    "CLSwapRouter",
    "clSwapRouter",
    ["pools", "concentrated-liquidity", "swaps"],
  ],
  [
    "mezo-earn.cl-position-manager",
    "NonfungiblePositionManager",
    "positionManager",
    ["pools", "concentrated-liquidity", "positions"],
  ],
  [
    "mezo-earn.cl-position-descriptor",
    "NonfungibleTokenPositionDescriptor",
    "positionDescriptor",
    ["pools", "concentrated-liquidity", "metadata"],
  ],
  [
    "incentives.cl-gauge-factory",
    "CLGaugeFactory",
    "clGaugeFactory",
    ["incentives", "gauges", "concentrated-liquidity"],
  ],
  [
    "incentives.cl-gauge-implementation",
    "CLGauge implementation",
    "clGaugeImplementation",
    ["incentives", "gauges", "concentrated-liquidity", "implementation"],
  ],
] as const;

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

async function loadJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function array(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  return value as JsonObject[];
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is not an object`);
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} is not a string`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(`${label} is not an array of strings`);
  }
  return value;
}

const topologyPath = join(poolsDirectory, "evidence", "mainnet-topology-2026-08-23.json");
const reproductionPath = join(poolsDirectory, "evidence", "source-reproduction-2026-08-23.json");
const topology = await loadJson(topologyPath);
const reproduction = await loadJson(reproductionPath);
const topologyScope = object(topology.scope, "topology.scope");
const topologyBlock = object(topology.block, "topology.block");
const roots = object(topology.roots, "topology.roots");
const reproductionRecords = array(reproduction.records, "reproduction.records");
const reproductionById = new Map(reproductionRecords.map((record) => [record.contractId, record]));
const verifiedAt = string(topology.verifiedAt, "topology.verifiedAt");
const evidenceBlockNumber = Number(topologyScope.blockNumber);
const evidenceBlockHash = string(topologyScope.blockHash, "topology.scope.blockHash");
const evidenceBlockTimestamp = string(
  topologyBlock.blockTimestamp,
  "topology.block.blockTimestamp",
);

const deploymentRecords: JsonObject[] = [];
const abiRecords: JsonObject[] = [];
const observations: JsonObject[] = [];

for (const [contractId, contractName, topologyRole, domains] of definitions) {
  const root = object(roots[topologyRole], `topology.roots.${topologyRole}`);
  const address = string(root.address, `${topologyRole}.address`);
  const creation = object(root.creation, `${topologyRole}.creation`);
  const runtime = object(root.runtime, `${topologyRole}.runtime`);
  const source = reproductionById.get(contractId);
  if (!source) fail(`missing reproduction record ${contractId}`);
  const sourceAbi = object(source.abi, `${contractId}.abi`);
  const reproduced = object(source.reproduction, `${contractId}.reproduction`);
  const explorerVerification = object(
    source.explorerVerification,
    `${contractId}.explorerVerification`,
  );
  const deploymentId = `${contractId}@mezo-mainnet`;
  const sourceContractName = string(source.name ?? root.explorerName, `${contractId}.sourceName`);
  const activation = {
    blockNumber: Number(creation.blockNumber),
    blockHash: string(creation.blockHash, `${contractId}.creation.blockHash`),
    blockTimestamp: string(creation.blockTimestamp, `${contractId}.creation.blockTimestamp`),
    blockEvidenceMethod: "official explorer transaction metadata and eth_getBlockByNumber",
    transactionHash: string(creation.transactionHash, `${contractId}.creation.transactionHash`),
  };
  const artifactComparison = {
    creationExecutableExact: true,
    runtimeExecutableExactAfterImmutableSubstitution: true,
    immutableSubstitutions: Number(reproduced.immutableSubstitutions),
    creationExecutableSha256: string(
      reproduced.creationExecutableSha256,
      `${contractId}.creationExecutableSha256`,
    ),
    runtimeExecutableSha256: string(
      reproduced.runtimeExecutableSha256,
      `${contractId}.runtimeExecutableSha256`,
    ),
    explorerFullRuntimeSha256: string(
      source.explorerRuntimeBytecodeSha256,
      `${contractId}.explorerRuntimeBytecodeSha256`,
    ),
    fullExact: false,
  };
  const evidenceReference = {
    moduleId: "contracts",
    resourceId: evidenceResourceId,
    recordId: `observe-${contractId.replaceAll(".", "-")}-mezo-mainnet`,
  };

  observations.push({
    id: evidenceReference.recordId,
    deploymentId,
    networkId: "mezo-mainnet",
    observedAt: verifiedAt,
    observationBlock: {
      number: evidenceBlockNumber,
      hash: evidenceBlockHash,
      timestamp: evidenceBlockTimestamp,
    },
    methods: [
      "eth_getBlockByNumber",
      "eth_getCode",
      "official explorer address and transaction metadata",
      "official explorer smart-contract source/ABI",
      "isolated exact-compiler Foundry reproduction",
    ],
    activation,
    runtime: {
      addressCodeSha256: string(runtime.codeSha256, `${contractId}.runtime.codeSha256`),
      implementationCodeSha256: null,
      artifactBytecodeComparison: artifactComparison,
    },
    proxy: null,
    explorer: {
      activeContract: {
        name: sourceContractName,
        filePath: string(source.filePath ?? source.explorerEndpoint, `${contractId}.filePath`),
        isVerified: explorerVerification.isVerified,
        isFullyVerified: explorerVerification.isFullyVerified,
        isPartiallyVerified: explorerVerification.isPartiallyVerified,
        compilerVersion: source.compilerVersion,
        proxyType: root.explorerProxyType ?? null,
        abiEntries: Number(sourceAbi.entryCount),
        abiSemanticSha256: sourceAbi.abiSemanticSha256,
        deployedBytecodeSha256: source.explorerRuntimeBytecodeSha256,
      },
      reproducedAbiMatch: true,
      rpcBytecodeMatch: source.explorerRuntimeBytecodeSha256 === runtime.codeSha256,
    },
    reproduction: {
      explorerVerification,
      sourceBundleSha256: source.sourceBundleSha256,
      compilerVersion: source.compilerVersion,
      compilerSettingsSha256: source.compilerSettingsSha256,
      librariesSha256: source.librariesSha256,
      buildProcedure: reproduced.procedure,
      creationExecutableMatch: true,
      runtimeExecutableMatch: true,
      fullBytecodeDifference: reproduced.fullBytecodeDifference,
      abiDerivedFromExactBuild: true,
      activationHistoryReference: evidenceReference,
    },
    outcome: "passed",
  });

  deploymentRecords.push({
    id: deploymentId,
    contractId,
    contractName,
    sourceContractName,
    protocol: contractId.startsWith("incentives.") ? "incentives" : "mezo-earn",
    domains,
    networkId: "mezo-mainnet",
    environment: "mainnet",
    address,
    provenanceClass: "deployed-executable-reproduction",
    contractType: "direct",
    validity: {
      deploymentFrom: activation,
      currentCodeFrom: activation,
      effectiveUntilExclusive: null,
    },
    proxy: null,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: contractId,
      },
      appliesTo: "deployment",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: sourceId,
      },
      artifactPath: `api/v2/smart-contracts/${address}`,
      declaredImplementationAddress: null,
    },
    runtime: {
      observedAt: verifiedAt,
      blockNumber: evidenceBlockNumber,
      blockHash: evidenceBlockHash,
      addressCodeSha256: runtime.codeSha256,
      implementationCodeSha256: null,
      artifactBytecodeComparison: artifactComparison,
    },
    provenanceEvidence: {
      reproduction: {
        explorerVerification,
        sourceBundleSha256: source.sourceBundleSha256,
        compilerVersion: source.compilerVersion,
        compilerSettingsSha256: source.compilerSettingsSha256,
        librariesSha256: source.librariesSha256,
        buildProcedure: reproduced.procedure,
        creationExecutableMatch: true,
        runtimeExecutableMatch: true,
        fullBytecodeDifference: reproduced.fullBytecodeDifference,
        abiDerivedFromExactBuild: true,
        activationHistoryReference: evidenceReference,
      },
    },
    evidenceReference,
    status: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "This record is point-in-time, proposed, and pending qualified Level 3 review; it creates no writer, route, or product support.",
      "Executable reproduction does not establish source authorship, repository history, or audit coverage.",
      ...(contractId === "mezo-earn.cl-position-descriptor"
        ? [
            "The official explorer label is partially verified and remains preserved despite executable reproduction.",
          ]
        : []),
      "An open validity range means no later replacement was observed through the evidence block, not that the direct deployment is immutable.",
    ],
  });

  abiRecords.push({
    id: contractId,
    contractId,
    provenanceClass: "deployed-executable-reproduction",
    intendedNetworkIds: ["mezo-mainnet"],
    artifactReference: { moduleId: "contracts", resourceId: `abi.${contractId}` },
    entryCount: Number(sourceAbi.entryCount),
    fileSha256: sourceAbi.fileSha256,
    abiSha256: sourceAbi.abiSha256,
    abiSemanticSha256: sourceAbi.abiSemanticSha256,
    sourceReference: { moduleId: "contracts", resourceId: "contract-sources", recordId: sourceId },
    sourceArtifacts: [
      {
        networkId: "mezo-mainnet",
        path: `api/v2/smart-contracts/${address}`,
        sha256: source.responseSha256,
      },
    ],
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "The full ABI is bound to the recorded official explorer response, exact compiler reproduction, and Mezo Mainnet deployment generation.",
      "ABI equality does not establish source authorship, audit coverage, or support; qualified Level 3 review remains pending.",
    ],
  });
}

const observationSet = {
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
    "Evidence is bounded to the recorded block, official explorer source responses, creation metadata, and exact reproduced executable generations.",
    "Executable equality does not establish source authorship, audit coverage, writer safety, or future deployment identity.",
  ],
  registryStatus: null,
  observedFrom: verifiedAt,
  observedThrough: verifiedAt,
  methodology: [
    "Resolve documented roots from current official Mezo pool documentation.",
    "Capture official explorer creation metadata and full source/ABI responses.",
    "Compile every source bundle independently with the exact recorded Solidity compiler and settings.",
    "Compare creation and runtime executable bytes, substituting only compiler-recorded immutables.",
    "Pin RPC code and root relationships at one Mezo Mainnet block.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: 31612,
      blockNumber: evidenceBlockNumber,
      blockHash: evidenceBlockHash,
      blockTimestamp: evidenceBlockTimestamp,
      rpcUrl: "https://mezo-mainnet.boar.network",
      explorerApiUrl: "https://api.explorer.mezo.org",
    },
  ],
  observations,
};
const evidencePath = join(contractsDirectory, "evidence", "pool-contracts-2026-08-23.json");
await writeJson(evidencePath, observationSet);

const deploymentCatalog = await loadJson(join(contractsDirectory, "records", "deployments.json"));
const deploymentIds = new Set(deploymentRecords.map(({ id }) => id));
deploymentCatalog.records = [
  ...array(deploymentCatalog.records, "deploymentCatalog.records").filter(
    ({ id }) => !deploymentIds.has(id),
  ),
  ...deploymentRecords,
];
deploymentCatalog.verifiedAt = verifiedAt;
deploymentCatalog.reviewAfter = "2026-09-23T00:00:00Z";
deploymentCatalog.limitations = [
  "Catalog verification is point-in-time and must be repeated after reviewAfter or before a protocol-sensitive release.",
  "Open deployment ranges mean no supersession was observed at the verification block; they do not assert immutability.",
  "Support is limited to the recorded validity ranges and must be reverified after upgrades or the review window.",
  "The catalog contains 55 accepted bootstrap/registry provenance review deployments plus fifteen proposed emission evidence review/pool evidence review deployments; record-level lifecycle and provenance govern use.",
];
await writeJson(join(contractsDirectory, "records", "deployments.json"), deploymentCatalog);

const abiCatalog = await loadJson(join(contractsDirectory, "records", "abis.json"));
const abiIds = new Set(abiRecords.map(({ id }) => id));
abiCatalog.records = [
  ...array(abiCatalog.records, "abiCatalog.records").filter(({ id }) => !abiIds.has(id)),
  ...abiRecords,
];
abiCatalog.verifiedAt = verifiedAt;
abiCatalog.reviewAfter = "2026-09-23T00:00:00Z";
abiCatalog.limitations = [
  "Each artifact is the current implementation/deployment ABI for the verified generation, not a historical implementation catalog.",
  "ABI support is limited to the current generation and must be reverified after upgrades or the review window.",
  "The catalog contains 30 accepted bootstrap/registry provenance review ABIs plus fifteen proposed emission evidence review/pool evidence review ABIs; record-level lifecycle and provenance govern use.",
];
await writeJson(join(contractsDirectory, "records", "abis.json"), abiCatalog);

const sourceCatalog = await loadJson(join(contractsDirectory, "sources", "catalog.json"));
const contractEvidenceRaw = await readFile(evidencePath, "utf8");
sourceCatalog.sources = [
  ...array(sourceCatalog.sources, "sourceCatalog.sources").filter(({ id }) => id !== sourceId),
  {
    id: sourceId,
    kind: "on-chain-explorer-executable-reproduction",
    reference: { moduleId: "contracts", resourceId: evidenceResourceId },
    sha256: sha256(contractEvidenceRaw),
    retrievedAt: string(reproduction.verifiedAt, "reproduction.verifiedAt"),
    endpoints: ["https://api.explorer.mezo.org"],
    note: "Official explorer creation/source/ABI captures, fixed-block runtime relationships, and exact isolated executable reproductions for the seven documented Mezo Mainnet CL roots.",
  },
];
const sourceIds: ReadonlySet<string> = new Set(definitions.map(([contractId]) => contractId));
sourceCatalog.sourceArtifacts = [
  ...array(sourceCatalog.sourceArtifacts, "sourceCatalog.sourceArtifacts").filter(
    ({ sourceId: artifactSourceId, path }) =>
      artifactSourceId !== sourceId && (typeof path !== "string" || !sourceIds.has(path)),
  ),
  ...reproductionRecords.map((source) => ({
    sourceId,
    path: `api/v2/smart-contracts/${string(source.address, "reproduction address")}`,
    sha256: source.responseSha256,
  })),
];
const sourceScope = object(sourceCatalog.scope, "sourceCatalog.scope");
sourceScope.sourceIds = [
  ...strings(sourceScope.sourceIds, "sourceCatalog.scope.sourceIds").filter(
    (id) => id !== sourceId,
  ),
  sourceId,
];
sourceCatalog.verifiedAt = verifiedAt;
sourceCatalog.reviewAfter = "2026-09-23T00:00:00Z";
await writeJson(join(contractsDirectory, "sources", "catalog.json"), sourceCatalog);

const index = await loadJson(join(contractsDirectory, "index.json"));
const scope = object(index.scope, "contracts index scope");
scope.contractIds = [
  ...strings(scope.contractIds, "contracts index contract IDs").filter((id) => !abiIds.has(id)),
  ...abiRecords.map(({ id }) => id),
];
const resources = array(index.resources, "contracts index resources");
for (const resource of resources) {
  if (resource.id === "contract-deployments")
    resource.recordIds = array(deploymentCatalog.records, "deployment records").map(({ id }) => id);
  if (resource.id === "contract-abis")
    resource.recordIds = array(abiCatalog.records, "ABI records").map(({ id }) => id);
  if (resource.id === "contract-sources")
    resource.recordIds = array(sourceCatalog.sources, "source records").map(({ id }) => id);
  if (resource.id === "contract-reference") {
    const generatedFrom = Array.isArray(resource.generatedFrom)
      ? (resource.generatedFrom as JsonObject[])
      : [];
    resource.generatedFrom = [
      ...generatedFrom.filter(({ resourceId }) => resourceId !== evidenceResourceId),
      { moduleId: "contracts", resourceId: evidenceResourceId },
    ];
  }
}
index.resources = [
  ...resources.filter(
    ({ id }) => id !== evidenceResourceId && !abiIds.has(String(id).replace(/^abi\./, "")),
  ),
  {
    id: evidenceResourceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/pool-contracts-2026-08-23.json",
    recordIds: observations.map(({ id }) => id),
    recordCollectionPointer: "/observations",
  },
  ...abiRecords.map(({ id }) => ({
    id: `abi.${string(id, "ABI ID")}`,
    role: "artifact",
    kind: "contract-abi",
    path:
      object(abiRecords.find((record) => record.id === id)?.artifactReference, "artifactReference")
        .resourceId === `abi.${string(id, "ABI ID")}`
        ? `artifacts/abis/${String(id).replaceAll(".", "/")}.json`
        : fail("ABI reference mismatch"),
  })),
];
index.verifiedAt = verifiedAt;
index.reviewAfter = "2026-09-23T00:00:00Z";
index.limitations = [
  "MDK registry support covers the accepted 30-contract, 55-deployment, 30-ABI baseline; fifteen later emission evidence review/pool evidence review identities, deployments, and ABIs remain proposed and pending qualified review.",
  "Open validity ranges and current implementation/deployment ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create writer, route, protocol, or product support.",
];
await writeJson(join(contractsDirectory, "index.json"), index);

process.stdout.write(
  JSON.stringify(
    {
      contractIds: abiRecords.map(({ id }) => id),
      deploymentCount: array(deploymentCatalog.records, "deployment records").length,
      abiCount: array(abiCatalog.records, "ABI records").length,
      evidenceBlockNumber,
      evidenceBlockHash,
    },
    null,
    2,
  ) + "\n",
);
