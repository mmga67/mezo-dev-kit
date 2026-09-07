import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { loadKnowledgeModule, resolveKnowledgeResource } from "./knowledge-reference.ts";

export interface GeneratedPackageFile {
  readonly digest: string;
  readonly output: string;
}

export function assertGeneratedPackageCurrent(
  current: string,
  generated: GeneratedPackageFile,
  packageName: string,
): void {
  if (current !== generated.output) {
    throw new Error(`${packageName} generated data drifted`);
  }
}

export interface ProjectedNetwork {
  readonly id: string;
  readonly environment: "mainnet" | "testnet";
  readonly profile: "evm" | "cosmos-evm";
  readonly displayName: string;
  readonly evmChainId: string;
  readonly cosmosChainId: string | null;
  readonly nativeCurrency: Readonly<{
    name: string;
    symbol: string;
    decimals: number;
    cosmosEvmDenom: string | null;
  }>;
  readonly explorer: Readonly<{ name: string; url: string }>;
  readonly capabilities: Readonly<{
    evm: true;
    evmJsonRpc: true;
    cosmosSdk: boolean;
    nodeCosmosRpc: boolean;
    consensusEngine: string | null;
    gasCurrency: "native";
  }>;
  readonly status: EvidenceStatus;
  readonly supportStatus: SupportStatus;
  readonly reviewStatus: ReviewStatus;
  readonly verifiedAt: string | null;
  readonly reviewAfter: string | null;
  readonly limitations: readonly string[];
}

export interface ProjectedDeployment {
  readonly id: string;
  readonly contractId: string;
  readonly networkId: string;
  readonly address: string;
  readonly contractType: string;
  readonly provenanceClass: string;
  readonly deploymentFromBlock: string;
  readonly effectiveUntilExclusiveBlock: string | null;
  readonly currentCodeFromBlock: string;
  readonly currentImplementationAddress: string | null;
  readonly implementationHistory: readonly Readonly<{
    implementationAddress: string;
    effectiveFromBlock: string;
    effectiveUntilExclusiveBlock: string | null;
  }>[];
  readonly abiContractId: string;
  readonly abiAppliesTo: string;
  readonly status: EvidenceStatus;
  readonly supportStatus: SupportStatus;
  readonly reviewStatus: ReviewStatus;
  readonly catalogVerifiedAt: string;
  readonly catalogReviewAfter: string | null;
  readonly limitations: readonly string[];
}

export interface ProjectedAbi {
  readonly contractId: string;
  readonly intendedNetworkIds: readonly string[];
  readonly provenanceClass: string;
  readonly canonicalEntryCount: number;
  readonly readEntryCount: number;
  readonly fileSha256: string;
  readonly abiSha256: string;
  readonly abiSemanticSha256: string;
  readonly status: EvidenceStatus;
  readonly supportStatus: SupportStatus;
  readonly reviewStatus: ReviewStatus;
  readonly catalogVerifiedAt: string;
  readonly catalogReviewAfter: string | null;
  readonly limitations: readonly string[];
  readonly readAbi: readonly Readonly<Record<string, JsonValue>>[];
}

