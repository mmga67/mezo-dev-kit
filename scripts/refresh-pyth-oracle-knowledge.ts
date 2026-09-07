import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { object, objects, parseJson, text, texts, type JsonObject } from "./lib/json.ts";

const [capturePath] = process.argv.slice(2);
if (!capturePath) {
  throw new Error("usage: node scripts/refresh-pyth-oracle-knowledge.ts <capture-json>");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const pricesDirectory = join(repositoryRoot, "knowledge", "prices");
const capturedAtBoundary = Date.parse("2026-08-26T16:00:00.000Z");
const staleSelector = "0x19abf40e";
const newContractEvidenceId = "contract-oracle-probes-2026-08-27";
const newPriceEvidenceId = "price-fixed-block-observations-2026-08-27";
const pythSourceId = "oracle-pyth-live-configuration";
const pythContractId = "oracle.pyth-price-feed";
const pythAbiPath = join(contractsDirectory, "artifacts", "abis", "oracle", "pyth-price-feed.json");
const networkIds = ["mezo-mainnet", "mezo-testnet"] as const;

const capture = object(parseJson(await readFile(capturePath, "utf8"), capturePath), capturePath);
const capturedAt = text(capture.capturedAt, "capture timestamp");
const capturedAtMilliseconds = Date.parse(capturedAt);
assert(
  Number.isFinite(capturedAtMilliseconds) && capturedAtMilliseconds > capturedAtBoundary,
  "capture must be after the Pyth upgrade boundary",
);
const reviewAfter = new Date(capturedAtMilliseconds + 7 * 24 * 60 * 60 * 1_000).toISOString();
const expected = object(capture.expected, "capture expectations");
assert(
  text(expected.currentPythVersion, "expected Pyth version") === "1.4.6",
  "Pyth version drifted",
);
assert(
  text(expected.staleSelector, "expected stale selector") === staleSelector,
  "stale selector drifted",
);
const officialPyth = object(capture.officialPyth, "official Pyth source");
assert(
  text(officialPyth.version, "official Pyth version") === "1.4.6",
  "official Pyth source version drifted",
);
assert(
  text(officialPyth.releaseCommit, "official Pyth release commit") ===
    "d657d97eddaeb8984ee197fc60349dc176d98787",
  "official Pyth 1.4.6 release commit drifted",
);
const officialPythArtifacts = objects(officialPyth.artifacts, "official Pyth artifacts");
const pythArtifactDigests = new Map(
  officialPythArtifacts.map((artifact) => [
    text(artifact.path, "official Pyth artifact path"),
    text(artifact.sha256, "official Pyth artifact digest"),
  ]),
);

const capturedObservations = object(capture.observations, "capture observations");
const capturedExplorer = object(capture.explorer, "capture explorer metadata");
const networkCaptures = new Map(
  networkIds.map((networkId) => {
    const network = object(capturedObservations[networkId], `${networkId} observation`);
    const contracts = object(network.contracts, `${networkId} contracts`);
    const pyth = object(contracts.pyth, `${networkId} legacy Pyth`);
    const history = objects(pyth.implementationHistory, `${networkId} Pyth history`);
    assert(history.length === 2, `${networkId} must have exactly two Pyth generations`);
    assert(
      text(pyth.version, `${networkId} Pyth version`) === "1.4.6",
      `${networkId} Pyth version drifted`,
    );
    const currentHistory = history[1] ?? fail(`${networkId} current Pyth history is missing`);
    assert(
      text(currentHistory.implementationAddress, `${networkId} current implementation`) ===
        text(pyth.implementation, `${networkId} implementation slot address`),
      `${networkId} current history and implementation slot differ`,
    );
    const effectiveFrom = object(
      currentHistory.effectiveFrom,
      `${networkId} current implementation boundary`,
    );
    assert(
      Date.parse(text(effectiveFrom.blockTimestamp, `${networkId} upgrade timestamp`)) >
        capturedAtBoundary,
      `${networkId} implementation upgrade preceded the announced boundary`,
    );
    const explorer = object(capturedExplorer[networkId], `${networkId} explorer metadata`);
    return [networkId, { network, contracts, pyth, history, explorer }] as const;
  }),
);

const mainnetExplorer =
  networkCaptures.get("mezo-mainnet")?.explorer ?? fail("mainnet capture missing");
const testnetExplorer =
  networkCaptures.get("mezo-testnet")?.explorer ?? fail("testnet capture missing");
const mainnetAbiSource = object(
  mainnetExplorer.providerUpgradedPythImplementation,
  "mainnet provider-upgraded Pyth implementation",
);
const testnetAbiSource = object(
  testnetExplorer.providerUpgradedPythImplementation,
  "testnet provider-upgraded Pyth implementation",
);
const capturedMainnetAbi = objects(mainnetAbiSource.abi, "mainnet provider-upgraded Pyth ABI");
const capturedTestnetAbi = objects(testnetAbiSource.abi, "testnet provider-upgraded Pyth ABI");
assert(
  JSON.stringify(capturedMainnetAbi) === JSON.stringify(capturedTestnetAbi),
  "provider-upgraded Pyth ABIs differ across Mezo networks",
);
assert(
  mainnetAbiSource.isFullyVerified === true && testnetAbiSource.isFullyVerified === true,
  "provider-upgraded Pyth ABI sources must be fully explorer-verified",
);
const pythAbi = objects(parseJson(await readFile(pythAbiPath, "utf8"), pythAbiPath), pythAbiPath);
assert(
  JSON.stringify(pythAbi) === JSON.stringify(capturedMainnetAbi),
  "imported Pyth ABI differs from the verified post-upgrade generation",
);
assert(
  pythAbi.some(({ name }) => name === "parsePriceFeedUpdatesWithConfig") &&
    !pythAbi.some(({ name }) => name === "parsePriceFeedUpdatesWithSlotsStrict"),
  "post-upgrade Pyth ABI generation was not imported",
);
const pythAbiBytes = await readFile(pythAbiPath);
const pythAbiFileSha256 = sha256(pythAbiBytes);
const pythAbiCanonicalSha256 = sha256(JSON.stringify(canonicalize(pythAbi)));
const pythAbiSemanticSha256 = abiSemanticDigest(pythAbi);

const deploymentCatalogPath = join(contractsDirectory, "records", "deployments.json");
const abiCatalogPath = join(contractsDirectory, "records", "abis.json");
const contractSourceCatalogPath = join(contractsDirectory, "sources", "catalog.json");
const contractIndexPath = join(contractsDirectory, "index.json");
const deploymentCatalog = await json(deploymentCatalogPath);
const abiCatalog = await json(abiCatalogPath);
const contractSourceCatalog = await json(contractSourceCatalogPath);
const contractIndex = await json(contractIndexPath);

const newContractObservations: JsonObject[] = [];
for (const networkId of networkIds) {
  const captureForNetwork =
    networkCaptures.get(networkId) ?? fail(`${networkId} normalized capture missing`);
  const deploymentId = `${pythContractId}@${networkId}`;
  const deployment = requiredRecord(
    objects(deploymentCatalog.records, "contract deployment records"),
    deploymentId,
    "Pyth deployment",
  );
  const validity = object(deployment.validity, `${deploymentId} validity`);
  const deploymentFrom = object(validity.deploymentFrom, `${deploymentId} deploymentFrom`);
  const history = normalizeHistory(captureForNetwork.history, deploymentFrom, networkId);
  const currentGeneration = history.at(-1) ?? fail(`${networkId} current generation missing`);
  const currentImplementation = text(
    currentGeneration.implementationAddress,
    `${networkId} current implementation`,
  );
  const block = object(captureForNetwork.network.block, `${networkId} observation block`);
  const evidenceRecordId = `observe-oracle-pyth-price-feed-${networkId}-2026-08-27`;
  const evidenceReference = {
    moduleId: "contracts",
    resourceId: newContractEvidenceId,
    recordId: evidenceRecordId,
  };
  const priceEvidenceReference = {
    moduleId: "prices",
    resourceId: newPriceEvidenceId,
    recordId: `observe-pyth-${networkId}-2026-08-27`,
  };
  const proxy = {
    standard: "eip-1967-uups",
    implementationSlot: captureForNetwork.pyth.implementationSlot,
    adminSlot: null,
    adminAddress: null,
    currentImplementationAddress: currentImplementation,
    implementationHistory: history,
  };
  const currentExplorer = object(
    captureForNetwork.explorer.pythImplementation,
    `${networkId} current implementation explorer metadata`,
  );
  const proxyExplorer = object(
    captureForNetwork.explorer.pythProxy,
    `${networkId} proxy explorer metadata`,
  );
  const providerAbiExplorer = object(
    captureForNetwork.explorer.providerUpgradedPythImplementation,
    `${networkId} provider-upgraded implementation explorer metadata`,
  );
  newContractObservations.push({
    id: evidenceRecordId,
    deploymentId,
    networkId,
    observedAt: capturedAt,
    observationBlock: {
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
    },
    methods: [
      "official Pyth 1.4.6 source and deployment-store pin",
      "official Pyth in-place upgrade documentation pin",
      "official explorer complete Upgraded-log history",
      "before/at eth_getStorageAt for each EIP-1967 implementation boundary",
      "eth_getCode at the proxy and current implementation",
      "eth_call version() at the fixed block",
      "fully verified provider-upgraded generation ABI comparison on both Mezo networks",
    ],
    activation: deploymentFrom,
    runtime: {
      addressCodeSha256: captureForNetwork.pyth.codeSha256,
      implementationCodeSha256: captureForNetwork.pyth.implementationCodeSha256,
      version: captureForNetwork.pyth.version,
    },
    proxy,
    explorer: {
      activeContract: explorerContract(
        currentExplorer,
        null,
        captureForNetwork.pyth.implementationCodeSha256,
      ),
      proxyContract: explorerContract(proxyExplorer, null, captureForNetwork.pyth.codeSha256),
      effectiveAbiSource: explorerContract(
        providerAbiExplorer,
        pythAbiSemanticSha256,
        object(
          captureForNetwork.contracts.providerUpgradedPyth,
          `${networkId} provider-upgraded Pyth`,
        ).implementationCodeSha256,
      ),
      currentImplementationVerificationLabelPreserved: true,
      providerGenerationAbiMatch: true,
      rpcBytecodeMatch: true,
    },
    sourceProvenance: {
      repository: officialPyth.repository,
      commit: officialPyth.commit,
      releaseCommit: officialPyth.releaseCommit,
      version: officialPyth.version,
      artifacts: officialPyth.artifacts,
      interpretation:
        "The official 1.4.6 release changes only the version string from the fully verified provider-upgraded 1.4.5-alpha.1 generation; both current legacy proxies return 1.4.6 and expose the replacement parsePriceFeedUpdatesWithConfig selector.",
    },
    outcome: "passed",
  });

  validity.currentCodeFrom = currentGeneration.effectiveFrom;
  deployment.proxy = proxy;
  deployment.source = {
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: pythSourceId,
    },
    artifactPath:
      "pyth-crosschain/target_chains/ethereum/contracts/contracts/pyth/PythUpgradable.sol",
    declaredImplementationAddress: currentImplementation,
  };
  deployment.runtime = {
    observedAt: capturedAt,
    blockNumber: block.number,
    blockHash: block.hash,
    addressCodeSha256: captureForNetwork.pyth.codeSha256,
    implementationCodeSha256: captureForNetwork.pyth.implementationCodeSha256,
    version: captureForNetwork.pyth.version,
  };
  deployment.provenanceEvidence = {
    liveConfiguration: {
      deploymentRepository: object(capture.officialDocumentation, "official Mezo docs").repository,
      commit: object(capture.officialDocumentation, "official Mezo docs").commit,
      deploymentArtifactPath:
        "src/content/docs/docs/developers/architecture/oracles/read-oracle.md",
      deploymentArtifactSha256: text(
        objects(
          object(capture.officialDocumentation, "official Mezo docs").artifacts,
          "official Mezo doc artifacts",
        )[0]?.sha256,
        "official Mezo oracle guide digest",
      ),
      configurationReference: priceEvidenceReference,
      activationHistoryReference: evidenceReference,
      networkEvidenceReference: priceEvidenceReference,
      providerUpgradeSource: {
        repository: officialPyth.repository,
        commit: officialPyth.commit,
        releaseCommit: officialPyth.releaseCommit,
        version: officialPyth.version,
      },
    },
  };
  deployment.evidenceReference = evidenceReference;
  deployment.supportStatus = "proposed";
  deployment.reviewStatus = "pending-qualified-review";
  deployment.limitations = [
    "The proxy identity remains accepted, but its post-upgrade implementation generation is proposed pending oracle re-verification qualified Level 3 review.",
    "The active implementation is not explorer-verified; effective ABI provenance uses the official Pyth 1.4.6 source boundary, both fully verified provider-upgraded Mezo generation ABIs, exact version() reads, and fixed-block selector/runtime evidence.",
    "No updater, credential, subscription, route, or writer support is created by this registry refresh.",
  ];
}
deploymentCatalog.verifiedAt = capturedAt;

