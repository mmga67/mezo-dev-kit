import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference, resolveKnowledgeResource } from "./lib/knowledge-reference.ts";
import { assertAbiProvenance, assertDeploymentProvenance } from "./lib/contract-provenance.ts";
import { object, objects, parseJson, type JsonObject } from "./lib/json.ts";

import { parseEvidenceArguments, requiresEvidenceFreshness } from "./lib/evidence-scope.ts";
const { network: selectedNetwork } = parseEvidenceArguments(process.argv.slice(2));

import { assertOracleCaptureEvidence } from "./lib/oracle-capture-evidence.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const knowledgeDirectory = join(repositoryRoot, "knowledge", "contracts");
const addressPattern = /^0x[a-f0-9]{40}$/;
const hashPattern = /^0x[a-f0-9]{64}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const contractIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const upgradedTopic = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";
const economicSystemSourceId = "economic-system-explorer-executable-reproductions";
const pythSourceId = "oracle-pyth-live-configuration";

interface Reference extends JsonObject {
  moduleId: string;
  resourceId: string;
  recordId?: string;
}
interface Coordinate extends JsonObject {
  blockNumber: number;
  transactionHash: string | null;
  logIndex?: number;
  blockHash?: string;
  blockTimestamp?: string;
  activationKind?: string;
  method?: string;
  release?: string;
}
interface Resource extends JsonObject {
  id: string;
  role: string;
}
interface ContractIndex extends JsonObject {
  schemaVersion: number;
  knowledgeVersion: string;
  kind: string;
  id: string;
  moduleId: string;
  owner: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  scope: { contractIds: string[] };
  resources: Resource[];
  extensions: JsonObject & { registryStatus: string; networkReferences: Reference[] };
}
interface Network extends JsonObject {
  id: string;
  environment: string;
  values: { evmChainId: number };
}
interface Source extends JsonObject {
  id: string;
  kind: string;
  note: string;
  repository?: string;
  commit?: string;
  license?: string;
  url?: string;
  path?: string;
  sha256: string;
  retrievedAt?: string;
  reference?: Reference;
  endpoints?: string[];
}
interface SourceArtifact extends JsonObject {
  sourceId: string;
  path: string;
  sha256: string;
}
interface SourceCatalog extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  sources: Source[];
  sourceArtifacts: SourceArtifact[];
}
interface AbiSourceArtifact extends JsonObject {
  path: string;
  sha256: string;
}
interface AbiRecord extends JsonObject {
  id: string;
  contractId: string;
  provenanceClass: string;
  intendedNetworkIds: string[];
  status: string;
  supportStatus: string;
  reviewStatus: string;
  limitations: unknown[];
  artifactReference: Reference;
  entryCount: number;
  fileSha256: string;
  abiSha256: string;
  abiSemanticSha256: string;
  sourceReference: Reference & { recordId: string };
  sourceArtifacts: AbiSourceArtifact[];
}
interface AbiCatalog extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  status: string;
  registryStatus: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  records: AbiRecord[];
}
interface NetworkSnapshot extends JsonObject {
  networkId: string;
  evmChainId: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  rpcUrl: string;
  explorerApiUrl: string;
}
interface ImplementationHistory extends JsonObject {
  implementationAddress: string;
  effectiveFrom: Coordinate;
  effectiveUntilExclusive: Coordinate | null;
}
interface SlotBoundary extends JsonObject {
  blockNumber: number;
  previousBlockNumber: number;
  implementationAt: string;
  implementationBefore: string;
}
interface GenerationSource extends JsonObject {
  implementationAddress: string;
  isVerified: boolean;
  isFullyVerified: boolean;
  isPartiallyVerified: boolean;
  executableReproduction: string;
  sourceArtifact: SourceArtifact;
}
interface HistoryEvidence extends JsonObject {
  eventTopic: string;
  observedEventCount: number;
  historicalGenerationPolicy: string;
  eventSourceArtifact: SourceArtifact;
  slotBoundaries: SlotBoundary[];
  generationSources: GenerationSource[];
}
interface ProxyRecord extends JsonObject {
  standard: string;
  implementationSlot: string;
  adminSlot: string | null;
  adminAddress: string | null;
  currentImplementationAddress: string;
  implementationHistory: ImplementationHistory[];
  historyEvidence?: HistoryEvidence;
}
interface ActiveContract extends JsonObject {
  isVerified: boolean;
  isFullyVerified: boolean;
  isPartiallyVerified: boolean;
  abiSemanticSha256: string | null;
  deployedBytecodeSha256: string;
}
interface Observation extends JsonObject {
  id: string;
  deploymentId: string;
  networkId: string;
  outcome: string;
  proxy: ProxyRecord | null;
  observationBlock: { number: number; hash: string };
  runtime: { addressCodeSha256: string; implementationCodeSha256: string | null };
  explorer: {
    officialArtifactAbiMatch?: boolean;
    providerGenerationAbiMatch?: boolean;
    currentImplementationVerificationLabelPreserved?: boolean;
    rpcBytecodeMatch: boolean;
    activeContract: ActiveContract;
    effectiveAbiSource?: ActiveContract;
  };
  activation: Coordinate;
}
interface EvidenceSet extends JsonObject {
  schemaVersion: number;
  id: string;
  kind: string;
  owner: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string | null;
  supersededBy?: Reference | null;
  limitations: unknown[];
  observedFrom: string;
  observedThrough: string;
  methodology: unknown[];
  networkSnapshots: NetworkSnapshot[];
  observations: Observation[];
}
interface RuntimeRecord extends JsonObject {
  observedAt: string;
  blockNumber: number;
  blockHash: string;
  addressCodeSha256: string;
  implementationCodeSha256: string | null;
}
interface DeploymentRecord extends JsonObject {
  id: string;
  contractId: string;
  contractName: string;
  sourceContractName: string;
  protocol: string;
  domains: string[];
  networkId: string;
  environment: string;
  address: string;
  provenanceClass: string;
  contractType: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  limitations: unknown[];
  validity: {
    deploymentFrom: Coordinate;
    currentCodeFrom: Coordinate;
    effectiveUntilExclusive: Coordinate | null;
  };
  abi: { catalogReference: Reference; appliesTo: string };
  source: {
    sourceReference: Reference & { recordId: string };
    artifactPath: string;
    declaredImplementationAddress: string | null;
  };
  runtime: RuntimeRecord;
  proxy: ProxyRecord | null;
  evidenceReference: Reference & { recordId: string };
  provenanceEvidence: {
    reproduction: {
      explorerVerification: {
        isVerified: boolean;
        isFullyVerified: boolean;
        isPartiallyVerified: boolean;
      };
    };
  };
}
interface DeploymentCatalog extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  status: string;
  registryStatus: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  records: DeploymentRecord[];
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function assertString(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(Number.isFinite(Date.parse(value)), `${label} must be an RFC 3339 timestamp`);
}