export interface AbiArtifactInput {
  readonly contractId: string;
  readonly resourceId: string;
  readonly bytes: Uint8Array;
  readonly document: unknown;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, unknown>;
type EvidenceStatus =
  | "candidate"
  | "unverified"
  | "verified"
  | "conflicting"
  | "superseded"
  | "verified-current"
  | "verified-superseded";
type SupportStatus = "none" | "proposed" | "supported" | "historical" | "deprecated" | "docs-only";
type ReviewStatus =
  | "unreviewed"
  | "pending-architecture-review"
  | "pending-qualified-review"
  | "accepted"
  | "rejected";

const evidenceStatuses = new Set<EvidenceStatus>([
  "candidate",
  "unverified",
  "verified",
  "conflicting",
  "superseded",
  "verified-current",
  "verified-superseded",
]);
const supportStatuses = new Set<SupportStatus>([
  "none",
  "proposed",
  "supported",
  "historical",
  "deprecated",
  "docs-only",
]);
const reviewStatuses = new Set<ReviewStatus>([
  "unreviewed",
  "pending-architecture-review",
  "pending-qualified-review",
  "accepted",
  "rejected",
]);
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export async function buildChainsPackageFile(
  repositoryRoot: string,
): Promise<GeneratedPackageFile> {
  const module = await loadKnowledgeModule(repositoryRoot, "networks");
  supportedContainerLifecycle(module.index, "Networks module index");
  const resources = module.index.resources
    .filter((resource) => resource.role === "canonical-record" && resource.kind === "network")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (resources.length === 0) throw new Error("Networks module has no canonical network resources");

  const digest = createHash("sha256");
  await digestFile(digest, "networks:index", module.indexPath);
  const networks: ProjectedNetwork[] = [];
  for (const resource of resources) {
    const resolved = await resolveKnowledgeResource(repositoryRoot, {
      moduleId: "networks",
      resourceId: resource.id,
    });
    const bytes = await readFile(resolved.path);
    digestBytes(digest, `networks:${resource.id}`, bytes);
    networks.push(projectNetworkDocument(resource.id, parseJson(bytes, `networks:${resource.id}`)));
  }
  const inputDigest = digest.digest("hex");
  const inputIds = resources.map((resource) => `networks:${resource.id}`);
  const output = renderGeneratedFile({
    generator: "scripts/generate-chains-package.ts",
    inputDescription: `networks:index; ${inputIds.join("; ")}`,
    digest: inputDigest,
    typeImport: "GeneratedChainsData",
    digestExport: "GENERATED_CHAINS_INPUT_DIGEST",
    dataExport: "GENERATED_CHAINS_DATA",
    data: { networks },
    idExport: "GENERATED_NETWORK_IDS",
    ids: networks.map(({ id }) => id),
  });
  return { digest: inputDigest, output };
}

export async function buildContractsPackageFile(
  repositoryRoot: string,
): Promise<GeneratedPackageFile> {
  const module = await loadKnowledgeModule(repositoryRoot, "contracts");
  supportedContainerLifecycle(module.index, "Contracts module index");
  const deploymentResource = await resolveKnowledgeResource(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
  });
  const abiCatalogResource = await resolveKnowledgeResource(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-abis",
  });
  const digest = createHash("sha256");
  await digestFile(digest, "contracts:index", module.indexPath);
  const deploymentBytes = await readFile(deploymentResource.path);
  const abiCatalogBytes = await readFile(abiCatalogResource.path);
  digestBytes(digest, "contracts:contract-deployments", deploymentBytes);
  digestBytes(digest, "contracts:contract-abis", abiCatalogBytes);

  const abiResources = module.index.resources
    .filter(
      (resource) =>
        resource.role === "artifact" &&
        resource.kind === "contract-abi" &&
        resource.id.startsWith("abi."),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const artifacts: AbiArtifactInput[] = [];
  for (const resource of abiResources) {
    const resolved = await resolveKnowledgeResource(repositoryRoot, {
      moduleId: "contracts",
      resourceId: resource.id,
    });
    const bytes = await readFile(resolved.path);
    digestBytes(digest, `contracts:${resource.id}`, bytes);
    artifacts.push({
      contractId: resource.id.slice("abi.".length),
      resourceId: resource.id,
      bytes,
      document: parseJson(bytes, `contracts:${resource.id}`),
    });
  }

  const { deployments, abis } = projectContractDocuments({
    deploymentDocument: parseJson(deploymentBytes, "contracts:contract-deployments"),
    abiCatalogDocument: parseJson(abiCatalogBytes, "contracts:contract-abis"),
    artifacts,
  });
  const inputDigest = digest.digest("hex");
  const output = renderGeneratedFile({
    generator: "scripts/generate-contracts-package.ts",
    inputDescription:
      "contracts:index; contracts:contract-deployments; contracts:contract-abis; indexed contracts:abi.* artifacts",
    digest: inputDigest,
    typeImport: "GeneratedContractsData",
    digestExport: "GENERATED_CONTRACTS_INPUT_DIGEST",
    dataExport: "GENERATED_CONTRACTS_DATA",
    data: { deployments, abis },
    idExport: "GENERATED_CONTRACT_IDS",
    ids: abis.map(({ contractId }) => contractId),
  });
  return { digest: inputDigest, output };
}