const pythAbiRecord = requiredRecord(
  objects(abiCatalog.records, "contract ABI records"),
  pythContractId,
  "Pyth ABI record",
);
const pythSourceArtifacts = [
  "contract_manager/src/store/contracts/EvmPriceFeedContracts.json",
  "target_chains/ethereum/contracts/contracts/pyth/Pyth.sol",
  "target_chains/ethereum/contracts/contracts/pyth/PythUpgradable.sol",
  "target_chains/ethereum/sdk/solidity/abis/IPyth.json",
].map((path) => ({
  networkIds: [...networkIds],
  version: "pyth-core-1.4.6",
  path: `pyth-crosschain/${path}`,
  sha256: requiredDigest(pythArtifactDigests, path),
}));
pythSourceArtifacts.push({
  networkIds: [...networkIds],
  version: "provider-upgraded-1.4.5-alpha.1-abi-compatible-with-1.4.6",
  path: "effective-abi/provider-upgraded-mainnet-testnet-match",
  sha256: pythAbiFileSha256,
});
Object.assign(pythAbiRecord, {
  provenanceClass: "official-deployment-repository-live-configuration",
  entryCount: pythAbi.length,
  fileSha256: pythAbiFileSha256,
  abiSha256: pythAbiCanonicalSha256,
  abiSemanticSha256: pythAbiSemanticSha256,
  sourceReference: {
    moduleId: "contracts",
    resourceId: "contract-sources",
    recordId: pythSourceId,
  },
  sourceArtifacts: pythSourceArtifacts,
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  limitations: [
    "The effective full ABI is the identical 83-entry ABI from both fully verified provider-upgraded Mezo Pyth implementations, reconciled to official Pyth 1.4.6 source and fixed-block version/selector observations on the in-place legacy proxies.",
    "The post-upgrade ABI replaces parsePriceFeedUpdatesWithSlotsStrict with parsePriceFeedUpdatesWithConfig; the active in-place implementation bytecode remains unverified in both Mezo explorers.",
    "The ABI is proposed pending oracle re-verification qualified Level 3 review and creates no updater, credential, route, or writer support.",
  ],
});
abiCatalog.verifiedAt = capturedAt;
abiCatalog.limitations = [
  "Each artifact is the current implementation/deployment ABI for the verified generation, not a historical implementation catalog.",
  "ABI support is limited to accepted records; proposed records remain pending qualified review and create no public capability.",
  "The catalog contains 57 supported ABIs and one proposed Pyth ABI; record-level lifecycle and provenance govern use.",
];
deploymentCatalog.limitations = [
  "Catalog verification is point-in-time and must be repeated after reviewAfter or before a protocol-sensitive release.",
  "Open deployment ranges mean no supersession was observed at the verification block; they do not assert immutability.",
  "The catalog contains 83 supported deployments, two proposed Pyth deployments, and one superseded historical deployment; record-level lifecycle and provenance govern use.",
];

const contractEvidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: newContractEvidenceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "pending-qualified-review",
  verifiedAt: capturedAt,
  reviewAfter,
  scope: {
    networkIds: [...networkIds],
    deploymentIds: networkIds.map((networkId) => `${pythContractId}@${networkId}`),
  },
  limitations: [
    "Evidence is bounded to the pinned post-upgrade blocks, complete explorer upgrade logs, exact EIP-1967 slot boundaries, official Pyth 1.4.6 source, and preserved explorer verification labels.",
    "The active in-place implementations are unverified in both Mezo explorers; the qualified review must accept the documented cross-source ABI reconciliation before registry support is restored.",
    "No feed liveness, updater, credential, route, or writer support follows from contract identity evidence.",
  ],
  registryStatus: null,
  observedFrom: capturedAt,
  observedThrough: capturedAt,
  methodology: [
    "Pin current Mezo and Pyth official source commits and exact artifact digests.",
    "Pin one post-boundary block and hash on each Mezo network.",
    "Enumerate the complete explorer Upgraded-log history for each legacy proxy.",
    "Verify every implementation transition with before/at eth_getStorageAt and the exact RPC block hash.",
    "Read proxy/current implementation bytecode and version() at each fixed block.",
    "Reconcile the 1.4.6 source-only version change with both fully verified provider-upgraded Mezo generation ABIs.",
    "Preserve unverified current implementation labels rather than upgrading them by inference.",
  ],
  networkSnapshots: networkIds.map((networkId) => networkSnapshot(networkId)),
  observations: newContractObservations,
};
const newContractEvidencePath = join(
  contractsDirectory,
  "evidence",
  "oracle-contracts-2026-08-27.json",
);
await writeJson(newContractEvidencePath, contractEvidence);