function assertFutureTimestamp(value: unknown, label: string): void {
  assertTimestamp(value, label);
  assert(Date.parse(value) > Date.now(), `${label} has expired and requires re-verification`);
}

function assertAddress(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(addressPattern.test(value), `${label} must be a normalized non-zero EVM address`);
  assert(value !== "0x0000000000000000000000000000000000000000", `${label} must not be zero`);
}

function assertHash(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(hashPattern.test(value), `${label} must be a normalized 32-byte hash`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(sha256Pattern.test(value), `${label} must be a SHA-256 digest`);
}

function assertBlockNumber(value: unknown, label: string): asserts value is number {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    `${label} must be a safe block number`,
  );
}

function assertUnique(values: readonly (string | number)[], label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate '${value}'`);
    seen.add(value);
  }
}

function assertReference(
  reference: unknown,
  expected: Record<string, unknown>,
  label: string,
): asserts reference is Reference {
  assert(reference && typeof reference === "object", `${label} must be a logical reference`);
  const referenceObject = reference as JsonObject;
  const expectedKeys = new Set(Object.keys(expected));
  assert(
    Object.keys(referenceObject).every((key) => expectedKeys.has(key)) &&
      Object.keys(referenceObject).length === expectedKeys.size,
    `${label} has unexpected fields`,
  );
  for (const [key, value] of Object.entries(expected)) {
    assert(referenceObject[key] === value, `${label}.${key} must be '${String(value)}'`);
  }
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
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

async function loadJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function assertHttpsUrl(value: unknown, label: string): void {
  assertString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a URL`);
  }
  assert(parsed.protocol === "https:", `${label} must use HTTPS`);
}

function assertEvidenceCoordinate(
  coordinate: unknown,
  label: string,
  requireTimestamp = false,
  allowMaintenanceActivation = false,
): asserts coordinate is Coordinate {
  const value = object(coordinate, label) as Coordinate;
  assertBlockNumber(value.blockNumber, `${label} blockNumber`);
  if (allowMaintenanceActivation && value.activationKind === "maintenance-precompile-call") {
    assertHash(value.transactionHash, `${label} transactionHash`);
    assertString(value.method, `${label} method`);
  } else if (
    allowMaintenanceActivation &&
    ["genesis-first-observable-block", "hard-fork"].includes(value.activationKind ?? "")
  ) {
    assert(value.transactionHash === null, `${label} transactionHash must be null`);
    assertString(value.release, `${label} release`);
  } else {
    assertHash(value.transactionHash, `${label} transactionHash`);
    assert(value.activationKind === undefined, `${label} activationKind is invalid`);
  }
  if (value.logIndex !== undefined) {
    assert(
      Number.isSafeInteger(value.logIndex) && value.logIndex >= 0,
      `${label} logIndex is invalid`,
    );
  }
  if (value.blockHash !== undefined) assertHash(value.blockHash, `${label} blockHash`);
  if (requireTimestamp) assertTimestamp(value.blockTimestamp, `${label} blockTimestamp`);
}

function coordinateEqual(left: Coordinate, right: Coordinate): boolean {
  return (
    left.blockNumber === right.blockNumber &&
    left.transactionHash === right.transactionHash &&
    left.logIndex === right.logIndex
  );
}

function coordinateCompare(left: Coordinate, right: Coordinate): number {
  return left.blockNumber - right.blockNumber || (left.logIndex ?? -1) - (right.logIndex ?? -1);
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await listJsonFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".json")) results.push(path);
  }
  return results;
}

const index = await loadJson<ContractIndex>(join(knowledgeDirectory, "index.json"));
assert(index.schemaVersion === 1, "contract index schemaVersion must be 1");
assert(index.knowledgeVersion === "0.4", "contract index knowledgeVersion must be 0.4");
assert(index.kind === "knowledge-module-index", "contract index kind is invalid");
assert(index.id === "contracts" && index.moduleId === "contracts", "contract module ID is invalid");
assert(index.owner === "contracts-registry", "contract index owner is invalid");
assert(index.status === "verified", "contract index status is invalid");
assert(
  index.extensions?.registryStatus === "verified-current",
  "contract registry status is invalid",
);
assert(index.supportStatus === "supported", "contract support must be accepted");
assert(index.reviewStatus === "accepted", "contract index must record its accepted Level 3 review");
assertTimestamp(index.verifiedAt, "contract index verifiedAt");
assertFutureTimestamp(index.reviewAfter, "contract index reviewAfter");
assert(
  Array.isArray(index.scope?.contractIds) && index.scope.contractIds.length > 0,
  "contract index scope is invalid",
);
assert(
  Array.isArray(index.limitations) && index.limitations.length > 0,
  "contract index needs limitations",
);

for (const schemaResource of index.resources.filter((resource) => resource.role === "schema")) {
  const resolvedSchema = await resolveKnowledgeResource(repositoryRoot, {
    moduleId: "contracts",
    resourceId: schemaResource.id,
  });
  const schema = await loadJson<JsonObject>(resolvedSchema.path);
  assert(
    schema.$schema === "https://json-schema.org/draft/2020-12/schema",
    `${schemaResource.id} must use JSON Schema draft 2020-12`,
  );
  for (const match of JSON.stringify(schema).matchAll(/"\$ref":"([^"]+)"/g)) {
    const reference = match[1] ?? fail("schema reference capture is missing");
    if (/^[a-z]+:/i.test(reference)) continue;
    const [schemaPath] = reference.split("#", 1);
    if (schemaPath) await loadJson<unknown>(resolve(dirname(resolvedSchema.path), schemaPath));
  }
}

