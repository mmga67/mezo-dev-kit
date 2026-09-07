import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, text, texts, type JsonObject } from "./lib/json.ts";

interface CaptureArtifact {
  path: string;
  sha256: string;
}

interface PriceCapture {
  capturedAt: string;
  officialClient: {
    repository: string;
    commit: string;
    tag: string;
    artifacts: CaptureArtifact[];
  };
  officialDocumentation: {
    repository: string;
    commit: string;
    artifacts: CaptureArtifact[];
  };
  observations: Record<string, JsonObject>;
  explorer: Record<string, JsonObject>;
  expected: JsonObject;
}

const [capturePath] = process.argv.slice(2);
if (!capturePath) {
  throw new Error("usage: node scripts/import-price-contract-records.ts <capture-json>");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const evidenceResourceId = "contract-oracle-probes-2026-08-23";
const evidencePath = join(contractsDirectory, "evidence", "oracle-contracts-2026-08-23.json");
const skipSourceId = "official-mezod-price-oracle-v12";
const pythSourceId = "oracle-pyth-live-configuration";
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const capture = await json<PriceCapture>(capturePath);
const capturedAt = text(capture.capturedAt, "capturedAt");
const reviewAfter = "2026-08-26T16:00:00.000Z";
const skipAbiPath = join(contractsDirectory, "artifacts", "abis", "oracle", "skip-btc-usd.json");
const pythAbiPath = join(contractsDirectory, "artifacts", "abis", "oracle", "pyth-price-feed.json");
const skipAbi = await jsonArray(skipAbiPath);
const pythAbi = await jsonArray(pythAbiPath);
const skipAbiBytes = await readFile(skipAbiPath);
const pythAbiBytes = await readFile(pythAbiPath);
const clientArtifacts = new Map<string, string>(
  capture.officialClient.artifacts.map((artifact) => [artifact.path, artifact.sha256]),
);

const skipAbiRecord = makeAbiRecord({
  contractId: "oracle.skip-btc-usd",
  provenanceClass: "official-client-precompile-source",
  abi: skipAbi,
  bytes: skipAbiBytes,
  sourceId: skipSourceId,
  sourceArtifacts: [
    {
      networkIds: ["mezo-mainnet", "mezo-testnet"],
      version: "v12.0.0/price-oracle-v1",
      path: "precompile/priceoracle/abi.json",
      sha256: requiredDigest(clientArtifacts, "precompile/priceoracle/abi.json"),
    },
  ],
  limitations: [
    "The ABI is the complete official PriceOracle precompile v1 surface: decimals() and latestRoundData(); it is not a full Chainlink Aggregator interface.",
    "The ABI and deployments remain proposed pending qualified Level 3 review and create no feed updater or writer support.",
  ],
});
const pythAbiRecord = makeAbiRecord({
  contractId: "oracle.pyth-price-feed",
  provenanceClass: "official-deployment-repository-live-configuration",
  abi: pythAbi,
  bytes: pythAbiBytes,
  sourceId: pythSourceId,
  sourceArtifacts: [
    {
      networkIds: ["mezo-mainnet", "mezo-testnet"],
      version: "current-implementation-through-proxy-at-capture",
      path: "effective-abi/mainnet-verified-testnet-runtime-match",
      sha256: sha256(pythAbiBytes),
    },
  ],
  limitations: [
    "The effective ABI derives from the fully verified mainnet PythUpgradable implementation and is scoped to the identical implementation address and runtime digest observed on testnet.",
    "A provider-announced upgrade is scheduled for 2026-08-26 16:00 UTC; the proxy, implementation, ABI, and feeds require re-observation after that boundary.",
    "The ABI and deployments remain proposed pending qualified Level 3 review and create no updater, credential, or writer support.",
  ],
});
const abiRecords = [skipAbiRecord, pythAbiRecord];

const deploymentRecords: JsonObject[] = [];
const observations: JsonObject[] = [];
for (const networkId of ["mezo-mainnet", "mezo-testnet"] as const) {
  const network = object(capture.observations[networkId], `observations.${networkId}`);
  const contracts = object(network.contracts, `${networkId}.contracts`);
  const currentBlock = object(network.block, `${networkId}.block`);
  const activations = object(network.activations, `${networkId}.activations`);
  const explorer = object(capture.explorer[networkId], `explorer.${networkId}`);
  const environment = networkId === "mezo-mainnet" ? "mainnet" : "testnet";

  const skip = object(contracts.skipBtcUsd, `${networkId}.skip`);
  const skipActivation = precompileActivation(
    object(activations.skip, `${networkId}.skipActivation`),
  );
  const skipDeploymentId = `oracle.skip-btc-usd@${networkId}`;
  const skipEvidenceReference = {
    moduleId: "contracts",
    resourceId: evidenceResourceId,
    recordId: `observe-oracle-skip-btc-usd-${networkId}`,
  };
  const skipExplorer = object(explorer.skip, `${networkId}.explorer.skip`);
  const skipClientEvidence = {
    clientRepository: capture.officialClient.repository,
    commit: capture.officialClient.commit,
    release: capture.officialClient.tag,
    liveClientGeneration: "Mezod/12.0.0 PriceOracle precompile version 1",
    interfaceSha256: requiredDigest(clientArtifacts, "precompile/priceoracle/IPriceOracle.sol"),
    fixedBlockReference: skipEvidenceReference,
    activationBoundaryReference: skipEvidenceReference,
    nodeVersionEvidenceReference: skipEvidenceReference,
  };
  const skipObservation = {
    id: skipEvidenceReference.recordId,
    deploymentId: skipDeploymentId,
    networkId,
    observedAt: capturedAt,
    observationBlock: {
      number: currentBlock.number,
      hash: currentBlock.hash,
      timestamp: currentBlock.timestamp,
    },
    methods: [
      "official mezod v12 source and ABI pin",
      "official genesis/upgrade activation source",
      "official explorer activation-block metadata",
      "eth_getCode at the fixed block",
      "eth_call decimals() and latestRoundData() at the fixed block",
      "official explorer smart-contract metadata",
    ],
    activation: skipActivation,
    runtime: {
      addressCodeSha256: skip.codeSha256,
      implementationCodeSha256: null,
      officialWrapperBytecodeSourceSha256: requiredDigest(
        clientArtifacts,
        "precompile/priceoracle/byte_code.go",
      ),
    },
    proxy: null,
    explorer: {
      activeContract: explorerContract(
        skipExplorer,
        text(skipAbiRecord.abiSemanticSha256, "Skip ABI semantic digest"),
        text(skip.codeSha256, `${networkId} Skip code digest`),
      ),
      officialArtifactAbiMatch: true,
      rpcBytecodeMatch: true,
      verificationLabelPreserved: true,
    },
    outcome: "passed",
  };
  observations.push(skipObservation);
  deploymentRecords.push({
    id: skipDeploymentId,
    contractId: "oracle.skip-btc-usd",
    contractName: "Skip BTC/USD Price Oracle",
    sourceContractName: "IPriceOracle",
    protocol: "mezo-skip-connect",
    domains: ["prices", "oracles", "btc-usd", "precompile"],
    networkId,
    environment,
    address: skip.address,
    provenanceClass: "official-client-precompile-source",
    contractType: "precompile",
    validity: {
      deploymentFrom: skipActivation,
      currentCodeFrom: skipActivation,
      effectiveUntilExclusive: null,
    },
    proxy: null,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: "oracle.skip-btc-usd",
      },
      appliesTo: "deployment",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: skipSourceId,
      },
      artifactPath: "precompile/priceoracle/price_oracle.go",
      declaredImplementationAddress: null,
    },
    runtime: {
      observedAt: capturedAt,
      blockNumber: currentBlock.number,
      blockHash: currentBlock.hash,
      addressCodeSha256: skip.codeSha256,
      implementationCodeSha256: null,
    },
    provenanceEvidence: { clientPrecompile: skipClientEvidence },
    evidenceReference: skipEvidenceReference,
    status: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "This is a proposed read-only precompile identity pending qualified Level 3 review; it enables no updater or writer.",
      "The two-method interface must not be treated as a full Chainlink Aggregator interface; description() is unsupported and answeredInRound was zero at the evidence block.",
      "The open validity range means no later precompile generation was observed through the evidence block, not that chain code or oracle state is immutable.",
    ],
  });

  const pyth = object(contracts.pyth, `${networkId}.pyth`);
  const pythActivationRaw = object(activations.pyth, `${networkId}.pythActivation`);
  const pythActivation = contractActivation(pythActivationRaw);
  const pythDeploymentId = `oracle.pyth-price-feed@${networkId}`;
  const pythEvidenceReference = {
    moduleId: "contracts",
    resourceId: evidenceResourceId,
    recordId: `observe-oracle-pyth-price-feed-${networkId}`,
  };
  const pythExplorer = object(
    explorer.pythImplementation,
    `${networkId}.explorer.pythImplementation`,
  );
  const proxyExplorer = object(explorer.pythProxy, `${networkId}.explorer.pythProxy`);
  const proxyMetadata = {
    standard: "eip-1967-uups",
    implementationSlot,
    adminSlot: null,
    adminAddress: null,
    currentImplementationAddress: pyth.implementation,
    implementationHistory: [
      {
        implementationAddress: pyth.implementation,
        effectiveFrom: pythActivation,
        effectiveUntilExclusive: null,
      },
    ],
  };
  observations.push({
    id: pythEvidenceReference.recordId,
    deploymentId: pythDeploymentId,
    networkId,
    observedAt: capturedAt,
    observationBlock: {
      number: currentBlock.number,
      hash: currentBlock.hash,
      timestamp: currentBlock.timestamp,
    },
    methods: [
      "official Mezo oracle deployment documentation pin",
      "official explorer creation transaction and activation-block metadata",
      "eth_getCode at proxy and implementation",
      "eth_getStorageAt EIP-1967 implementation slot",
      "official explorer proxy and implementation metadata",
      "mainnet verified implementation ABI with cross-network runtime identity",
    ],
    activation: pythActivation,
    runtime: {
      addressCodeSha256: pyth.codeSha256,
      implementationCodeSha256: pyth.implementationCodeSha256,
    },
    proxy: proxyMetadata,
    explorer: {
      activeContract: explorerContract(
        pythExplorer,
        networkId === "mezo-mainnet"
          ? text(pythAbiRecord.abiSemanticSha256, "Pyth ABI semantic digest")
          : null,
        text(pyth.implementationCodeSha256, `${networkId} Pyth implementation code digest`),
      ),
      proxyContract: explorerContract(
        proxyExplorer,
        null,
        text(pyth.codeSha256, `${networkId} Pyth proxy code digest`),
      ),
      officialArtifactAbiMatch: networkId === "mezo-mainnet",
      rpcBytecodeMatch: true,
      crossNetworkImplementationRuntimeMatch: true,
    },
    outcome: "passed",
  });
  deploymentRecords.push({
    id: pythDeploymentId,
    contractId: "oracle.pyth-price-feed",
    contractName: "Pyth Price Feed",
    sourceContractName: "PythUpgradable",
    protocol: "pyth-core",
    domains: ["prices", "oracles", "pushed-feeds", "pyth"],
    networkId,
    environment,
    address: pyth.address,
    provenanceClass: "official-deployment-repository-live-configuration",
    contractType: "erc1967-proxy",
    validity: {
      deploymentFrom: pythActivation,
      currentCodeFrom: pythActivation,
      effectiveUntilExclusive: null,
    },
    proxy: proxyMetadata,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: "oracle.pyth-price-feed",
      },
      appliesTo: "current-implementation-through-proxy",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: pythSourceId,
      },
      artifactPath: "configuration/read-oracle-and-live-proxy",
      declaredImplementationAddress: pyth.implementation,
    },
    runtime: {
      observedAt: capturedAt,
      blockNumber: currentBlock.number,
      blockHash: currentBlock.hash,
      addressCodeSha256: pyth.codeSha256,
      implementationCodeSha256: pyth.implementationCodeSha256,
    },
    provenanceEvidence: {
      liveConfiguration: {
        deploymentRepository: capture.officialDocumentation.repository,
        commit: capture.officialDocumentation.commit,
        deploymentArtifactPath:
          "src/content/docs/docs/developers/architecture/oracles/read-oracle.md",
        deploymentArtifactSha256: (
          capture.officialDocumentation.artifacts[0] ??
          fail("official documentation artifact is missing")
        ).sha256,
        configurationReference: {
          moduleId: "prices",
          resourceId: "price-fixed-block-observations-2026-08-23",
          recordId: `observe-pyth-${networkId}`,
        },
        activationHistoryReference: pythEvidenceReference,
        networkEvidenceReference: {
          moduleId: "prices",
          resourceId: "price-fixed-block-observations-2026-08-23",
          recordId: `observe-pyth-${networkId}`,
        },
      },
    },
    evidenceReference: pythEvidenceReference,
    status: "verified-current",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: [
      "This proxy identity is proposed pending qualified Level 3 review; it enables no price updater, credential, subscription, or writer.",
      "Testnet source is unverified in the explorer; its effective ABI is bounded to the matching proxy, implementation address, and implementation runtime digest observed on both networks.",
      "The provider-announced 2026-08-26 16:00 UTC upgrade requires a new proxy, implementation, ABI, and feed observation before any current-support claim.",
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
  verifiedAt: capturedAt,
  reviewAfter,
  scope: {
    networkIds: ["mezo-mainnet", "mezo-testnet"],
    deploymentIds: deploymentRecords.map(({ id }) => text(id, "deployment ID")),
  },
  limitations: [
    "Evidence is bounded to the pinned blocks, official source/documentation commits, explorer metadata, and exact live bytecode/slot observations.",
    "Skip explorer wrappers are partially verified and testnet Pyth source is unverified; those labels are preserved instead of upgraded by inference.",
    "A Pyth upgrade is announced for 2026-08-26 16:00 UTC, so all current proxy and implementation observations require a post-boundary refresh.",
  ],
  registryStatus: null,
  observedFrom: capturedAt,
  observedThrough: capturedAt,
  methodology: [
    "Pin the official Mezo oracle guide and the live mezod v12 PriceOracle source.",
    "Resolve Pyth creation transactions and activation blocks through official explorers.",
    "Pin current network blocks and query live bytecode on each network.",
    "Resolve the Pyth EIP-1967 implementation slot and implementation bytecode.",
    "Compare Skip official ABI with both explorer wrapper ABIs.",
    "Preserve explorer verification labels exactly and retain the scheduled-upgrade review gate.",
  ],
  networkSnapshots: ["mezo-mainnet", "mezo-testnet"].map((networkId) => {
    const network = object(capture.observations[networkId], `${networkId} observation`);
    const block = object(network.block, `${networkId} observation block`);
    return {
      networkId,
      evmChainId: network.chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      rpcUrl: network.rpcUrl,
      explorerApiUrl: network.explorerApiUrl,
    };
  }),
  observations,
};
await writeJson(evidencePath, evidence);