const oldContractEvidencePath = join(
  contractsDirectory,
  "evidence",
  "oracle-contracts-2026-08-23.json",
);
const oldContractEvidence = await json(oldContractEvidencePath);
oldContractEvidence.reviewAfter = null;
oldContractEvidence.supersededBy = { moduleId: "contracts", resourceId: newContractEvidenceId };
oldContractEvidence.limitations = texts(
  oldContractEvidence.limitations,
  "old contract evidence limitations",
).map((limitation) =>
  limitation ===
  "A Pyth upgrade is announced for 2026-08-26 16:00 UTC, so all current proxy and implementation observations require a post-boundary refresh."
    ? "The Pyth generation observed here was superseded by the completed 2026-08-26 upgrade; use the linked post-boundary evidence for current state."
    : limitation,
);
oldContractEvidence.limitations = appendUnique(
  texts(oldContractEvidence.limitations, "old contract evidence limitations"),
  "Current-state freshness moved to contract-oracle-probes-2026-08-27; these fixed-block observations remain immutable historical evidence.",
);
await writeJson(oldContractEvidencePath, oldContractEvidence);

const newContractEvidenceSha256 = sha256(await readFile(newContractEvidencePath));
const contractSources = objects(contractSourceCatalog.sources, "contract sources");
const pythSource = requiredRecord(contractSources, pythSourceId, "Pyth source");
Object.assign(pythSource, {
  kind: "official-provider-source-and-on-chain-observation",
  reference: { moduleId: "contracts", resourceId: newContractEvidenceId },
  sha256: newContractEvidenceSha256,
  retrievedAt: capturedAt,
  repositories: [
    object(capture.officialDocumentation, "official Mezo docs").repository,
    officialPyth.repository,
  ],
  endpoints: ["https://api.explorer.mezo.org", "https://api.explorer.test.mezo.org"],
  note: "Official Mezo integration address plus official Pyth 1.4.6 source/deployment metadata and complete post-upgrade runtime/slot/ABI observations for the in-place proxy generation.",
});
const retainedContractArtifacts = objects(
  contractSourceCatalog.sourceArtifacts,
  "contract source artifacts",
).filter(({ sourceId }) => sourceId !== pythSourceId);
contractSourceCatalog.sourceArtifacts = [
  ...retainedContractArtifacts,
  ...pythSourceArtifacts.map(({ path, sha256: digest }) => ({
    sourceId: pythSourceId,
    path,
    sha256: digest,
  })),
  {
    sourceId: pythSourceId,
    path: "evidence/oracle-contracts-2026-08-27.json",
    sha256: newContractEvidenceSha256,
  },
];
contractSourceCatalog.verifiedAt = capturedAt;

