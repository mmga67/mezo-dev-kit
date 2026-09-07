import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference, resolveKnowledgeResource } from "./lib/knowledge-reference.ts";
import { assertNetworkCapabilityProfile } from "./lib/network-profile.ts";
import { parseJson, type JsonObject } from "./lib/json.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const knowledgeDirectory = join(repositoryRoot, "knowledge", "networks");
const idPattern = /^[a-z][a-z0-9-]*$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const blockHashPattern = /^0x[a-f0-9]{64}$/;

interface Resource extends JsonObject {
  id: string;
  role: string;
}

interface NetworkIndex extends JsonObject {
  schemaVersion: number;
  knowledgeVersion: string;
  kind: string;
  id: string;
  moduleId: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  scope: { networkIds: string[] };
  limitations: unknown[];
  resources: Resource[];
}

interface Source extends JsonObject {
  id: string;
  kind: string;
  note: string;
  retrievedAt: string;
  sha256: string;
  url?: string;
  repository?: string;
  commit?: string;
  path?: string;
}

interface SourceCatalog extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: null;
  limitations: unknown[];
  sources: Source[];
  scope: { networkIds: string[] };
}

interface ClaimEvidence extends JsonObject {
  sourceId: string;
  locator: string;
  note: string;
}

interface Claim extends JsonObject {
  id: string;
  path: string;
  statement: string;
  classification: string;
  disposition: string;
  evidence: ClaimEvidence[];
}

interface NetworkRecord extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  environment: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  scope: { networkId: string; environment: string };
  values: {
    displayName: string;
    evmChainId: number;
    cosmosChainId?: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    explorer: { url: string };
  };
  claims: Claim[];
  limitations: unknown[];
}

interface Endpoint extends JsonObject {
  id: string;
  networkId: string;
  provider: string;
  transport: string;
  url: string;
  publicationStatus: string;
  publicationSourceId: string;
  supportStatus: string;
  operationalStatus: string;
  lastVerifiedAt: string;
  evidenceObservationId: string;
  limitations: unknown[];
}

interface EndpointCatalog extends JsonObject {
  schemaVersion: number;
  kind: string;
  id: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  records: Endpoint[];
}

interface Observation extends JsonObject {
  id: string;
  observedAt: string;
  outcome: string;
  methods: unknown[];
  endpointId?: string;
  targetUrl?: string;
  result?: {
    evmChainId?: number;
    latestBlock?: { number: number; hash: string; timestamp: string };
  };
  error?: { class?: string; summary?: string };
}