const pythConfigurationSha256 = sha256(
  JSON.stringify({
    documentation: capture.officialDocumentation,
    proxy: {
      mainnet: object(capture.explorer["mezo-mainnet"], "mainnet explorer").pythProxy,
      testnet: object(capture.explorer["mezo-testnet"], "testnet explorer").pythProxy,
    },
    implementation: capture.expected.pythImplementation,
  }),
);

const deploymentCatalog = await json<JsonObject>(
  join(contractsDirectory, "records", "deployments.json"),
);
const deploymentIds = new Set(deploymentRecords.map(({ id }) => text(id, "deployment ID")));
deploymentCatalog.records = [
  ...objects(deploymentCatalog.records, "deployment records").filter(
    ({ id }) => !deploymentIds.has(text(id, "deployment ID")),
  ),
  ...deploymentRecords,
];
deploymentCatalog.verifiedAt = capturedAt;
deploymentCatalog.limitations = replaceCountNote(
  texts(deploymentCatalog.limitations, "deployment limitations"),
  "The catalog contains 55 accepted bootstrap/registry provenance review deployments plus twenty-two proposed emission evidence review/pool evidence review/institutional debt evidence review/oracle evidence review deployments; record-level lifecycle and provenance govern use.",
);
await writeJson(join(contractsDirectory, "records", "deployments.json"), deploymentCatalog);