upsertResource(contractIndex, {
  id: newContractEvidenceId,
  role: "evidence",
  kind: "contract-observation-set",
  path: "evidence/oracle-contracts-2026-08-27.json",
  recordIds: newContractObservations.map(({ id }) => text(id, "contract observation ID")),
  recordCollectionPointer: "/observations",
});
appendGeneratedFrom(contractIndex, "contract-reference", {
  moduleId: "contracts",
  resourceId: newContractEvidenceId,
});
contractIndex.verifiedAt = capturedAt;
contractIndex.limitations = [
  "Open deployment validity ranges and current implementation ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create reader, writer, route, protocol, market, vault, validator-operation, or product support.",
  "MDK registry support covers 57 accepted Contract ABIs and 83 supported deployments; one Pyth ABI and two Pyth deployments are proposed pending qualified review, and one superseded deployment remains historical.",
];
await Promise.all([
  writeJson(deploymentCatalogPath, deploymentCatalog),
  writeJson(abiCatalogPath, abiCatalog),
  writeJson(contractSourceCatalogPath, contractSourceCatalog),
  writeJson(contractIndexPath, contractIndex),
]);

const priceEvidence = buildPriceEvidence();
const newPriceEvidencePath = join(
  pricesDirectory,
  "evidence",
  "fixed-block-observations-2026-08-27.json",
);
await writeJson(newPriceEvidencePath, priceEvidence);
const newPriceEvidenceSha256 = sha256(await readFile(newPriceEvidencePath));

const oldPriceEvidencePath = join(
  pricesDirectory,
  "evidence",
  "fixed-block-observations-2026-08-23.json",
);
const oldPriceEvidence = await json(oldPriceEvidencePath);
oldPriceEvidence.reviewAfter = null;
oldPriceEvidence.supersededBy = { moduleId: "prices", resourceId: newPriceEvidenceId };
oldPriceEvidence.limitations = appendUnique(
  texts(oldPriceEvidence.limitations, "old price evidence limitations"),
  "Current-state freshness moved to price-fixed-block-observations-2026-08-27; these fixed-block observations remain immutable historical evidence.",
);
await writeJson(oldPriceEvidencePath, oldPriceEvidence);

const sourcesFeedsPath = join(pricesDirectory, "records", "sources-feeds.json");
const priceSourcesPath = join(pricesDirectory, "sources", "catalog.json");
const priceIndexPath = join(pricesDirectory, "index.json");
const sourcesFeeds = await json(sourcesFeedsPath);
const priceSources = await json(priceSourcesPath);
const priceIndex = await json(priceIndexPath);
for (const record of [sourcesFeeds, priceSources, priceIndex]) {
  record.verifiedAt = capturedAt;
  record.reviewAfter = reviewAfter;
  record.reviewStatus = "pending-qualified-review";
}
sourcesFeeds.limitations = [
  "The two roots retain registry identity, while post-upgrade current implementation and feed evidence await oracle re-verification qualified Level 3 review; feed/current support remains proposed.",
  "Post-upgrade Pyth one-hour reads remained stale on both networks and must not be represented as live feed support.",
  "No feed updater, hosted provider, credential, subscription, route, or writer is included.",
];
const pythPriceSource = requiredRecord(
  objects(sourcesFeeds.sources, "price sources"),
  "source.pyth-core-v1",
  "Pyth price source",
);
delete pythPriceSource.scheduledReviewBoundary;
pythPriceSource.observedVersion = "1.4.6";
pythPriceSource.lastUpgradeBoundary = "2026-08-26T16:00:00.000Z";
pythPriceSource.postUpgradeEvidenceReference = {
  moduleId: "prices",
  resourceId: newPriceEvidenceId,
};
pythPriceSource.reviewStatus = "pending-qualified-review";
for (const feed of objects(sourcesFeeds.feeds, "price feeds")) {
  if (text(feed.sourceId, "feed source ID") === "source.pyth-core-v1") {
    feed.fixedBlockFreshness = "stale-at-3600-seconds";
  }
}