export function projectNetworkDocument(resourceId: string, value: unknown): ProjectedNetwork {
  const record = object(value, `network '${resourceId}'`);
  const values = object(record.values, `network '${resourceId}' values`);
  const currency = object(values.nativeCurrency, `network '${resourceId}' native currency`);
  const explorer = object(values.explorer, `network '${resourceId}' explorer`);
  const capabilities = object(values.capabilities, `network '${resourceId}' capabilities`);
  const id = requiredText(record.id, `network '${resourceId}' id`);
  if (id !== resourceId) throw new Error(`network resource '${resourceId}' contains ID '${id}'`);
  const profile = oneOf(values.profile, ["evm", "cosmos-evm"] as const, `${id} profile`);
  const cosmosChainId = optionalText(values.cosmosChainId, `${id} cosmosChainId`);
  const cosmosEvmDenom = optionalText(currency.cosmosEvmDenom, `${id} cosmosEvmDenom`);
  const cosmosSdk = optionalBoolean(capabilities.cosmosSdk, `${id} cosmosSdk`) ?? false;
  const nodeCosmosRpc = optionalBoolean(capabilities.nodeCosmosRpc, `${id} nodeCosmosRpc`) ?? false;
  const consensusEngine = optionalText(capabilities.consensusEngine, `${id} consensusEngine`);
  if (profile === "cosmos-evm") {
    if (!cosmosChainId || !cosmosEvmDenom || !cosmosSdk || !nodeCosmosRpc || !consensusEngine) {
      throw new Error(`${id} cosmos-evm profile is incomplete`);
    }
  } else if (
    cosmosChainId !== null ||
    cosmosEvmDenom !== null ||
    cosmosSdk ||
    nodeCosmosRpc ||
    consensusEngine !== null
  ) {
    throw new Error(`${id} plain EVM profile contains Cosmos-only fields`);
  }
  if (capabilities.evm !== true || capabilities.evmJsonRpc !== true) {
    throw new Error(`${id} must declare EVM and EVM JSON-RPC capability`);
  }
  if (capabilities.gasCurrency !== "native") {
    throw new Error(`${id} gas currency must be native`);
  }
  return {
    id,
    environment: oneOf(record.environment, ["mainnet", "testnet"] as const, `${id} environment`),
    profile,
    displayName: requiredText(values.displayName, `${id} displayName`),
    evmChainId: positiveInteger(values.evmChainId, `${id} evmChainId`).toString(),
    cosmosChainId,
    nativeCurrency: {
      name: requiredText(currency.name, `${id} currency name`),
      symbol: requiredText(currency.symbol, `${id} currency symbol`),
      decimals: nonNegativeInteger(currency.decimals, `${id} currency decimals`),
      cosmosEvmDenom,
    },
    explorer: {
      name: requiredText(explorer.name, `${id} explorer name`),
      url: absoluteUrl(explorer.url, `${id} explorer URL`),
    },
    capabilities: {
      evm: true,
      evmJsonRpc: true,
      cosmosSdk,
      nodeCosmosRpc,
      consensusEngine,
      gasCurrency: "native",
    },
    status: evidenceStatus(record.status, `${id} status`),
    supportStatus: supportStatus(record.supportStatus, `${id} supportStatus`),
    reviewStatus: reviewStatus(record.reviewStatus, `${id} reviewStatus`),
    verifiedAt: optionalTimestamp(record.verifiedAt, `${id} verifiedAt`),
    reviewAfter: optionalTimestamp(record.reviewAfter, `${id} reviewAfter`),
    limitations: texts(record.limitations, `${id} limitations`),
  };
}

export function projectContractDocuments({
  deploymentDocument,
  abiCatalogDocument,
  artifacts,
}: {
  readonly deploymentDocument: unknown;
  readonly abiCatalogDocument: unknown;
  readonly artifacts: readonly AbiArtifactInput[];
}): Readonly<{ deployments: readonly ProjectedDeployment[]; abis: readonly ProjectedAbi[] }> {
  const deploymentCatalogLifecycle = supportedContainerLifecycle(
    deploymentDocument,
    "contract deployment catalog",
  );
  const abiCatalogLifecycle = supportedContainerLifecycle(
    abiCatalogDocument,
    "contract ABI catalog",
  );
  const deployments = records(deploymentDocument, "contract deployment catalog")
    .map((record) => projectDeployment(record, deploymentCatalogLifecycle))
    .sort((left, right) => left.id.localeCompare(right.id));
  assertUnique(
    deployments.map(({ id }) => id),
    "deployment ID",
  );

  const artifactByContractId = new Map<string, AbiArtifactInput>();
  for (const artifact of artifacts) {
    if (artifact.resourceId !== `abi.${artifact.contractId}`) {
      throw new Error(
        `ABI resource '${artifact.resourceId}' does not match '${artifact.contractId}'`,
      );
    }
    if (artifactByContractId.has(artifact.contractId)) {
      throw new Error(`duplicate ABI artifact '${artifact.contractId}'`);
    }
    artifactByContractId.set(artifact.contractId, artifact);
  }

  const abis = records(abiCatalogDocument, "contract ABI catalog")
    .map((record) => projectAbi(record, artifactByContractId, abiCatalogLifecycle))
    .sort((left, right) => left.contractId.localeCompare(right.contractId));
  assertUnique(
    abis.map(({ contractId }) => contractId),
    "ABI contract ID",
  );
  if (artifactByContractId.size !== abis.length) {
    const catalogIds = new Set(abis.map(({ contractId }) => contractId));
    const extras = [...artifactByContractId.keys()].filter((id) => !catalogIds.has(id));
    throw new Error(`ABI artifacts do not exactly match the catalog: ${extras.join(", ")}`);
  }
  return { deployments, abis };
}