const abiCatalog = await json<JsonObject>(join(contractsDirectory, "records", "abis.json"));
const abiIds = new Set(abiRecords.map(({ id }) => text(id, "ABI ID")));
abiCatalog.records = [
  ...objects(abiCatalog.records, "ABI records").filter(({ id }) => !abiIds.has(text(id, "ABI ID"))),
  ...abiRecords,
];
abiCatalog.verifiedAt = capturedAt;
abiCatalog.limitations = replaceCountNote(
  texts(abiCatalog.limitations, "ABI limitations"),
  "The catalog contains 30 accepted bootstrap/registry provenance review ABIs plus twenty proposed emission evidence review/pool evidence review/institutional debt evidence review/oracle evidence review ABIs; record-level lifecycle and provenance govern use.",
);
await writeJson(join(contractsDirectory, "records", "abis.json"), abiCatalog);

const sourceCatalog = await json<JsonObject>(join(contractsDirectory, "sources", "catalog.json"));
const evidenceBytes = await readFile(evidencePath);
const newSources = [
  {
    id: skipSourceId,
    kind: "official-client-precompile-source",
    repository: capture.officialClient.repository,
    commit: capture.officialClient.commit,
    note: "Official mezod v12 PriceOracle precompile v1 source, interface, ABI, wrapper bytecode, and activation configuration.",
  },
  {
    id: pythSourceId,
    kind: "on-chain-and-verified-explorer-observation",
    reference: { moduleId: "contracts", resourceId: evidenceResourceId },
    sha256: sha256(evidenceBytes),
    retrievedAt: capturedAt,
    endpoints: ["https://api.explorer.mezo.org", "https://api.explorer.test.mezo.org"],
    note: "Official Mezo deployment documentation plus mainnet verified-source and cross-network runtime/slot observations for the current Pyth proxy generation.",
  },
];
const sourceIds = new Set(newSources.map(({ id }) => id));
sourceCatalog.sources = [
  ...objects(sourceCatalog.sources, "sources").filter(
    ({ id }) => !sourceIds.has(text(id, "source ID")),
  ),
  ...newSources,
];
const newArtifacts = [
  ...capture.officialClient.artifacts.map((artifact) => ({
    sourceId: skipSourceId,
    path: artifact.path,
    sha256: artifact.sha256,
  })),
  {
    sourceId: pythSourceId,
    path: "configuration/read-oracle-and-live-proxy",
    sha256: pythConfigurationSha256,
  },
  {
    sourceId: pythSourceId,
    path: "effective-abi/mainnet-verified-testnet-runtime-match",
    sha256: sha256(pythAbiBytes),
  },
];
sourceCatalog.sourceArtifacts = [
  ...objects(sourceCatalog.sourceArtifacts, "source artifacts").filter(
    ({ sourceId }) => !sourceIds.has(text(sourceId, "source artifact source ID")),
  ),
  ...newArtifacts,
];
const sourceScope = object(sourceCatalog.scope, "source scope");
sourceScope.sourceIds = objects(sourceCatalog.sources, "sources").map(({ id }) =>
  text(id, "source ID"),
);
sourceCatalog.verifiedAt = capturedAt;
await writeJson(join(contractsDirectory, "sources", "catalog.json"), sourceCatalog);