interface EvidenceSet extends JsonObject {
  schemaVersion: number;
  id: string;
  kind: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  observedFrom: string;
  observedThrough: string;
  methodology: unknown[];
  observations: Observation[];
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

function assertId(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(idPattern.test(value), `${label} must be lowercase kebab-case`);
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  assert(Number.isFinite(Date.parse(value)), `${label} must be an RFC 3339 timestamp`);
}

function assertReviewCurrent(value: unknown, label: string): void {
  assertTimestamp(value, label);
  assert(Date.parse(value) > Date.now(), `${label} has expired and requires re-verification`);
}

function assertUnique(values: readonly (string | number)[], label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate '${value}'`);
    seen.add(value);
  }
}

function getPath(source: JsonObject, dottedPath: string): unknown {
  let value: unknown = source;
  for (const key of dottedPath.split(".")) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as JsonObject)[key];
  }
  return value;
}

function repositoryPath(path: string): string {
  const absolute = resolve(repositoryRoot, path);
  const relation = relative(repositoryRoot, absolute);
  assert(
    !relation.startsWith("..") && !relation.includes("/../"),
    `path escapes repository: ${path}`,
  );
  return absolute;
}

async function loadJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function loadNetworkResource<T>(resourceId: string): Promise<T> {
  return (await loadKnowledgeReference(repositoryRoot, { moduleId: "networks", resourceId }))
    .document as T;
}

function assertHttpsUrl(value: unknown, label: string): void {
  assertString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  assert(parsed.protocol === "https:", `${label} must use HTTPS`);
}

function assertEndpointUrl(endpoint: Endpoint): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.url);
  } catch {
    fail(`endpoint ${endpoint.id} has an invalid URL`);
  }
  const expectedProtocol = endpoint.transport === "https" ? "https:" : "wss:";
  assert(
    parsed.protocol === expectedProtocol,
    `endpoint ${endpoint.id} transport and URL protocol differ`,
  );
}

const index = await loadJson<NetworkIndex>(join(knowledgeDirectory, "index.json"));
assert(index.schemaVersion === 1, "network index schemaVersion must be 1");
assert(index.knowledgeVersion === "0.4", "network index knowledgeVersion must be 0.4");
assert(index.kind === "knowledge-module-index", "network index kind is invalid");
assert(index.id === "networks" && index.moduleId === "networks", "network module ID is invalid");
assert(index.status === "verified", "network index must be evidence-verified");
assert(index.supportStatus === "supported", "network index must expose accepted support");
assert(index.reviewStatus === "accepted", "network index must record its accepted Level 3 review");
assertTimestamp(index.verifiedAt, "network index verifiedAt");
assertReviewCurrent(index.reviewAfter, "network index reviewAfter");
assert(
  Array.isArray(index.scope?.networkIds) && index.scope.networkIds.length === 4,
  "network index scope is invalid",
);
assert(
  Array.isArray(index.limitations) && index.limitations.length > 0,
  "network index needs limitations",
);

const resourceIds = index.resources.map((resource) => resource.id);
assertUnique(resourceIds, "network resource IDs");
for (const requiredId of [
  "mezo-mainnet",
  "mezo-testnet",
  "ethereum-mainnet",
  "base-mainnet",
  "rpc-endpoints",
  "network-sources",
  "network-probes-2026-08-18",
]) {
  assert(resourceIds.includes(requiredId), `network index is missing resource ${requiredId}`);
}
for (const schemaResource of index.resources.filter((resource) => resource.role === "schema")) {
  const resolved = await resolveKnowledgeResource(repositoryRoot, {
    moduleId: "networks",
    resourceId: schemaResource.id,
  });
  const schema = await loadJson<JsonObject>(resolved.path);
  assert(
    schema.$schema === "https://json-schema.org/draft/2020-12/schema",
    `${schemaResource.id} must use JSON Schema draft 2020-12`,
  );
  for (const match of JSON.stringify(schema).matchAll(/"\$ref":"([^"]+)"/g)) {
    const reference = match[1] ?? fail("schema reference capture is missing");
    if (/^[a-z]+:/i.test(reference)) continue;
    const [schemaPath] = reference.split("#", 1);
    if (schemaPath) await loadJson<unknown>(resolve(dirname(resolved.path), schemaPath));
  }
}

const sourceCatalog = await loadNetworkResource<SourceCatalog>("network-sources");
assert(sourceCatalog.schemaVersion === 1, "source catalog schemaVersion must be 1");
assert(sourceCatalog.kind === "source-catalog", "source catalog kind is invalid");
assert(sourceCatalog.id === "network-sources", "source catalog id is invalid");
assert(sourceCatalog.status === "verified", "source catalog must be verified");
assert(sourceCatalog.supportStatus === "none", "source catalog cannot create support");
assert(sourceCatalog.reviewStatus === "accepted", "source catalog review must be accepted");
assertTimestamp(sourceCatalog.verifiedAt, "source catalog verifiedAt");
assert(sourceCatalog.reviewAfter === null, "source catalog reviewAfter must be null");
assert(
  Array.isArray(sourceCatalog.limitations) && sourceCatalog.limitations.length > 0,
  "source catalog needs limitations",
);
assert(
  Array.isArray(sourceCatalog.sources) && sourceCatalog.sources.length > 0,
  "source catalog must contain sources",
);
assertUnique(
  sourceCatalog.sources.map((source) => source.id),
  "source IDs",
);
assert(
  JSON.stringify(sourceCatalog.scope?.networkIds) === JSON.stringify(index.scope.networkIds),
  "source catalog network scope must match the module index",
);

const sourcesById = new Map<string, Source>();
for (const source of sourceCatalog.sources) {
  assertId(source.id, "source id");
  assertString(source.kind, `source ${source.id} kind`);
  assertString(source.note, `source ${source.id} note`);
  assertTimestamp(source.retrievedAt, `source ${source.id} retrievedAt`);
  assert(sha256Pattern.test(source.sha256), `source ${source.id} sha256 is invalid`);
  if (source.url) assertHttpsUrl(source.url, `source ${source.id} URL`);
  if (source.repository) {
    assertHttpsUrl(source.repository, `source ${source.id} repository`);
    assertString(source.commit, `source ${source.id} commit`);
    assert(/^[a-f0-9]{40}$/.test(source.commit), `source ${source.id} commit must be a full SHA`);
    assertString(source.path, `source ${source.id} path`);
  }
  if (source.kind === "on-chain-observation") {
    assertString(source.path, `source ${source.id} evidence path`);
    const localPath = repositoryPath(source.path);
    assert(
      (await sha256(localPath)) === source.sha256,
      `source ${source.id} local evidence digest drifted`,
    );
  }
  sourcesById.set(source.id, source);
}

const networks: NetworkRecord[] = [];
const acceptedNetworkIds = new Set([
  "mezo-mainnet",
  "mezo-testnet",
  "ethereum-mainnet",
  "base-mainnet",
]);
const proposedNetworkIds = new Set();
for (const networkId of index.scope.networkIds) {
  const recordPath = `${networkId} resource`;
  const network = await loadNetworkResource<NetworkRecord>(networkId);
  assert(network.schemaVersion === 1, `${recordPath} schemaVersion must be 1`);
  assert(network.kind === "network", `${recordPath} kind must be network`);
  assertId(network.id, `${recordPath} id`);
  assert(
    ["mainnet", "testnet"].includes(network.environment),
    `${network.id} environment is invalid`,
  );
  assert(network.status === "verified", `${network.id} must be evidence-verified`);
  if (acceptedNetworkIds.has(network.id)) {
    assert(network.supportStatus === "supported", `${network.id} support must be accepted`);
    assert(network.reviewStatus === "accepted", `${network.id} Level 3 review must be accepted`);
  } else {
    assert(proposedNetworkIds.has(network.id), `${network.id} has no declared lifecycle policy`);
    assert(
      network.supportStatus === "proposed",
      `${network.id} must remain proposed before qualified review`,
    );
    assert(
      network.reviewStatus === "pending-qualified-review",
      `${network.id} must remain pending qualified Level 3 review`,
    );
  }
  assertTimestamp(network.verifiedAt, `${network.id} verifiedAt`);
  assertReviewCurrent(network.reviewAfter, `${network.id} reviewAfter`);
  assert(network.scope?.networkId === network.id, `${network.id} scope network ID differs`);
  assert(
    network.scope?.environment === network.environment,
    `${network.id} scope environment differs`,
  );
  assertNetworkCapabilityProfile(network, network.id);
  assertString(network.values?.displayName, `${network.id} displayName`);
  assert(
    Number.isSafeInteger(network.values?.evmChainId) && network.values.evmChainId > 0,
    `${network.id} EVM chain ID is invalid`,
  );
  assertString(network.values?.nativeCurrency?.name, `${network.id} native currency name`);
  assertString(network.values?.nativeCurrency?.symbol, `${network.id} native currency symbol`);
  assert(
    Number.isInteger(network.values?.nativeCurrency?.decimals) &&
      network.values.nativeCurrency.decimals >= 0,
    `${network.id} native currency decimals are invalid`,
  );
  assertHttpsUrl(network.values?.explorer?.url, `${network.id} explorer URL`);
  assert(
    Array.isArray(network.claims) && network.claims.length > 0,
    `${network.id} must contain claims`,
  );
  assertUnique(
    network.claims.map((claim) => claim.id),
    `${network.id} claim IDs`,
  );
  for (const claim of network.claims) {
    assertId(claim.id, `${network.id} claim id`);
    assertString(claim.path, `${claim.id} path`);
    assert(
      getPath(network, claim.path) !== undefined,
      `${claim.id} references missing path ${claim.path}`,
    );
    assertString(claim.statement, `${claim.id} statement`);
    assert(
      claim.classification === "external-fact",
      `${claim.id} classification is not external-fact`,
    );
    assert(claim.disposition === "promote", `${claim.id} disposition is not promote`);
    assert(
      Array.isArray(claim.evidence) && claim.evidence.length > 0,
      `${claim.id} needs evidence`,
    );
    for (const evidence of claim.evidence) {
      assert(
        sourcesById.has(evidence.sourceId),
        `${claim.id} references unknown source ${evidence.sourceId}`,
      );
      assertString(evidence.locator, `${claim.id} evidence locator`);
      assertString(evidence.note, `${claim.id} evidence note`);
    }
  }
  assert(
    Array.isArray(network.limitations) && network.limitations.length > 0,
    `${network.id} needs limitations`,
  );
  networks.push(network);
}

assertUnique(
  networks.map((network) => network.id),
  "network IDs",
);
assertUnique(
  networks.map((network) => network.values.evmChainId),
  "EVM chain IDs",
);
assertUnique(
  networks
    .map((network) => network.values.cosmosChainId)
    .filter((chainId): chainId is string => chainId !== undefined),
  "Cosmos chain IDs",
);
const networksById = new Map(networks.map((network) => [network.id, network]));

const endpointCatalog = await loadNetworkResource<EndpointCatalog>("rpc-endpoints");
assert(endpointCatalog.schemaVersion === 1, "endpoint catalog schemaVersion must be 1");
assert(endpointCatalog.kind === "rpc-endpoint-catalog", "endpoint catalog kind is invalid");
assert(endpointCatalog.id === "rpc-endpoints", "endpoint catalog id is invalid");
assert(endpointCatalog.status === "verified", "endpoint catalog must be evidence-verified");
assert(endpointCatalog.supportStatus === "supported", "endpoint catalog support must be accepted");
assert(
  endpointCatalog.reviewStatus === "accepted",
  "endpoint catalog Level 3 review must be accepted",
);
assertTimestamp(endpointCatalog.verifiedAt, "endpoint catalog verifiedAt");
assertReviewCurrent(endpointCatalog.reviewAfter, "endpoint catalog reviewAfter");
assert(
  Array.isArray(endpointCatalog.limitations) && endpointCatalog.limitations.length > 0,
  "endpoint catalog needs limitations",
);
assert(
  Array.isArray(endpointCatalog.records) && endpointCatalog.records.length > 0,
  "endpoint catalog must contain records",
);
assertUnique(
  endpointCatalog.records.map((endpoint) => endpoint.id),
  "endpoint IDs",
);

const evidenceSets: EvidenceSet[] = [];
for (const evidenceResource of index.resources.filter((resource) => resource.role === "evidence")) {
  evidenceSets.push(await loadNetworkResource<EvidenceSet>(evidenceResource.id));
}
const observations = evidenceSets.flatMap((set) => {
  assert(set.schemaVersion === 1, `evidence ${set.id} schemaVersion must be 1`);
  assert(set.kind === "network-observation-set", `evidence ${set.id} kind is invalid`);
  assertId(set.id, "evidence set id");
  assert(set.status === "verified", `evidence ${set.id} must be verified`);
  assert(set.supportStatus === "none", `evidence ${set.id} cannot create support`);
  assert(set.reviewStatus === "accepted", `evidence ${set.id} review must be accepted`);
  assertTimestamp(set.verifiedAt, `${set.id} verifiedAt`);
  assertReviewCurrent(set.reviewAfter, `${set.id} reviewAfter`);
  assert(
    Array.isArray(set.limitations) && set.limitations.length > 0,
    `${set.id} needs limitations`,
  );
  assertTimestamp(set.observedFrom, `${set.id} observedFrom`);
  assertTimestamp(set.observedThrough, `${set.id} observedThrough`);
  assert(
    Array.isArray(set.methodology) && set.methodology.length > 0,
    `${set.id} needs methodology`,
  );
  assert(Array.isArray(set.observations), `${set.id} observations must be an array`);
  return set.observations;
});
assertUnique(
  observations.map((observation) => observation.id),
  "observation IDs",
);
const observationsById = new Map(observations.map((observation) => [observation.id, observation]));
const endpointsById = new Map(endpointCatalog.records.map((endpoint) => [endpoint.id, endpoint]));

for (const endpoint of endpointCatalog.records) {
  assertId(endpoint.id, "endpoint id");
  assert(
    networksById.has(endpoint.networkId),
    `endpoint ${endpoint.id} references unknown network ${endpoint.networkId}`,
  );
  assertString(endpoint.provider, `endpoint ${endpoint.id} provider`);
  assert(
    ["https", "wss"].includes(endpoint.transport),
    `endpoint ${endpoint.id} transport is invalid`,
  );
  assertEndpointUrl(endpoint);
  assert(
    ["official", "official-recommended"].includes(endpoint.publicationStatus),
    `endpoint ${endpoint.id} publication status is invalid`,
  );
  assert(
    sourcesById.has(endpoint.publicationSourceId),
    `endpoint ${endpoint.id} publication source is unknown`,
  );
  assert(
    ["supported", "docs-only"].includes(endpoint.supportStatus),
    `endpoint ${endpoint.id} support status is invalid`,
  );
  assert(
    ["verified", "failed-verification"].includes(endpoint.operationalStatus),
    `endpoint ${endpoint.id} operational status is invalid`,
  );
  assertTimestamp(endpoint.lastVerifiedAt, `endpoint ${endpoint.id} lastVerifiedAt`);
  assert(
    observationsById.has(endpoint.evidenceObservationId),
    `endpoint ${endpoint.id} observation is missing`,
  );
  const observation = observationsById.get(endpoint.evidenceObservationId);
  assert(observation !== undefined, `endpoint ${endpoint.id} observation is missing`);
  assert(
    observation.endpointId === endpoint.id,
    `endpoint ${endpoint.id} and observation do not link both ways`,
  );
  const expectedOutcome = endpoint.operationalStatus === "verified" ? "passed" : "failed";
  assert(
    observation.outcome === expectedOutcome,
    `endpoint ${endpoint.id} status disagrees with observation`,
  );
  const expectedSupport = endpoint.operationalStatus === "verified" ? "supported" : "docs-only";
  assert(
    endpoint.supportStatus === expectedSupport,
    `endpoint ${endpoint.id} support disagrees with its accepted observation`,
  );
  assert(
    Array.isArray(endpoint.limitations) && endpoint.limitations.length > 0,
    `endpoint ${endpoint.id} needs limitations`,
  );
}

for (const observation of observations) {
  assertId(observation.id, "observation id");
  assertTimestamp(observation.observedAt, `observation ${observation.id} observedAt`);
  assert(
    ["passed", "failed"].includes(observation.outcome),
    `observation ${observation.id} outcome is invalid`,
  );
  assert(
    Array.isArray(observation.methods) && observation.methods.length > 0,
    `observation ${observation.id} needs methods`,
  );
  if (observation.endpointId) {
    assert(
      endpointsById.has(observation.endpointId),
      `observation ${observation.id} references unknown endpoint`,
    );
    if (observation.outcome === "passed" && observation.result?.evmChainId !== undefined) {
      const endpoint = endpointsById.get(observation.endpointId);
      assert(endpoint !== undefined, `observation ${observation.id} endpoint is missing`);
      const network = networksById.get(endpoint.networkId);
      assert(network !== undefined, `observation ${observation.id} network is missing`);
      assert(
        observation.result.evmChainId === network.values.evmChainId,
        `observation ${observation.id} returned the wrong chain ID`,
      );
    }
  } else {
    assertHttpsUrl(observation.targetUrl, `observation ${observation.id} target URL`);
  }
  if (observation.outcome === "failed") {
    assertString(observation.error?.class, `observation ${observation.id} error class`);
    assertString(observation.error?.summary, `observation ${observation.id} error summary`);
  }
  if (observation.result?.latestBlock) {
    assert(
      Number.isSafeInteger(observation.result.latestBlock.number),
      `observation ${observation.id} block number is invalid`,
    );
    assert(
      blockHashPattern.test(observation.result.latestBlock.hash),
      `observation ${observation.id} block hash is invalid`,
    );
    assertTimestamp(
      observation.result.latestBlock.timestamp,
      `observation ${observation.id} block timestamp`,
    );
  }
}

const candidates = await resolveKnowledgeResource(repositoryRoot, {
  moduleId: "networks",
  resourceId: "network-candidates",
});
await readFile(candidates.path, "utf8");

process.stdout.write(
  `Validated ${networks.length} networks, ${endpointCatalog.records.length} RPC endpoints, ` +
    `${sourceCatalog.sources.length} sources, and ${observations.length} observations.\n`,
);