priceSources.limitations = [
  "Source entries establish bounded provenance only for exact commits, paths, URLs, observations, and logical references.",
  "The completed Pyth upgrade and post-boundary observations are pinned; current feed liveness remains block-scoped and support remains proposed.",
];
const priceSourceRecords = objects(priceSources.records, "price source records");
const fixedBlockSource = requiredRecord(
  priceSourceRecords,
  "price-fixed-block-capture",
  "fixed-block price source",
);
Object.assign(fixedBlockSource, {
  reference: { moduleId: "prices", resourceId: newPriceEvidenceId },
  sha256: newPriceEvidenceSha256,
  retrievedAt: capturedAt,
  establishes:
    "Pinned post-upgrade source, adapter, freshness, code, proxy-generation, and ABI observations.",
});
const pythApiSource = requiredRecord(priceSourceRecords, "pyth-evm-api", "Pyth API source");
Object.assign(pythApiSource, {
  repository: officialPyth.repository,
  commit: officialPyth.commit,
  releaseCommit: officialPyth.releaseCommit,
  version: officialPyth.version,
  artifacts: officialPyth.artifacts,
  retrievedAt: capturedAt,
  establishes:
    "Freshness-gated read semantics, completed in-place upgrade behavior, upgraded Mezo deployment identities, and the Pyth Core 1.4.6 source/ABI boundary.",
});