const index = await json<JsonObject>(join(contractsDirectory, "index.json"));
const indexScope = object(index.scope, "index.scope");
indexScope.contractIds = [
  ...texts(indexScope.contractIds, "contract IDs").filter((id) => !abiIds.has(id)),
  ...abiRecords.map(({ id }) => text(id, "ABI ID")),
];
const resources = objects(index.resources, "index.resources").filter(
  ({ id }) => id !== evidenceResourceId && !abiIds.has(String(id).replace(/^abi\./, "")),
);
for (const resource of resources) {
  if (resource.id === "contract-deployments") {
    resource.recordIds = objects(deploymentCatalog.records, "deployment records").map(({ id }) =>
      text(id, "deployment ID"),
    );
  }
  if (resource.id === "contract-abis") {
    resource.recordIds = objects(abiCatalog.records, "ABI records").map(({ id }) =>
      text(id, "ABI ID"),
    );
  }
  if (resource.id === "contract-sources") {
    resource.recordIds = objects(sourceCatalog.sources, "source records").map(({ id }) =>
      text(id, "source ID"),
    );
  }
  if (resource.id === "contract-reference") {
    resource.generatedFrom = [
      ...objects(resource.generatedFrom, "contract reference inputs").filter(
        ({ resourceId }) => resourceId !== evidenceResourceId,
      ),
      { moduleId: "contracts", resourceId: evidenceResourceId },
    ];
  }
}
index.resources = [
  ...resources,
  {
    id: evidenceResourceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/oracle-contracts-2026-08-23.json",
    recordIds: observations.map(({ id }) => text(id, "observation ID")),
    recordCollectionPointer: "/observations",
  },
  {
    id: "abi.oracle.skip-btc-usd",
    role: "artifact",
    kind: "contract-abi",
    path: "artifacts/abis/oracle/skip-btc-usd.json",
  },
  {
    id: "abi.oracle.pyth-price-feed",
    role: "artifact",
    kind: "contract-abi",
    path: "artifacts/abis/oracle/pyth-price-feed.json",
  },
];
index.verifiedAt = capturedAt;
index.limitations = replaceCountNote(
  texts(index.limitations, "index limitations"),
  "MDK registry support covers the accepted 30-contract, 55-deployment, 30-ABI baseline; twenty later emission evidence review/pool evidence review/institutional debt evidence review/oracle evidence review identities/ABIs and twenty-two deployments remain proposed and pending qualified review.",
);
await writeJson(join(contractsDirectory, "index.json"), index);