const networkRecords = await Promise.all(
  index.extensions.networkReferences.map(
    async (reference) =>
      object(
        (await loadKnowledgeReference(repositoryRoot, reference)).document,
        `network ${reference.resourceId}`,
      ) as Network,
  ),
);
const networksById = new Map(networkRecords.map((network) => [network.id, network]));

const sources = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-sources",
  })
).document as SourceCatalog;
assert(sources.schemaVersion === 1, "contract source catalog schemaVersion must be 1");
assert(sources.kind === "contract-source-catalog", "contract source catalog kind is invalid");
assert(sources.id === "contract-sources", "contract source catalog ID is invalid");
assert(sources.status === "verified", "contract source catalog status is invalid");
assert(sources.supportStatus === "none", "contract source catalog cannot create support");
assert(sources.reviewStatus === "accepted", "contract source review must be accepted");
assertTimestamp(sources.verifiedAt, "contract source catalog verifiedAt");
assertFutureTimestamp(sources.reviewAfter, "contract source catalog reviewAfter");
assert(
  Array.isArray(sources.limitations) && sources.limitations.length > 0,
  "contract sources need limitations",
);
assert(Array.isArray(sources.sources) && sources.sources.length > 0, "source catalog is empty");
assertUnique(
  sources.sources.map((source) => source.id),
  "source IDs",
);
const sourcesById = new Map<string, Source>();
for (const source of sources.sources) {
  assert(contractIdPattern.test(source.id), `source ID '${source.id}' is invalid`);
  assertString(source.kind, `source ${source.id} kind`);
  assertString(source.note, `source ${source.id} note`);
  if (source.repository) {
    assertHttpsUrl(source.repository, `source ${source.id} repository`);
    assertString(source.commit, `source ${source.id} commit`);
    assert(commitPattern.test(source.commit), `source ${source.id} commit must be a full SHA`);
    if (source.kind === "official-source-and-deployment-artifacts") {
      assertString(source.license, `source ${source.id} license`);
    }
  }
  if (source.url) {
    assertHttpsUrl(source.url, `source ${source.id} URL`);
    assertString(source.commit, `source ${source.id} commit`);
    assert(commitPattern.test(source.commit), `source ${source.id} commit must be a full SHA`);
    assertString(source.path, `source ${source.id} path`);
    assertSha256(source.sha256, `source ${source.id} sha256`);
    assertTimestamp(source.retrievedAt, `source ${source.id} retrievedAt`);
  }
  if (
    source.kind === "on-chain-and-verified-explorer-observation" ||
    source.kind === "on-chain-explorer-executable-reproduction" ||
    source.kind === "official-provider-source-and-on-chain-observation"
  ) {
    assertReference(
      source.reference,
      { moduleId: "contracts", resourceId: source.reference?.resourceId },
      `source ${source.id} reference`,
    );
    const evidenceResource = await resolveKnowledgeResource(repositoryRoot, source.reference);
    assert(
      (await sha256(evidenceResource.path)) === source.sha256,
      `source ${source.id} evidence digest drifted`,
    );
    const minimumEndpointCount =
      source.kind === "on-chain-explorer-executable-reproduction" ? 1 : 2;
    const endpoints = source.endpoints;
    assert(
      Array.isArray(endpoints) && endpoints.length >= minimumEndpointCount,
      `${source.id} endpoints are incomplete`,
    );
    for (const endpoint of endpoints) assertHttpsUrl(endpoint, `${source.id} endpoint`);
    const sourceEvidence = await loadJson<EvidenceSet>(evidenceResource.path);
    if (sourceEvidence.observations.some((observation) => observation.proxy?.historyEvidence)) {
      const requiredEndpoints = sourceEvidence.networkSnapshots.flatMap((snapshot) =>
        [snapshot.rpcUrl, snapshot.explorerApiUrl].filter(Boolean),
      );
      assert(
        requiredEndpoints.every((endpoint) => endpoints.includes(endpoint)),
        `${source.id} does not declare every proxy-history evidence endpoint`,
      );
    }
  }
  sourcesById.set(source.id, source);
}

assert(Array.isArray(sources.sourceArtifacts), "sourceArtifacts must be an array");
assertUnique(
  sources.sourceArtifacts.map((artifact) => `${artifact.sourceId}:${artifact.path}`),
  "source artifact keys",
);
const sourceArtifactsByKey = new Map<string, SourceArtifact>();
for (const artifact of sources.sourceArtifacts) {
  assert(sourcesById.has(artifact.sourceId), `artifact ${artifact.path} has an unknown source`);
  assertString(artifact.path, `artifact ${artifact.sourceId} path`);
  assertSha256(artifact.sha256, `artifact ${artifact.sourceId}:${artifact.path} sha256`);
  sourceArtifactsByKey.set(`${artifact.sourceId}:${artifact.path}`, artifact);
}

const abiCatalog = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-abis",
  })
).document as AbiCatalog;
assert(abiCatalog.schemaVersion === 1, "ABI catalog schemaVersion must be 1");
assert(abiCatalog.kind === "contract-abi-catalog", "ABI catalog kind is invalid");
assert(abiCatalog.id === "contract-abis", "ABI catalog ID is invalid");
assert(abiCatalog.status === "verified", "ABI catalog status is invalid");
assert(abiCatalog.registryStatus === "verified-current", "ABI registry status is invalid");
assert(abiCatalog.supportStatus === "supported", "ABI support must be accepted");
assert(abiCatalog.reviewStatus === "accepted", "ABI catalog review must be accepted");
assertTimestamp(abiCatalog.verifiedAt, "ABI catalog verifiedAt");
assertFutureTimestamp(abiCatalog.reviewAfter, "ABI catalog reviewAfter");
assert(
  Array.isArray(abiCatalog.limitations) && abiCatalog.limitations.length > 0,
  "ABI catalog needs limitations",
);
assert(Array.isArray(abiCatalog.records) && abiCatalog.records.length > 0, "ABI catalog is empty");
assertUnique(
  abiCatalog.records.map((record) => record.contractId),
  "ABI contract IDs",
);
assertUnique(
  abiCatalog.records.map((record) => record.artifactReference.resourceId),
  "ABI artifact references",
);