function projectDeployment(
  value: JsonObject,
  catalogLifecycle: SupportedContainerLifecycle,
): ProjectedDeployment {
  const id = requiredText(value.id, "deployment id");
  const contractId = requiredText(value.contractId, `${id} contractId`);
  const validity = object(value.validity, `${id} validity`);
  const deploymentFrom = object(validity.deploymentFrom, `${id} deploymentFrom`);
  const currentCodeFrom = object(validity.currentCodeFrom, `${id} currentCodeFrom`);
  const proxy = value.proxy === null ? null : object(value.proxy, `${id} proxy`);
  const implementationHistory =
    proxy === null
      ? []
      : objects(proxy.implementationHistory, `${id} implementationHistory`).map(
          (generation, index) => {
            const effectiveFrom = object(
              generation.effectiveFrom,
              `${id} implementationHistory[${index}] effectiveFrom`,
            );
            return {
              implementationAddress: address(
                generation.implementationAddress,
                `${id} implementationHistory[${index}] address`,
              ),
              effectiveFromBlock: blockNumber(
                effectiveFrom.blockNumber,
                `${id} implementationHistory[${index}] effectiveFrom block`,
              ),
              effectiveUntilExclusiveBlock: coordinateBlock(
                generation.effectiveUntilExclusive,
                `${id} implementationHistory[${index}] effectiveUntilExclusive`,
              ),
            };
          },
        );
  validateGenerationOrder(id, implementationHistory);
  const deploymentFromBlock = blockNumber(deploymentFrom.blockNumber, `${id} deploymentFrom block`);
  const effectiveUntilExclusiveBlock = coordinateBlock(
    validity.effectiveUntilExclusive,
    `${id} effectiveUntilExclusive`,
  );
  if (
    effectiveUntilExclusiveBlock !== null &&
    BigInt(effectiveUntilExclusiveBlock) <= BigInt(deploymentFromBlock)
  ) {
    throw new Error(`${id} deployment validity must end after it starts`);
  }
  if (
    implementationHistory.length > 0 &&
    implementationHistory[0]?.effectiveFromBlock !== deploymentFromBlock
  ) {
    throw new Error(`${id} implementation history must start with the deployment`);
  }
  const abi = object(value.abi, `${id} ABI reference`);
  const catalogReference = object(abi.catalogReference, `${id} ABI catalog reference`);
  if (
    catalogReference.moduleId !== "contracts" ||
    catalogReference.resourceId !== "contract-abis"
  ) {
    throw new Error(`${id} ABI catalog reference is not contracts:contract-abis`);
  }
  const abiContractId = requiredText(catalogReference.recordId, `${id} ABI record ID`);
  if (abiContractId !== contractId) throw new Error(`${id} ABI record differs from contract ID`);
  const currentImplementationAddress =
    proxy === null
      ? null
      : address(proxy.currentImplementationAddress, `${id} current implementation`);
  if (
    currentImplementationAddress !== null &&
    implementationHistory.at(-1)?.implementationAddress !== currentImplementationAddress
  ) {
    throw new Error(`${id} current implementation differs from the final generation`);
  }
  return {
    id,
    contractId,
    networkId: requiredText(value.networkId, `${id} networkId`),
    address: address(value.address, `${id} address`),
    contractType: requiredText(value.contractType, `${id} contractType`),
    provenanceClass: requiredText(value.provenanceClass, `${id} provenanceClass`),
    deploymentFromBlock,
    effectiveUntilExclusiveBlock,
    currentCodeFromBlock: blockNumber(currentCodeFrom.blockNumber, `${id} currentCodeFrom block`),
    currentImplementationAddress,
    implementationHistory,
    abiContractId,
    abiAppliesTo: requiredText(abi.appliesTo, `${id} ABI applicability`),
    status: evidenceStatus(value.status, `${id} status`),
    supportStatus: supportStatus(value.supportStatus, `${id} supportStatus`),
    reviewStatus: reviewStatus(value.reviewStatus, `${id} reviewStatus`),
    catalogVerifiedAt: catalogLifecycle.verifiedAt,
    catalogReviewAfter: catalogLifecycle.reviewAfter,
    limitations: texts(value.limitations, `${id} limitations`),
  };
}