priceIndex.limitations = [
  "oracle re-verification post-upgrade evidence is pending qualified Level 3 review; feed/current support remains proposed.",
  "Pyth one-hour reads remained stale at both post-upgrade evidence blocks; no live Pyth price support is claimed.",
  "No public price reader, feed updater, provider credential, subscription, route, trading path, or writer is implemented.",
  "Price source selection never substitutes a market, DEX, analytics, Skip-direct, or Pyth-direct result for the MUSD protocol price.",
];
upsertResource(priceIndex, {
  id: newPriceEvidenceId,
  role: "evidence",
  kind: "price-fixed-block-observation-set",
  path: "evidence/fixed-block-observations-2026-08-27.json",
  recordIds: objects(priceEvidence.observations, "new price observations").map(({ id }) =>
    text(id, "price observation ID"),
  ),
  recordCollectionPointer: "/observations",
});
appendGeneratedFrom(priceIndex, "price-reference", {
  moduleId: "prices",
  resourceId: newPriceEvidenceId,
});
const extensions = object(priceIndex.extensions, "price index extensions");
extensions.blockers = [
  "qualified Level 3 acceptance of the oracle re-verification post-upgrade Pyth implementation, ABI, and feed evidence",
  "separate public API and transaction review before any reader or updater implementation",
];
extensions.gaps = [
  "qualified Level 3 acceptance of the oracle re-verification post-upgrade Pyth implementation, ABI, and feed evidence",
  "supported public reader/freshness policy",
  "provider credentials and update transport",
  "writer and transaction lifecycle integration",
  "accepted quote/routing consumers",
];
await Promise.all([
  writeJson(sourcesFeedsPath, sourcesFeeds),
  writeJson(priceSourcesPath, priceSources),
  writeJson(priceIndexPath, priceIndex),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      capturedAt,
      reviewAfter,
      contractEvidenceId: newContractEvidenceId,
      priceEvidenceId: newPriceEvidenceId,
      pythAbiEntries: pythAbi.length,
      networks: networkIds.map((networkId) => {
        const normalized = networkCaptures.get(networkId) ?? fail(`${networkId} capture missing`);
        return {
          networkId,
          block: normalized.network.block,
          implementation: normalized.pyth.implementation,
          version: normalized.pyth.version,
        };
      }),
    },
    null,
    2,
  )}\n`,
);

function buildPriceEvidence(): JsonObject {
  const observations: JsonObject[] = [];
  for (const networkId of networkIds) {
    const normalized = networkCaptures.get(networkId) ?? fail(`${networkId} capture missing`);
    const skip = object(normalized.contracts.skipBtcUsd, `${networkId} Skip oracle`);
    const latestRoundData = object(skip.latestRoundData, `${networkId} Skip round data`);
    const musdPriceFeed = object(
      normalized.contracts.musdPriceFeed,
      `${networkId} MUSD price feed`,
    );
    observations.push({
      id: `observe-skip-${networkId}-2026-08-27`,
      networkId,
      observedAt: capturedAt,
      block: normalized.network.block,
      sourceId: "source.skip-price-oracle-v1",
      feedId: "feed.skip-btc-usd",
      sourceClass: "pushed-feed-observation",
      contractReference: {
        moduleId: "contracts",
        resourceId: "contract-deployments",
        recordId: `oracle.skip-btc-usd@${networkId}`,
      },
      rawDatum: {
        price: latestRoundData.answer,
        expo: -18,
        decimals: skip.decimals,
        roundId: latestRoundData.roundId,
        startedAt: latestRoundData.startedAt,
        updatedAt: latestRoundData.updatedAt,
        answeredInRound: latestRoundData.answeredInRound,
        confidence: null,
      },
      protocolAdapterObservation: {
        sourceClass: "protocol-oracle-state",
        componentReference: {
          moduleId: "protocols/musd",
          resourceId: "musd-components",
          recordId: "musd.price-feed",
        },
        configuredOracle: musdPriceFeed.oracle,
        fetchPrice: musdPriceFeed.fetchPrice,
        targetDigits: musdPriceFeed.targetDigits,
        equalsDirectSourceAtBlock: musdPriceFeed.fetchPrice === latestRoundData.answer,
      },
      interfaceObservation: {
        decimals: "succeeded",
        latestRoundData: "succeeded",
        description: skip.description,
      },
      result: "valid-bounded-observation",
      limitations: [
        "This is a fixed-block observation, not a current-value constant or availability guarantee.",
        "The MUSD adapter equality is established only at this block and retains protocol-oracle-state as a distinct source class.",
      ],
    });
    const feeds = Object.entries(object(normalized.pyth.feeds, `${networkId} Pyth feeds`)).map(
      ([pair, value]) => {
        const feed = object(value, `${networkId} ${pair} feed`);
        const freshnessResult = normalizePythFreshness(feed.freshResult);
        return {
          pair,
          feedId: feed.feedId,
          maxAgeSeconds: feed.maxAgeSeconds,
          freshnessResult,
          diagnosticResult: feed.diagnosticResult,
          diagnosticClassification:
            freshnessResult.status === "stale"
              ? "stale-diagnostic-not-current-price"
              : "diagnostic-only-not-selected",
        };
      },
    );
    const freshnessStatuses = feeds.map(({ freshnessResult }) => freshnessResult.status);
    const result = freshnessStatuses.every((status) => status === "stale")
      ? "stale-at-3600-seconds"
      : freshnessStatuses.every((status) => status === "valid")
        ? "valid-at-3600-seconds"
        : "mixed-freshness-at-3600-seconds";
    observations.push({
      id: `observe-pyth-${networkId}-2026-08-27`,
      networkId,
      observedAt: capturedAt,
      block: normalized.network.block,
      sourceId: "source.pyth-core-v1",
      sourceClass: "pushed-feed-observation",
      contractReference: {
        moduleId: "contracts",
        resourceId: "contract-deployments",
        recordId: `${pythContractId}@${networkId}`,
      },
      proxy: {
        address: normalized.pyth.address,
        codeSha256: normalized.pyth.codeSha256,
        implementationSlot: normalized.pyth.implementationSlot,
        implementation: normalized.pyth.implementation,
        implementationCodeSha256: normalized.pyth.implementationCodeSha256,
        version: normalized.pyth.version,
        activationHistoryReference: {
          moduleId: "contracts",
          resourceId: newContractEvidenceId,
          recordId: `observe-oracle-pyth-price-feed-${networkId}-2026-08-27`,
        },
      },
      feeds,
      result,
      limitations: [
        "Both one-hour reads reverted StalePrice() at this post-upgrade block; retained tuples came only from an oversized diagnostic max age.",
        "Diagnostic payloads preserve raw price, confidence, exponent, and publication time but must not be displayed or normalized as current, selected as fallback, or used to assert live Pyth feed support.",
        "The in-place proxy implementation and effective ABI remain pending oracle re-verification qualified Level 3 review.",
      ],
    });
  }
  return {
    schemaVersion: 1,
    kind: "price-fixed-block-observation-set",
    id: newPriceEvidenceId,
    owner: "prices",
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: capturedAt,
    reviewAfter,
    scope: {
      networkIds: [...networkIds],
      feedIds: ["feed.skip-btc-usd", "feed.pyth-btc-usd", "feed.pyth-musd-usd"],
    },
    limitations: [
      "Observations are immutable block-scoped evidence and never mutable current-price constants.",
      "Post-upgrade Pyth results were stale under the explicit one-hour rule on both networks; identity and bytecode presence do not establish feed liveness.",
      "The evidence creates no public reader, updater, hosted-provider, route, credential, or writer support.",
    ],
    methodology: [
      "Resolve current RPC endpoints through the Networks module and verify chain IDs.",
      "Pin one post-upgrade block per network before reading code, storage, and oracle results.",
      "Read the MUSD configured oracle and normalized adapter result at each pinned block.",
      "Read Skip decimals and latestRoundData while preserving the unsupported description call.",
      "Read the Pyth proxy implementation slot, version, generation history, and code identities.",
      "Call getPriceNoOlderThan with an explicit one-hour bound and retain typed StalePrice failures.",
      "Use an oversized max age only to preserve raw Pyth tuple decoding, marking every payload stale diagnostic.",
    ],
    networkSnapshots: networkIds.map((networkId) => networkSnapshot(networkId)),
    observations,
  };
}

function normalizePythFreshness(value: unknown): JsonObject {
  const result = object(value, "Pyth freshness result");
  if (result.ok === true) return { status: "valid", datum: result.value ?? result.raw };
  const error = object(result.error, "Pyth freshness error");
  if (typeof error.data === "string" && error.data.toLowerCase() === staleSelector) {
    return { status: "stale", errorSelector: staleSelector, errorName: "StalePrice()" };
  }
  return { status: "failed", error };
}

function normalizeHistory(
  capturedHistory: JsonObject[],
  deploymentFrom: JsonObject,
  networkId: string,
): JsonObject[] {
  const entries = capturedHistory.map((entry, index) => ({
    implementationAddress: text(
      entry.implementationAddress,
      `${networkId} history ${index} implementation`,
    ),
    effectiveFrom:
      index === 0
        ? deploymentFrom
        : object(entry.effectiveFrom, `${networkId} history ${index} effectiveFrom`),
    effectiveUntilExclusive:
      entry.effectiveUntilExclusive === null
        ? null
        : object(
            entry.effectiveUntilExclusive,
            `${networkId} history ${index} effectiveUntilExclusive`,
          ),
  }));
  const first = entries[0] ?? fail(`${networkId} initial history missing`);
  const current = entries[1] ?? fail(`${networkId} current history missing`);
  const capturedInitial = object(
    capturedHistory[0]?.effectiveFrom,
    `${networkId} initial boundary`,
  );
  assert(
    capturedInitial.blockNumber === deploymentFrom.blockNumber &&
      capturedInitial.blockHash === deploymentFrom.blockHash &&
      capturedInitial.transactionHash === deploymentFrom.transactionHash,
    `${networkId} initial deployment boundary drifted`,
  );
  first.effectiveUntilExclusive = current.effectiveFrom;
  current.effectiveUntilExclusive = null;
  return entries;
}

function networkSnapshot(networkId: (typeof networkIds)[number]): JsonObject {
  const normalized = networkCaptures.get(networkId) ?? fail(`${networkId} capture missing`);
  const block = object(normalized.network.block, `${networkId} block`);
  return {
    networkId,
    evmChainId: normalized.network.chainId,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    rpcUrl: normalized.network.rpcUrl,
    explorerApiUrl: normalized.network.explorerApiUrl,
  };
}

function explorerContract(
  value: JsonObject,
  abiSemanticSha256: string | null,
  deployedBytecodeSha256: unknown,
): JsonObject {
  return {
    address: value.address,
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

function upsertResource(index: JsonObject, resource: JsonObject): void {
  const resources = objects(index.resources, "module resources");
  index.resources = [...resources.filter(({ id }) => id !== resource.id), resource];
}

function appendGeneratedFrom(index: JsonObject, resourceId: string, reference: JsonObject): void {
  const resource = requiredRecord(
    objects(index.resources, "module resources"),
    resourceId,
    "generated resource",
  );
  const generatedFrom = objects(resource.generatedFrom, `${resourceId} generated inputs`);
  if (
    !generatedFrom.some(
      (entry) => entry.moduleId === reference.moduleId && entry.resourceId === reference.resourceId,
    )
  ) {
    generatedFrom.push(reference);
  }
  resource.generatedFrom = generatedFrom;
}

function requiredRecord(records: JsonObject[], id: string, label: string): JsonObject {
  return records.find((record) => record.id === id) ?? fail(`${label} '${id}' is missing`);
}

function requiredDigest(digests: Map<string, string>, path: string): string {
  return digests.get(path) ?? fail(`official Pyth artifact '${path}' is missing`);
}

function appendUnique(values: string[], addition: string): string[] {
  return values.includes(addition) ? values : [...values, addition];
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
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

async function json(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