const abisByContractId = new Map<string, { record: AbiRecord; abi: JsonObject[]; path: string }>();
for (const record of abiCatalog.records) {
  assert(
    contractIdPattern.test(record.contractId),
    `ABI contract ID '${record.contractId}' is invalid`,
  );
  assert(record.id === record.contractId, `${record.contractId} ABI record ID differs`);
  assertAbiProvenance(record, record.contractId);
  assert(record.status === "verified", `${record.contractId} ABI status must be verified`);
  if (record.reviewStatus === "accepted") {
    assert(
      record.supportStatus === "supported",
      `${record.contractId} accepted ABI must be supported`,
    );
  } else {
    assert(
      record.reviewStatus === "pending-qualified-review" && record.supportStatus === "proposed",
      `${record.contractId} unaccepted ABI must remain proposed and pending qualified review`,
    );
  }
  assert(
    Array.isArray(record.limitations) && record.limitations.length >= 2,
    `${record.contractId} ABI limitations are incomplete`,
  );
  assertReference(
    record.artifactReference,
    { moduleId: "contracts", resourceId: `abi.${record.contractId}` },
    `${record.contractId} ABI artifact reference`,
  );
  const artifactResource = await resolveKnowledgeResource(repositoryRoot, record.artifactReference);
  const path = artifactResource.path;
  assertSha256(record.fileSha256, `${record.contractId} ABI fileSha256`);
  assert(
    (await sha256(path)) === record.fileSha256,
    `${record.contractId} ABI file digest drifted`,
  );
  const abi = objects(await loadJson<unknown>(path), `${record.contractId} ABI`);
  assert(
    Array.isArray(abi) && abi.length > 0,
    `${record.contractId} ABI must be a non-empty full array`,
  );
  assert(record.entryCount === abi.length, `${record.contractId} ABI entry count drifted`);
  const canonicalDigest = createHash("sha256")
    .update(JSON.stringify(canonicalize(abi)))
    .digest("hex");
  assert(canonicalDigest === record.abiSha256, `${record.contractId} canonical ABI digest drifted`);
  assert(
    abiSemanticDigest(abi) === record.abiSemanticSha256,
    `${record.contractId} semantic ABI digest drifted`,
  );
  assertReference(
    record.sourceReference,
    {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: record.sourceReference.recordId,
    },
    `${record.contractId} ABI source reference`,
  );
  assert(
    sourcesById.has(record.sourceReference.recordId),
    `${record.contractId} ABI source is unknown`,
  );
  for (const artifact of record.sourceArtifacts) {
    const sourceArtifact = sourceArtifactsByKey.get(
      `${record.sourceReference.recordId}:${artifact.path}`,
    );
    assert(sourceArtifact, `${record.contractId} ABI source artifact is missing`);
    assert(
      sourceArtifact.sha256 === artifact.sha256,
      `${record.contractId} source artifact digest differs`,
    );
  }
  abisByContractId.set(record.contractId, { record, abi, path });
}

const knownAbiPaths = new Set([...abisByContractId.values()].map(({ path }) => resolve(path)));
const actualAbiPaths = await listJsonFiles(join(knowledgeDirectory, "artifacts", "abis"));
for (const path of actualAbiPaths) {
  assert(
    knownAbiPaths.has(resolve(path)),
    `untracked ABI snapshot ${relative(repositoryRoot, path)}`,
  );
}
assert(actualAbiPaths.length === knownAbiPaths.size, "ABI catalog and ABI directory counts differ");

const deployments = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
  })
).document as DeploymentCatalog;

const evidenceResources = index.resources.filter((resource) => resource.role === "evidence");
const evidenceResourceIds = new Set(evidenceResources.map((resource) => resource.id));
const evidenceSets = await Promise.all(
  evidenceResources.map(
    async (resource) =>
      (
        await loadKnowledgeReference(repositoryRoot, {
          moduleId: "contracts",
          resourceId: resource.id,
        })
      ).document as EvidenceSet,
  ),
);
const evidenceSetsByResourceId = new Map(
  evidenceResources.map((resource, index) => [resource.id, evidenceSets[index]]),
);
for (const evidence of evidenceSets) await assertOracleCaptureEvidence(repositoryRoot, evidence);
const evidenceByObservationId = new Map<string, EvidenceSet>();
const observations = evidenceSets.flatMap((evidence) => {
  assert(evidence.schemaVersion === 1, `evidence ${evidence.id} schemaVersion must be 1`);
  assert(evidence.kind === "contract-observation-set", `evidence ${evidence.id} kind is invalid`);
  assert(evidence.owner === "contracts-registry", `evidence ${evidence.id} owner is invalid`);
  assert(evidence.status === "verified", `evidence ${evidence.id} status is invalid`);
  assert(evidence.supportStatus === "none", `evidence ${evidence.id} cannot create support`);
  assert(
    ["accepted", "pending-qualified-review"].includes(evidence.reviewStatus),
    `evidence ${evidence.id} review state is invalid`,
  );
  assertTimestamp(evidence.verifiedAt, `${evidence.id} verifiedAt`);
  assert(
    Array.isArray(evidence.limitations) && evidence.limitations.length > 0,
    `${evidence.id} needs limitations`,
  );
  assertTimestamp(evidence.observedFrom, `${evidence.id} observedFrom`);
  assertTimestamp(evidence.observedThrough, `${evidence.id} observedThrough`);
  if (evidence.reviewAfter === null) {
    assert(
      evidence.reviewStatus === "accepted",
      `${evidence.id} historical evidence must already be accepted`,
    );
    assertReference(
      evidence.supersededBy,
      {
        moduleId: "contracts",
        resourceId: evidence.supersededBy?.resourceId,
      },
      `${evidence.id} supersededBy`,
    );
    assert(
      evidence.supersededBy.resourceId !== evidence.id &&
        evidenceSetsByResourceId.has(evidence.supersededBy.resourceId),
      `${evidence.id} supersession target must be a different indexed evidence resource`,
    );
  } else {
    assertTimestamp(evidence.reviewAfter, `${evidence.id} reviewAfter`);
    if (requiresEvidenceFreshness(evidence.id, selectedNetwork, deployments.records)) {
      assertFutureTimestamp(evidence.reviewAfter, `${evidence.id} reviewAfter`);
    }
    assert(
      evidence.supersededBy === null || evidence.supersededBy === undefined,
      `${evidence.id} current evidence must not declare a supersession target`,
    );
  }
  assert(
    Array.isArray(evidence.methodology) && evidence.methodology.length >= 5,
    `${evidence.id} methodology is incomplete`,
  );
  assert(Array.isArray(evidence.networkSnapshots), `${evidence.id} network snapshots are missing`);
  for (const snapshot of evidence.networkSnapshots) {
    const network = networksById.get(snapshot.networkId);
    assert(network, `${evidence.id} snapshot references unknown network ${snapshot.networkId}`);
    assert(
      snapshot.evmChainId === network.values.evmChainId,
      `${snapshot.networkId} snapshot chain ID differs`,
    );
    assertBlockNumber(snapshot.blockNumber, `${snapshot.networkId} snapshot blockNumber`);
    assertHash(snapshot.blockHash, `${snapshot.networkId} snapshot blockHash`);
    assertTimestamp(snapshot.blockTimestamp, `${snapshot.networkId} snapshot timestamp`);
    assertHttpsUrl(snapshot.rpcUrl, `${snapshot.networkId} snapshot RPC`);
    assertHttpsUrl(snapshot.explorerApiUrl, `${snapshot.networkId} snapshot explorer API`);
  }
  for (const observation of evidence.observations) {
    assert(
      !evidenceByObservationId.has(observation.id),
      `contract observation IDs contains duplicate '${observation.id}'`,
    );
    evidenceByObservationId.set(observation.id, evidence);
  }
  return evidence.observations;
});
assertUnique(
  observations.map((observation) => observation.id),
  "contract observation IDs",
);
assertUnique(
  observations.map(
    (observation) => `${observation.deploymentId}:${observation.observationBlock.number}`,
  ),
  "observed deployment/block coordinates",
);
const observationsById = new Map(observations.map((observation) => [observation.id, observation]));