function projectAbi(
  value: JsonObject,
  artifactByContractId: ReadonlyMap<string, AbiArtifactInput>,
  catalogLifecycle: SupportedContainerLifecycle,
): ProjectedAbi {
  const contractId = requiredText(value.contractId, "ABI contractId");
  if (requiredText(value.id, `${contractId} ABI id`) !== contractId) {
    throw new Error(`${contractId} ABI ID differs from contractId`);
  }
  const reference = object(value.artifactReference, `${contractId} artifactReference`);
  if (reference.moduleId !== "contracts" || reference.resourceId !== `abi.${contractId}`) {
    throw new Error(`${contractId} ABI artifact reference is invalid`);
  }
  const artifact = artifactByContractId.get(contractId);
  if (!artifact) throw new Error(`${contractId} ABI artifact is missing`);
  const expectedFileDigest = sha256(artifact.bytes);
  const recordedFileDigest = sha256Text(value.fileSha256, `${contractId} fileSha256`);
  if (expectedFileDigest !== recordedFileDigest) {
    throw new Error(`${contractId} ABI file digest differs from its catalog`);
  }
  const entries = abiEntries(artifact.document, `${contractId} ABI`);
  const canonicalEntryCount = nonNegativeInteger(value.entryCount, `${contractId} entryCount`);
  if (entries.length !== canonicalEntryCount) {
    throw new Error(`${contractId} ABI entry count differs from its catalog`);
  }
  const readAbi = entries.filter((entry) => {
    const type = oneOf(
      entry.type,
      ["constructor", "error", "event", "fallback", "function", "receive"] as const,
      `${contractId} ABI entry type`,
    );
    if (type === "function") {
      const mutability = oneOf(
        entry.stateMutability,
        ["nonpayable", "payable", "pure", "view"] as const,
        `${contractId} function stateMutability`,
      );
      return mutability === "view" || mutability === "pure";
    }
    return type === "event" || type === "error";
  });
  return {
    contractId,
    intendedNetworkIds: texts(value.intendedNetworkIds, `${contractId} intendedNetworkIds`),
    provenanceClass: requiredText(value.provenanceClass, `${contractId} provenanceClass`),
    canonicalEntryCount,
    readEntryCount: readAbi.length,
    fileSha256: recordedFileDigest,
    abiSha256: sha256Text(value.abiSha256, `${contractId} abiSha256`),
    abiSemanticSha256: sha256Text(value.abiSemanticSha256, `${contractId} abiSemanticSha256`),
    status: evidenceStatus(value.status, `${contractId} status`),
    supportStatus: supportStatus(value.supportStatus, `${contractId} supportStatus`),
    reviewStatus: reviewStatus(value.reviewStatus, `${contractId} reviewStatus`),
    catalogVerifiedAt: catalogLifecycle.verifiedAt,
    catalogReviewAfter: catalogLifecycle.reviewAfter,
    limitations: texts(value.limitations, `${contractId} limitations`),
    readAbi,
  };
}

function renderGeneratedFile({
  generator,
  inputDescription,
  digest,
  typeImport,
  digestExport,
  dataExport,
  data,
  idExport,
  ids,
}: {
  readonly generator: string;
  readonly inputDescription: string;
  readonly digest: string;
  readonly typeImport: string;
  readonly digestExport: string;
  readonly dataExport: string;
  readonly data: unknown;
  readonly idExport: string;
  readonly ids: readonly string[];
}): string {
  return [
    `// Generated by ${generator}. Do not edit.`,
    `// Canonical inputs: ${inputDescription}`,
    `// Input digest: sha256:${digest}`,
    "",
    `import type { ${typeImport} } from "./generated-types.ts";`,
    "",
    `export const ${digestExport} = ${JSON.stringify(`sha256:${digest}`)} as const;`,
    `export const ${idExport} = ${JSON.stringify(ids, undefined, 2)} as const;`,
    `export const ${dataExport}: ${typeImport} = ${JSON.stringify(data, undefined, 2)};`,
    "",
  ].join("\n");
}