process.stdout.write(
  `${JSON.stringify(
    {
      contractIds: abiRecords.map(({ id }) => id),
      deployments: deploymentRecords.length,
      observations: observations.length,
      sources: newSources.length,
    },
    null,
    2,
  )}\n`,
);

function makeAbiRecord(input: {
  contractId: string;
  provenanceClass: string;
  abi: JsonObject[];
  bytes: Buffer;
  sourceId: string;
  sourceArtifacts: JsonObject[];
  limitations: string[];
}): JsonObject {
  return {
    id: input.contractId,
    contractId: input.contractId,
    provenanceClass: input.provenanceClass,
    intendedNetworkIds: ["mezo-mainnet", "mezo-testnet"],
    artifactReference: { moduleId: "contracts", resourceId: `abi.${input.contractId}` },
    entryCount: input.abi.length,
    fileSha256: sha256(input.bytes),
    abiSha256: sha256(JSON.stringify(canonicalize(input.abi))),
    abiSemanticSha256: abiSemanticDigest(input.abi),
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: input.sourceId,
    },
    sourceArtifacts: input.sourceArtifacts,
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations: input.limitations,
  };
}

function precompileActivation(value: JsonObject): JsonObject {
  const block = object(value.block, "precompile activation block");
  return {
    blockNumber: block.number,
    transactionHash: null,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    activationKind: value.kind,
    release: value.release,
    blockEvidenceMethod: "official client activation source plus official explorer block metadata",
  };
}