assert(deployments.schemaVersion === 1, "deployment catalog schemaVersion must be 1");
assert(deployments.kind === "contract-deployment-catalog", "deployment catalog kind is invalid");
assert(deployments.id === "contract-deployments", "deployment catalog ID is invalid");
assert(deployments.status === "verified", "deployment catalog status is invalid");
assert(deployments.registryStatus === "verified-current", "deployment registry status is invalid");
assert(deployments.supportStatus === "supported", "deployment support must be accepted");
assert(deployments.reviewStatus === "accepted", "deployment review must be accepted");
assertTimestamp(deployments.verifiedAt, "deployment verifiedAt");
assertFutureTimestamp(deployments.reviewAfter, "deployment reviewAfter");
assert(
  Array.isArray(deployments.limitations) && deployments.limitations.length > 0,
  "deployment catalog needs limitations",
);
assert(
  Array.isArray(deployments.records) && deployments.records.length > 0,
  "deployment catalog is empty",
);
assertUnique(
  deployments.records.map((record) => record.id),
  "deployment IDs",
);
assertUnique(
  deployments.records
    .filter((record) => record.status === "verified-current")
    .map((record) => `${record.networkId}:${record.address}`),
  "current network deployment addresses",
);
for (const record of deployments.records) {
  const deploymentPrefix = `${record.contractId}@${record.networkId}`;
  assert(
    record.id === deploymentPrefix ||
      new RegExp(`^${deploymentPrefix.replaceAll(".", "\\.")}#[a-z0-9][a-z0-9-]*$`).test(record.id),
    `${record.id} is not a canonical deployment ID`,
  );
  assert(contractIdPattern.test(record.contractId), `${record.id} contract ID is invalid`);
  assertString(record.contractName, `${record.id} contractName`);
  assertString(record.sourceContractName, `${record.id} sourceContractName`);
  assertString(record.protocol, `${record.id} protocol`);
  assert(
    Array.isArray(record.domains) && record.domains.length > 0,
    `${record.id} domains are missing`,
  );
  assertUnique(record.domains, `${record.id} domains`);
  const network = networksById.get(record.networkId);
  assert(network, `${record.id} references unknown network ${record.networkId}`);
  assert(
    record.environment === network.environment,
    `${record.id} environment differs from network record`,
  );
  assertAddress(record.address, `${record.id} address`);
  assertDeploymentProvenance(record, record.id);
  assert(
    ["direct", "transparent-proxy", "erc1967-proxy", "precompile"].includes(record.contractType),
    `${record.id} contract type is invalid`,
  );
  assert(
    ["verified-current", "verified-superseded"].includes(record.status),
    `${record.id} status is invalid`,
  );
  if (record.reviewStatus === "accepted") {
    assert(
      record.supportStatus === (record.status === "verified-current" ? "supported" : "historical"),
      `${record.id} accepted support status disagrees with deployment status`,
    );
  } else {
    assert(
      record.reviewStatus === "pending-qualified-review" && record.supportStatus === "proposed",
      `${record.id} unaccepted deployment must remain proposed and pending qualified review`,
    );
  }
  assert(
    Array.isArray(record.limitations) && record.limitations.length >= 2,
    `${record.id} limitations are incomplete`,
  );

  const maintenanceActivated = record.contractType === "precompile";
  assertEvidenceCoordinate(
    record.validity?.deploymentFrom,
    `${record.id} deploymentFrom`,
    false,
    maintenanceActivated,
  );
  assertEvidenceCoordinate(
    record.validity?.currentCodeFrom,
    `${record.id} currentCodeFrom`,
    false,
    maintenanceActivated,
  );
  if (record.status === "verified-current") {
    assert(
      record.validity.effectiveUntilExclusive === null,
      `${record.id} current range must be open`,
    );
  } else {
    assertEvidenceCoordinate(
      record.validity.effectiveUntilExclusive,
      `${record.id} effectiveUntilExclusive`,
      false,
      maintenanceActivated,
    );
  }

  const abi = abisByContractId.get(record.contractId);
  assert(abi, `${record.id} references an unknown ABI contract ID`);
  assert(
    abi.record.provenanceClass === record.provenanceClass,
    `${record.id} deployment and ABI provenance classes differ`,
  );
  assert(
    abi.record.intendedNetworkIds.includes(record.networkId),
    `${record.id} is outside its ABI intended network scope`,
  );
  assertReference(
    record.abi.catalogReference,
    { moduleId: "contracts", resourceId: "contract-abis", recordId: record.contractId },
    `${record.id} ABI catalog reference`,
  );
  assert(
    record.abi.appliesTo ===
      (["transparent-proxy", "erc1967-proxy"].includes(record.contractType)
        ? "current-implementation-through-proxy"
        : "deployment"),
    `${record.id} ABI application scope is invalid`,
  );

  const sourceId = record.source.sourceReference.recordId;
  assertReference(
    record.source.sourceReference,
    { moduleId: "contracts", resourceId: "contract-sources", recordId: sourceId },
    `${record.id} source reference`,
  );
  const source = sourcesById.get(sourceId);
  assert(source, `${record.id} source is unknown`);
  const artifact = sourceArtifactsByKey.get(`${sourceId}:${record.source.artifactPath}`);
  assert(artifact, `${record.id} source artifact is absent from the catalog`);

  assertTimestamp(record.runtime?.observedAt, `${record.id} observedAt`);
  assertBlockNumber(record.runtime.blockNumber, `${record.id} runtime blockNumber`);
  assertHash(record.runtime.blockHash, `${record.id} runtime blockHash`);
  assertSha256(record.runtime.addressCodeSha256, `${record.id} runtime code digest`);

  if (["transparent-proxy", "erc1967-proxy"].includes(record.contractType)) {
    assert(record.proxy, `${record.id} proxy metadata is missing`);
    assert(
      record.proxy.implementationSlot === implementationSlot,
      `${record.id} implementation slot is invalid`,
    );
    if (record.contractType === "transparent-proxy") {
      assert(
        record.proxy.standard === "eip-1967-transparent",
        `${record.id} proxy standard is invalid`,
      );
      assert(record.proxy.adminSlot === adminSlot, `${record.id} admin slot is invalid`);
      assertAddress(record.proxy.adminAddress, `${record.id} proxy admin`);
    } else {
      assert(record.proxy.standard === "eip-1967-uups", `${record.id} proxy standard is invalid`);
      assert(record.proxy.adminSlot === null, `${record.id} UUPS proxy admin slot must be null`);
      assert(record.proxy.adminAddress === null, `${record.id} UUPS proxy admin must be null`);
    }
    assertAddress(record.proxy.currentImplementationAddress, `${record.id} implementation`);
    assert(
      record.source.declaredImplementationAddress === record.proxy.currentImplementationAddress,
      `${record.id} source and observed implementation differ`,
    );
    assertSha256(
      record.runtime.implementationCodeSha256,
      `${record.id} implementation code digest`,
    );
    assert(
      Array.isArray(record.proxy.implementationHistory) &&
        record.proxy.implementationHistory.length > 0,
      `${record.id} implementation history is empty`,
    );
    const firstHistory =
      record.proxy.implementationHistory[0] ?? fail(`${record.id} first history entry is missing`);
    const currentHistory =
      record.proxy.implementationHistory.at(-1) ??
      fail(`${record.id} current history entry is missing`);
    assert(
      currentHistory.implementationAddress === record.proxy.currentImplementationAddress,
      `${record.id} current implementation is not the last history record`,
    );
    assert(
      coordinateEqual(record.validity.currentCodeFrom, currentHistory.effectiveFrom),
      `${record.id} current validity does not start at its last upgrade`,
    );
    assert(
      record.validity.deploymentFrom.blockNumber === firstHistory.effectiveFrom.blockNumber &&
        record.validity.deploymentFrom.transactionHash ===
          firstHistory.effectiveFrom.transactionHash,
      `${record.id} deployment validity does not start at its first implementation`,
    );
    for (let index = 0; index < record.proxy.implementationHistory.length; index += 1) {
      const history =
        record.proxy.implementationHistory[index] ??
        fail(`${record.id} history entry ${index} is missing`);
      assertAddress(history.implementationAddress, `${record.id} history implementation ${index}`);
      assertEvidenceCoordinate(
        history.effectiveFrom,
        `${record.id} history ${index} effectiveFrom`,
        true,
      );
      const next = record.proxy.implementationHistory[index + 1];
      if (next) {
        assert(
          coordinateCompare(history.effectiveFrom, next.effectiveFrom) < 0,
          `${record.id} implementation history is not strictly ordered`,
        );
        assert(
          history.effectiveUntilExclusive,
          `${record.id} history ${index} must close at next upgrade`,
        );
        assert(
          coordinateEqual(history.effectiveUntilExclusive, next.effectiveFrom),
          `${record.id} history ${index} overlaps or leaves a gap`,
        );
      } else {
        assert(
          history.effectiveUntilExclusive === null,
          `${record.id} current implementation must be open-ended`,
        );
      }
    }
  } else {
    assert(record.proxy === null, `${record.id} direct contract must not contain proxy metadata`);
    assert(
      record.source.declaredImplementationAddress === null,
      `${record.id} direct source must not declare an implementation`,
    );
    assert(
      record.runtime.implementationCodeSha256 === null,
      `${record.id} direct contract has an implementation digest`,
    );
  }

  const evidenceObservationId = record.evidenceReference.recordId;
  assert(
    record.evidenceReference?.moduleId === "contracts",
    `${record.id} evidence module must be contracts`,
  );
  assert(
    evidenceResourceIds.has(record.evidenceReference?.resourceId),
    `${record.id} evidence resource is not indexed`,
  );
  assert(
    Object.keys(record.evidenceReference).length === 3 &&
      record.evidenceReference.recordId === evidenceObservationId,
    `${record.id} evidence reference has unexpected fields`,
  );
  const observation = observationsById.get(evidenceObservationId);
  assert(observation, `${record.id} evidence observation is missing`);
  assert(observation.deploymentId === record.id, `${record.id} evidence does not link back`);
  assert(observation.networkId === record.networkId, `${record.id} evidence network differs`);
  assert(observation.outcome === "passed", `${record.id} evidence did not pass`);
  if (record.proxy) {
    assert(observation.proxy, `${record.id} proxy observation is missing`);
    for (const field of [
      "standard",
      "implementationSlot",
      "adminSlot",
      "adminAddress",
      "currentImplementationAddress",
    ]) {
      assert(
        observation.proxy[field] === record.proxy[field],
        `${record.id} observed proxy ${field} differs`,
      );
    }
    assert(
      JSON.stringify(observation.proxy.implementationHistory) ===
        JSON.stringify(record.proxy.implementationHistory),
      `${record.id} observed implementation history differs`,
    );

    const historyEvidence = observation.proxy.historyEvidence;
    if (record.source.sourceReference.recordId === economicSystemSourceId) {
      assert(historyEvidence, `${record.id} complete proxy-history evidence is missing`);
    }
    if (historyEvidence) {
      const historySourceId = record.source.sourceReference.recordId;
      assert(
        historyEvidence.eventTopic === upgradedTopic,
        `${record.id} upgrade event topic differs`,
      );
      assert(
        historyEvidence.observedEventCount === record.proxy.implementationHistory.length,
        `${record.id} upgrade event count differs from implementation history`,
      );
      assertString(
        historyEvidence.historicalGenerationPolicy,
        `${record.id} historical generation policy`,
      );
      const eventArtifact = historyEvidence.eventSourceArtifact;
      assertString(eventArtifact?.path, `${record.id} upgrade event artifact path`);
      assertSha256(eventArtifact?.sha256, `${record.id} upgrade event artifact digest`);
      assert(
        sourceArtifactsByKey.get(`${historySourceId}:${eventArtifact.path}`)?.sha256 ===
          eventArtifact.sha256,
        `${record.id} upgrade event artifact is not pinned in the source catalog`,
      );
      assert(
        Array.isArray(historyEvidence.slotBoundaries) &&
          historyEvidence.slotBoundaries.length === record.proxy.implementationHistory.length,
        `${record.id} implementation slot boundary evidence is incomplete`,
      );
      assert(
        Array.isArray(historyEvidence.generationSources) &&
          historyEvidence.generationSources.length === record.proxy.implementationHistory.length,
        `${record.id} generation source provenance is incomplete`,
      );
      for (let index = 0; index < record.proxy.implementationHistory.length; index += 1) {
        const history =
          record.proxy.implementationHistory[index] ??
          fail(`${record.id} history entry ${index} is missing`);
        const previous = record.proxy.implementationHistory[index - 1];
        const boundary =
          historyEvidence.slotBoundaries[index] ??
          fail(`${record.id} slot boundary ${index} is missing`);
        const generation =
          historyEvidence.generationSources[index] ??
          fail(`${record.id} generation source ${index} is missing`);
        assert(
          boundary.blockNumber === history.effectiveFrom.blockNumber &&
            boundary.previousBlockNumber === history.effectiveFrom.blockNumber - 1,
          `${record.id} slot boundary ${index} coordinate differs`,
        );
        assert(
          boundary.implementationAt === history.implementationAddress,
          `${record.id} slot boundary ${index} active implementation differs`,
        );
        assert(
          boundary.implementationBefore ===
            (previous?.implementationAddress ?? "0x0000000000000000000000000000000000000000"),
          `${record.id} slot boundary ${index} previous implementation differs`,
        );
        assert(
          generation.implementationAddress === history.implementationAddress,
          `${record.id} generation source ${index} address differs`,
        );
        assert(
          generation.isVerified === true &&
            generation.isFullyVerified === true &&
            generation.isPartiallyVerified === false,
          `${record.id} generation source ${index} is not fully explorer-verified`,
        );
        assert(
          generation.executableReproduction ===
            (index === record.proxy.implementationHistory.length - 1
              ? "exact-current-generation"
              : "not-reproduced-historical-generation"),
          `${record.id} generation source ${index} reproduction scope differs`,
        );
        assertString(
          generation.sourceArtifact?.path,
          `${record.id} generation source ${index} artifact path`,
        );
        assertSha256(
          generation.sourceArtifact?.sha256,
          `${record.id} generation source ${index} artifact digest`,
        );
        assert(
          sourceArtifactsByKey.get(`${historySourceId}:${generation.sourceArtifact.path}`)
            ?.sha256 === generation.sourceArtifact.sha256,
          `${record.id} generation source ${index} artifact is not pinned in the source catalog`,
        );
      }
    }
  } else {
    assert(observation.proxy === null, `${record.id} direct-contract observation has proxy data`);
  }
  assert(
    observation.observationBlock.number === record.runtime.blockNumber,
    `${record.id} evidence block differs`,
  );
  assert(
    observation.observationBlock.hash === record.runtime.blockHash,
    `${record.id} evidence block hash differs`,
  );
  assert(
    observation.runtime.addressCodeSha256 === record.runtime.addressCodeSha256,
    `${record.id} evidence code digest differs`,
  );
  assert(
    observation.runtime.implementationCodeSha256 === record.runtime.implementationCodeSha256,
    `${record.id} evidence implementation digest differs`,
  );
  if (record.provenanceClass === "official-artifact-fully-verified-deployment") {
    assert(
      observation.explorer.officialArtifactAbiMatch === true,
      `${record.id} explorer ABI was not matched`,
    );
    assert(
      observation.explorer.rpcBytecodeMatch === true,
      `${record.id} explorer bytecode was not matched`,
    );
    assert(
      observation.explorer.activeContract.isVerified === true,
      `${record.id} explorer source is unverified`,
    );
    assert(
      observation.explorer.activeContract.isFullyVerified === true,
      `${record.id} explorer source is not fully verified`,
    );
    assert(
      observation.explorer.activeContract.isPartiallyVerified === false,
      `${record.id} explorer source is partial`,
    );
    assert(
      observation.explorer.activeContract.abiSemanticSha256 === abi.record.abiSemanticSha256,
      `${record.id} explorer ABI digest differs`,
    );
    assert(
      observation.explorer.activeContract.deployedBytecodeSha256 ===
        (record.proxy ? record.runtime.implementationCodeSha256 : record.runtime.addressCodeSha256),
      `${record.id} explorer bytecode digest differs`,
    );
  } else if (record.provenanceClass === "deployed-executable-reproduction") {
    assert(
      observation.explorer.activeContract.isVerified ===
        record.provenanceEvidence.reproduction.explorerVerification.isVerified &&
        observation.explorer.activeContract.isFullyVerified ===
          record.provenanceEvidence.reproduction.explorerVerification.isFullyVerified &&
        observation.explorer.activeContract.isPartiallyVerified ===
          record.provenanceEvidence.reproduction.explorerVerification.isPartiallyVerified,
      `${record.id} explorer verification labels were not preserved exactly`,
    );
  } else if (
    record.provenanceClass === "official-deployment-repository-live-configuration" &&
    record.source.sourceReference.recordId === pythSourceId
  ) {
    const effectiveAbiSource = observation.explorer.effectiveAbiSource;
    assert(effectiveAbiSource, `${record.id} effective ABI source is missing`);
    assert(
      observation.explorer.currentImplementationVerificationLabelPreserved === true,
      `${record.id} current implementation verification label was not preserved`,
    );
    assert(
      observation.explorer.providerGenerationAbiMatch === true,
      `${record.id} provider generation ABI did not match`,
    );
    assert(observation.explorer.rpcBytecodeMatch === true, `${record.id} RPC bytecode drifted`);
    assert(
      observation.explorer.activeContract.isVerified === false &&
        observation.explorer.activeContract.isFullyVerified === false &&
        observation.explorer.activeContract.isPartiallyVerified === false,
      `${record.id} active implementation verification labels differ`,
    );
    assert(
      observation.explorer.activeContract.deployedBytecodeSha256 ===
        record.runtime.implementationCodeSha256,
      `${record.id} active implementation bytecode digest differs`,
    );
    assert(
      effectiveAbiSource.isVerified === true &&
        effectiveAbiSource.isFullyVerified === true &&
        effectiveAbiSource.isPartiallyVerified === false,
      `${record.id} effective ABI source is not fully explorer-verified`,
    );
    assert(
      effectiveAbiSource.abiSemanticSha256 === abi.record.abiSemanticSha256,
      `${record.id} effective ABI source digest differs`,
    );
    assert(
      record.reviewStatus === "accepted" && record.supportStatus === "supported",
      `${record.id} cross-source ABI reconciliation must retain oracle re-verification acceptance`,
    );
  }
  assertEvidenceCoordinate(
    observation.activation,
    `${record.id} activation`,
    true,
    maintenanceActivated,
  );
  assert(
    observation.activation.blockNumber === record.validity.deploymentFrom.blockNumber &&
      observation.activation.transactionHash === record.validity.deploymentFrom.transactionHash &&
      observation.activation.blockHash === record.validity.deploymentFrom.blockHash,
    `${record.id} activation and deployment validity differ`,
  );
}