function records(value: unknown, label: string): JsonObject[] {
  const document = object(value, label);
  return objects(document.records, `${label} records`);
}

function abiEntries(value: unknown, label: string): Readonly<Record<string, JsonValue>>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => jsonObject(entry, `${label}[${index}]`));
}

function jsonObject(value: unknown, label: string): Record<string, JsonValue> {
  const record = object(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [key, jsonValue(nested, `${label}.${key}`)]),
  );
}

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as string | number | boolean | null;
  }
  if (Array.isArray(value))
    return value.map((item, index) => jsonValue(item, `${label}[${index}]`));
  return jsonObject(value, label);
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function objects(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => object(item, `${label}[${index}]`));
}

function texts(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, label);
}

function optionalBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const integer = nonNegativeInteger(value, label);
  if (integer === 0) throw new Error(`${label} must be positive`);
  return integer;
}

function blockNumber(value: unknown, label: string): string {
  return nonNegativeInteger(value, label).toString();
}

function coordinateBlock(value: unknown, label: string): string | null {
  if (value === null) return null;
  const coordinate = object(value, label);
  return blockNumber(coordinate.blockNumber, `${label} blockNumber`);
}

function address(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  if (!addressPattern.test(normalized)) throw new Error(`${label} must be a 20-byte EVM address`);
  return normalized.toLowerCase();
}

function absoluteUrl(value: unknown, label: string): string {
  const url = requiredText(value, label);
  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch (error) {
    throw new Error(`${label} must be an absolute URL`, { cause: error });
  }
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be an ISO timestamp`);
  return timestamp;
}

function evidenceStatus(value: unknown, label: string): EvidenceStatus {
  return member(value, evidenceStatuses, label);
}

function supportStatus(value: unknown, label: string): SupportStatus {
  return member(value, supportStatuses, label);
}

function reviewStatus(value: unknown, label: string): ReviewStatus {
  return member(value, reviewStatuses, label);
}

function member<T extends string>(value: unknown, allowed: ReadonlySet<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as T;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} is unsupported`);
  }
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: unknown, label: string): string {
  const digest = requiredText(value, label);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256 digest`);
  return digest;
}

function digestBytes(hash: ReturnType<typeof createHash>, label: string, bytes: Uint8Array): void {
  hash.update(label).update("\0").update(bytes).update("\0");
}

async function digestFile(
  hash: ReturnType<typeof createHash>,
  label: string,
  path: string,
): Promise<void> {
  digestBytes(hash, label, await readFile(path));
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label} '${value}'`);
    seen.add(value);
  }
}

function validateGenerationOrder(
  deploymentId: string,
  generations: ProjectedDeployment["implementationHistory"],
): void {
  for (let index = 0; index < generations.length; index += 1) {
    const generation = generations[index];
    if (!generation) throw new Error(`${deploymentId} generation ${index} is missing`);
    const start = BigInt(generation.effectiveFromBlock);
    const end =
      generation.effectiveUntilExclusiveBlock === null
        ? null
        : BigInt(generation.effectiveUntilExclusiveBlock);
    if (end !== null && end < start) {
      throw new Error(`${deploymentId} generation ${index} ends before it starts`);
    }
    const next = generations[index + 1];
    if (next && end !== BigInt(next.effectiveFromBlock)) {
      throw new Error(`${deploymentId} implementation generations are not contiguous`);
    }
    if (end === null && next) {
      throw new Error(`${deploymentId} has a non-final open implementation generation`);
    }
  }
}

interface SupportedContainerLifecycle {
  readonly verifiedAt: string;
  readonly reviewAfter: string | null;
}

function supportedContainerLifecycle(value: unknown, label: string): SupportedContainerLifecycle {
  const container = object(value, label);
  const status = evidenceStatus(container.status, `${label} status`);
  const support = supportStatus(container.supportStatus, `${label} supportStatus`);
  const review = reviewStatus(container.reviewStatus, `${label} reviewStatus`);
  if (status !== "verified" || support !== "supported" || review !== "accepted") {
    throw new Error(
      `${label} must be verified, supported, and accepted; received ${status}/${support}/${review}`,
    );
  }
  const verifiedAt = optionalTimestamp(container.verifiedAt, `${label} verifiedAt`);
  if (verifiedAt === null) throw new Error(`${label} verifiedAt is required`);
  return {
    verifiedAt,
    reviewAfter: optionalTimestamp(container.reviewAfter, `${label} reviewAfter`),
  };
}