function contractActivation(value: JsonObject): JsonObject {
  const block = object(value.block, "contract activation block");
  const transaction = object(value.transaction, "contract activation transaction");
  return {
    blockNumber: block.number,
    transactionHash: value.transactionHash,
    transactionIndex: transaction.transactionIndex,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    blockEvidenceMethod: "official explorer creation transaction and block metadata",
  };
}

function explorerContract(
  value: JsonObject,
  abiSemanticSha256: string | null,
  deployedBytecodeSha256: string,
): JsonObject {
  return {
    name: value.name,
    isVerified: value.isVerified,
    isFullyVerified: value.isFullyVerified,
    isPartiallyVerified: value.isPartiallyVerified,
    compilerVersion: value.compilerVersion,
    proxyType: value.proxyType,
    abiEntries: Array.isArray(value.abi) ? value.abi.length : 0,
    abiSemanticSha256,
    deployedBytecodeSha256,
  };
}

function replaceCountNote(values: string[], replacement: string): string[] {
  const retained = values.filter(
    (value) =>
      typeof value !== "string" ||
      (!value.startsWith("The catalog contains ") &&
        !value.startsWith("MDK registry support covers ")),
  );
  return [...retained, replacement];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as JsonObject)[key])]),
    );
  }
  return value;
}

function abiSemanticDigest(abi: JsonObject[]): string {
  const entries = abi.map((entry) => JSON.stringify(canonicalize(entry))).sort();
  return sha256(JSON.stringify(entries));
}

function requiredDigest(artifacts: Map<string, string>, path: string): string {
  const digest = artifacts.get(path);
  if (typeof digest !== "string") throw new Error(`missing official client artifact ${path}`);
  return digest;
}

async function json<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function jsonArray(path: string): Promise<JsonObject[]> {
  return objects(parseJson(await readFile(path, "utf8"), path), path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(message: string): never {
  throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