const deploymentRanges = new Map<string, DeploymentRecord[]>();
for (const record of deployments.records) {
  const key = `${record.contractId}:${record.networkId}`;
  const ranges = deploymentRanges.get(key) ?? [];
  ranges.push(record);
  deploymentRanges.set(key, ranges);
}
for (const [key, records] of deploymentRanges) {
  records.sort(
    (left, right) =>
      left.validity.deploymentFrom.blockNumber - right.validity.deploymentFrom.blockNumber,
  );
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1] ?? fail(`${key} previous range is missing`);
    const current = records[index] ?? fail(`${key} current range is missing`);
    assert(
      previous.validity.effectiveUntilExclusive,
      `${key} has an open deployment range before ${current.id}`,
    );
    assert(
      previous.validity.effectiveUntilExclusive.blockNumber <=
        current.validity.deploymentFrom.blockNumber,
      `${key} deployment ranges overlap or cannot be ordered safely`,
    );
  }
}

// Per-observation supersession preserves mixed-network historical envelopes unchanged.
const supersededObservationIds = new Set<string>();
for (const current of observations) {
  if (current.supersedes === undefined) continue;
  const reference = object(current.supersedes, `${current.id} supersedes`);
  assertReference(
    reference,
    { moduleId: "contracts", resourceId: reference.resourceId, recordId: reference.recordId },
    `${current.id} supersedes`,
  );
  const prior = observationsById.get(String(reference.recordId));
  assert(
    prior && evidenceByObservationId.get(prior.id)?.id === reference.resourceId,
    `${current.id} superseded observation missing`,
  );
  assert(
    prior.networkId === current.networkId &&
      prior.deploymentId === current.deploymentId &&
      current.observationBlock.number > prior.observationBlock.number,
    `${current.id} invalid observation supersession`,
  );
  supersededObservationIds.add(prior.id);
}
const referencedObservationIds = new Set(
  deployments.records.map((record) => record.evidenceReference.recordId),
);
for (const observation of observations) {
  if (referencedObservationIds.has(observation.id)) continue;
  const evidence = evidenceByObservationId.get(observation.id);
  assert(
    (evidence?.reviewAfter === null &&
      evidence.supersededBy !== undefined &&
      evidence.supersededBy !== null) ||
      supersededObservationIds.has(observation.id),
    `${observation.id} is neither current deployment evidence nor superseded historical evidence`,
  );
}
assert(
  index.scope.contractIds.length === abisByContractId.size &&
    index.scope.contractIds.every((contractId) => abisByContractId.has(contractId)),
  "contract index scope and ABI catalog differ",
);
const candidates = await resolveKnowledgeResource(repositoryRoot, {
  moduleId: "contracts",
  resourceId: "contract-candidates",
});
await readFile(candidates.path, "utf8");

process.stdout.write(
  `Evidence freshness scope: ${selectedNetwork ?? "full registry"}. Validated ${abisByContractId.size} contract IDs, ${deployments.records.length} deployments, ` +
    `${observations.length} observations, and ${sources.sources.length} sources.\n`,
);
