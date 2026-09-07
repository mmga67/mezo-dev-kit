import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, parseJson, type JsonObject } from "./lib/json.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const knowledgeDirectory = join(repositoryRoot, "knowledge", "protocols", "musd");
const sha256Pattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const hashPattern = /^0x[a-f0-9]{64}$/;
const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const addressAnywherePattern = /\b0x[a-fA-F0-9]{40}\b/;
const allowedStability = new Set([
  "stable-design",
  "versioned-design",
  "governed-state",
  "deployment-state",
]);

interface Options {
  docsSource?: string;
  musdSource?: string;
}

interface StatusRecord extends JsonObject {
  status: string;
  protocolStatus?: string;
  extensions?: JsonObject & { protocolStatus?: string };
  supportStatus: string;
  reviewStatus: string;
}

interface Reference extends JsonObject {
  moduleId: string;
  resourceId: string;
  recordId?: string;
}

interface EvidenceReference extends JsonObject {
  sourceArtifactId?: string;
  locator?: string;
  canonicalReference?: Reference;
}

interface Source extends JsonObject {
  id: string;
  kind: string;
  repository?: string;
  commit?: string;
}

interface Artifact extends JsonObject {
  id: string;
  sourceId: string;
  path: string;
  sha256: string;
}

interface SourceCatalog extends StatusRecord {
  schemaVersion: number;
  kind: string;
  sources: Source[];
  artifacts: Artifact[];
}

interface Deployment extends JsonObject {
  id: string;
  contractId: string;
  networkId: string;
  runtime: { blockNumber: number; blockHash: string };
}

interface Network extends JsonObject {
  id: string;
}

interface Endpoint extends JsonObject {
  id: string;
  networkId: string;
}

interface Component extends JsonObject {
  id: string;
  contractId: string;
  name: string;
  group: string;
  role: string;
  stability: string;
  relationships: string[];
  evidence: EvidenceReference[];
}

interface TerminologyRecord extends JsonObject {
  id: string;
  term: string;
  definition: string;
  aliases: string[];
  stability: string;
  evidence: EvidenceReference[];
}

interface ModelClaim extends JsonObject {
  id: string;
  statement: string;
  classification: string;
  stability: string;
  evidence: EvidenceReference[];
}

interface Unit extends JsonObject {
  id: string;
  quantity: string;
  representation: string;
  scale: string;
  stability: string;
  evidence: EvidenceReference[];
}

interface Parameter extends JsonObject {
  id: string;
  ownerContractId: string;
  sourceOwner: string;
  mutability: string;
  stability: string;
  valueOwnerTask: string;
  currentValueIncluded: boolean;
  evidence: EvidenceReference[];
}

interface Observation extends JsonObject {
  id: string;
  networkId: string;
  endpointId: string;
  deploymentId: string;
  blockNumber: number;
  blockHash: string;
  function: string;
  callData: string;
  rawResult: string;
  decodedResult: number;
  status: string;
}

interface MusdIndex extends StatusRecord {
  schemaVersion: number;
  kind: string;
  moduleId: string;
  owner: string;
  verifiedAt: string;
  extensions: JsonObject & {
    protocolSource: { sourceId: string; commit: string };
    deploymentScope: {
      networkIds: string[];
      contractModuleId: string;
      networkModuleId: string;
    };
    nestedModules: string[];
  };
  protocolSource: { sourceId: string; commit: string };
  deploymentScope: {
    networkIds: string[];
    contractModuleId: string;
    networkModuleId: string;
  };
  catalogs: { terminology: string; components: string; model: string; sources: string };
  evidence: string[];
  candidateInventory: string;
  derivedReference: string;
}

interface ComponentCatalog extends StatusRecord {
  schemaVersion: number;
  kind: string;
  records: Component[];
}

interface TerminologyCatalog extends StatusRecord {
  schemaVersion: number;
  kind: string;
  records: TerminologyRecord[];
}

interface ModelCatalog extends StatusRecord {
  schemaVersion: number;
  kind: string;
  claims: ModelClaim[];
  units: Unit[];
  parameters: Parameter[];
  futureModuleBoundary: Record<string, unknown[]>;
}

interface ObservationSet extends JsonObject {
  schemaVersion: number;
  kind: string;
  observedAt: string;
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

function assertUnique(values: readonly (string | number)[], label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate '${value}'`);
    seen.add(value);
  }
}

function assertTimestamp(value: unknown, label: string): void {
  assertString(value, label);
  assert(Number.isFinite(Date.parse(value)), `${label} must be an RFC 3339 timestamp`);
}

function assertSha256(value: unknown, label: string): void {
  assertString(value, label);
  assert(sha256Pattern.test(value), `${label} must be a SHA-256 digest`);
}

function assertStatus(record: StatusRecord, label: string, expectedSupport = "supported"): void {
  assert(record.status === "verified", `${label} status must be verified`);
  assert(
    record.protocolStatus === "verified-versioned" ||
      record.extensions?.protocolStatus === "verified-versioned",
    `${label} protocol status is invalid`,
  );
  assert(record.supportStatus === expectedSupport, `${label} support status is invalid`);
  assert(record.reviewStatus === "accepted", `${label} review must be accepted`);
}

function assertHttps(value: unknown, label: string): void {
  assertString(value, label);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a URL`);
  }
  assert(parsed.protocol === "https:", `${label} must use HTTPS`);
}

function repositoryPath(path: unknown, label: string): string {
  assertString(path, label);
  const absolute = resolve(repositoryRoot, path);
  const relation = relative(repositoryRoot, absolute);
  assert(
    !relation.startsWith("..") && !relation.includes("/../"),
    `${label} escapes the repository`,
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function parseArguments(argv: readonly string[]): Options {
  const result: Options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--docs-source" || argument === "--musd-source") {
      const value = argv[index + 1];
      assertString(value, `${argument} value`);
      result[argument === "--docs-source" ? "docsSource" : "musdSource"] = resolve(value);
      index += 1;
      continue;
    }
    fail(`unknown argument '${argument}'`);
  }
  return result;
}

function checkoutCommit(path: string, label: string): string {
  try {
    return execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail(
      `${label} is not a readable Git checkout: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const options = parseArguments(process.argv.slice(2));
const index = await loadJson<MusdIndex>(join(knowledgeDirectory, "index.json"));
assert(index.schemaVersion === 1, "MUSD index schemaVersion must be 1");
assert(
  index.kind === "knowledge-module-index" && index.moduleId === "protocols/musd",
  "MUSD index kind is invalid",
);
assert(index.owner === "protocols/musd", "MUSD index owner is invalid");
assertStatus(index, "MUSD index");
assertTimestamp(index.verifiedAt, "MUSD index verifiedAt");
Object.assign(index, {
  protocolSource: index.extensions.protocolSource,
  deploymentScope: index.extensions.deploymentScope,
  catalogs: {
    terminology: "records/terminology.json",
    components: "records/components.json",
    model: "records/model.json",
    sources: "sources/catalog.json",
  },
  evidence: ["evidence/protocol-reads-2026-08-18.json"],
  candidateInventory: "review/candidates.md",
  derivedReference: "../../../docs/reference/musd-system.md",
});
assert(
  commitPattern.test(index.protocolSource?.commit),
  "MUSD index source commit must be a full SHA",
);

const sources = await loadJson<SourceCatalog>(join(knowledgeDirectory, index.catalogs.sources));
assert(sources.schemaVersion === 1, "MUSD source catalog schemaVersion must be 1");
assert(sources.kind === "musd-protocol-source-catalog", "MUSD source catalog kind is invalid");
assertStatus(sources, "MUSD source catalog", "none");
assert(
  Array.isArray(sources.sources) && sources.sources.length >= 3,
  "MUSD source catalog is incomplete",
);
assertUnique(
  sources.sources.map((source) => source.id),
  "MUSD source IDs",
);
const sourcesById = new Map<string, Source>();
for (const source of sources.sources) {
  assert(idPattern.test(source.id), `source ID '${source.id}' is invalid`);
  assertString(source.kind, `source ${source.id} kind`);
  if (source.repository) {
    assertHttps(source.repository, `source ${source.id} repository`);
    assertString(source.commit, `source ${source.id} commit`);
    assert(commitPattern.test(source.commit), `source ${source.id} commit must be a full SHA`);
  }
  sourcesById.set(source.id, source);
}
assert(
  sourcesById.get(index.protocolSource.sourceId)?.commit === index.protocolSource.commit,
  "MUSD index and source catalog commits differ",
);

assert(
  Array.isArray(sources.artifacts) && sources.artifacts.length > 0,
  "MUSD source artifacts are missing",
);
assertUnique(
  sources.artifacts.map((artifact) => artifact.id),
  "MUSD source artifact IDs",
);
assertUnique(
  sources.artifacts.map((artifact) => `${artifact.sourceId}:${artifact.path}`),
  "MUSD source artifact paths",
);
const artifactsById = new Map<string, Artifact & { source: Source }>();
for (const artifact of sources.artifacts) {
  assert(idPattern.test(artifact.id), `artifact ID '${artifact.id}' is invalid`);
  const source = sourcesById.get(artifact.sourceId);
  assert(source, `artifact ${artifact.id} references unknown source ${artifact.sourceId}`);
  assertString(artifact.path, `artifact ${artifact.id} path`);
  assertSha256(artifact.sha256, `artifact ${artifact.id} sha256`);

  if (source.kind === "read-only-on-chain-observation") {
    const path = repositoryPath(artifact.path, `artifact ${artifact.id} path`);
    assert(await exists(path), `artifact ${artifact.id} local file is missing`);
    assert((await sha256(path)) === artifact.sha256, `artifact ${artifact.id} digest drifted`);
  }
  artifactsById.set(artifact.id, { ...artifact, source });
}

for (const [label, checkout, sourceId] of [
  ["documentation source", options.docsSource, "official-docs-musd"],
  ["MUSD source", options.musdSource, "official-source-musd"],
] as const) {
  if (!checkout) continue;
  const source = sourcesById.get(sourceId);
  assert(source, `${label} catalog entry is missing`);
  assertString(source.commit, `${label} commit`);
  assert(
    checkoutCommit(checkout, label) === source.commit,
    `${label} checkout is not at pinned commit ${source.commit}`,
  );
  for (const artifact of sources.artifacts.filter((item) => item.sourceId === sourceId)) {
    const path = resolve(checkout, artifact.path);
    const relation = relative(checkout, path);
    assert(
      !relation.startsWith("..") && !relation.includes("/../"),
      `${artifact.id} escapes ${label}`,
    );
    assert(await exists(path), `${artifact.id} is missing from ${label}`);
    assert(
      (await sha256(path)) === artifact.sha256,
      `${artifact.id} differs from its pinned digest`,
    );
  }
}

assert(
  index.deploymentScope.contractModuleId === "contracts",
  "MUSD contract module ID is invalid",
);
const abiCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-abis",
  })
).document;
const deploymentCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
  })
).document;
const abiRecords = objects(object(abiCatalogDocument, "ABI catalog").records, "ABI records");
const deploymentRecords = objects(
  object(deploymentCatalogDocument, "deployment catalog").records,
  "deployment records",
) as Deployment[];
const contractIds = new Set(abiRecords.map((record) => record.contractId));
const deploymentsById = new Map(deploymentRecords.map((record) => [record.id, record]));

const networks = await Promise.all(
  index.deploymentScope.networkIds.map(
    async (networkId) =>
      object(
        (
          await loadKnowledgeReference(repositoryRoot, {
            moduleId: "networks",
            resourceId: networkId,
          })
        ).document,
        `network ${networkId}`,
      ) as Network,
  ),
);
assert(index.deploymentScope.networkModuleId === "networks", "MUSD network module ID is invalid");
const networksById = new Map(networks.map((network) => [network.id, network]));
assertUnique(index.deploymentScope.networkIds, "MUSD scope network IDs");
for (const networkId of index.deploymentScope.networkIds) {
  assert(networksById.has(networkId), `MUSD scope references unknown network ${networkId}`);
}

const endpointCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "networks",
    resourceId: "rpc-endpoints",
  })
).document;
const endpointRecords = objects(
  object(endpointCatalogDocument, "endpoint catalog").records,
  "endpoint records",
) as Endpoint[];
const endpointsById = new Map(endpointRecords.map((record) => [record.id, record]));

async function assertEvidence(records: readonly EvidenceReference[], label: string): Promise<void> {
  assert(records.length > 0, `${label} needs evidence`);
  let authoritativeCount = 0;
  for (const evidence of records) {
    if (evidence.sourceArtifactId) {
      const artifact = artifactsById.get(evidence.sourceArtifactId);
      assert(artifact, `${label} references unknown artifact ${evidence.sourceArtifactId}`);
      authoritativeCount += 1;
      assertString(evidence.locator, `${label} evidence locator`);
    } else if (evidence.canonicalReference) {
      assert(
        evidence.canonicalReference.moduleId === "networks" &&
          index.deploymentScope.networkIds.includes(evidence.canonicalReference.resourceId),
        `${label} references an unexpected canonical network resource`,
      );
      await loadKnowledgeReference(repositoryRoot, evidence.canonicalReference);
      authoritativeCount += 1;
    } else {
      fail(`${label} evidence needs sourceArtifactId or canonicalReference`);
    }
  }
  assert(authoritativeCount > 0, `${label} needs authoritative evidence`);
}

const components = await loadJson<ComponentCatalog>(
  join(knowledgeDirectory, index.catalogs.components),
);
assert(components.schemaVersion === 1, "MUSD component schemaVersion must be 1");
assert(components.kind === "musd-component-catalog", "MUSD component kind is invalid");
assertStatus(components, "MUSD components");
assert(
  Array.isArray(components.records) && components.records.length === 15,
  "MUSD component catalog must contain 15 verified registry roles",
);
assertUnique(
  components.records.map((record) => record.id),
  "MUSD component IDs",
);
assertUnique(
  components.records.map((record) => record.contractId),
  "MUSD component contract IDs",
);
const componentIds = new Set(components.records.map((record) => record.id));
for (const component of components.records) {
  assert(idPattern.test(component.id), `component ID '${component.id}' is invalid`);
  assert(component.id === component.contractId, `${component.id} must use its stable registry ID`);
  assert(contractIds.has(component.contractId), `${component.id} is absent from the ABI catalog`);
  assertString(component.name, `${component.id} name`);
  assertString(component.group, `${component.id} group`);
  assertString(component.role, `${component.id} role`);
  assert(allowedStability.has(component.stability), `${component.id} stability is invalid`);
  assert(Array.isArray(component.relationships), `${component.id} relationships must be an array`);
  assertUnique(component.relationships, `${component.id} relationships`);
  for (const relationship of component.relationships) {
    assert(
      componentIds.has(relationship),
      `${component.id} references unknown component ${relationship}`,
    );
  }
  await assertEvidence(component.evidence, `component ${component.id}`);
  for (const networkId of index.deploymentScope.networkIds) {
    assert(
      deploymentRecords.some(
        (deployment) =>
          deployment.contractId === component.contractId && deployment.networkId === networkId,
      ),
      `${component.id} has no deployment for ${networkId}`,
    );
  }
}

const terminology = await loadJson<TerminologyCatalog>(
  join(knowledgeDirectory, index.catalogs.terminology),
);
assert(terminology.schemaVersion === 1, "MUSD terminology schemaVersion must be 1");
assert(terminology.kind === "musd-terminology-catalog", "MUSD terminology kind is invalid");
assertStatus(terminology, "MUSD terminology");
assert(
  Array.isArray(terminology.records) && terminology.records.length >= 20,
  "MUSD terminology is incomplete",
);
assertUnique(
  terminology.records.map((record) => record.id),
  "MUSD terminology IDs",
);
const normalizedTerms: string[] = [];
for (const record of terminology.records) {
  assert(idPattern.test(record.id), `term ID '${record.id}' is invalid`);
  assertString(record.term, `${record.id} term`);
  assertString(record.definition, `${record.id} definition`);
  assert(Array.isArray(record.aliases), `${record.id} aliases must be an array`);
  assert(allowedStability.has(record.stability), `${record.id} stability is invalid`);
  normalizedTerms.push(
    record.term.toLowerCase(),
    ...record.aliases.map((alias) => alias.toLowerCase()),
  );
  await assertEvidence(record.evidence, `term ${record.id}`);
}
assertUnique(normalizedTerms, "normalized MUSD terms and aliases");

const model = await loadJson<ModelCatalog>(join(knowledgeDirectory, index.catalogs.model));
assert(model.schemaVersion === 1, "MUSD model schemaVersion must be 1");
assert(model.kind === "musd-system-model", "MUSD model kind is invalid");
assertStatus(model, "MUSD model");
assert(
  Array.isArray(model.claims) && model.claims.length >= 12,
  "MUSD model claims are incomplete",
);
assertUnique(
  model.claims.map((claim) => claim.id),
  "MUSD model claim IDs",
);
for (const claim of model.claims) {
  assert(idPattern.test(claim.id), `claim ID '${claim.id}' is invalid`);
  assertString(claim.statement, `${claim.id} statement`);
  assert(
    ["external-fact", "architecture-rule"].includes(claim.classification),
    `${claim.id} classification is invalid`,
  );
  assert(allowedStability.has(claim.stability), `${claim.id} stability is invalid`);
  await assertEvidence(claim.evidence, `claim ${claim.id}`);
}

assert(Array.isArray(model.units) && model.units.length >= 8, "MUSD unit catalog is incomplete");
assertUnique(
  model.units.map((unit) => unit.id),
  "MUSD unit IDs",
);
for (const unit of model.units) {
  assert(idPattern.test(unit.id), `unit ID '${unit.id}' is invalid`);
  assertString(unit.quantity, `${unit.id} quantity`);
  assertString(unit.representation, `${unit.id} representation`);
  assertString(unit.scale, `${unit.id} scale`);
  assert(allowedStability.has(unit.stability), `${unit.id} stability is invalid`);
  await assertEvidence(unit.evidence, `unit ${unit.id}`);
}

assert(
  Array.isArray(model.parameters) && model.parameters.length >= 10,
  "MUSD parameter ownership is incomplete",
);
assertUnique(
  model.parameters.map((parameter) => parameter.id),
  "MUSD parameter IDs",
);
for (const parameter of model.parameters) {
  assert(idPattern.test(parameter.id), `parameter ID '${parameter.id}' is invalid`);
  assert(
    componentIds.has(parameter.ownerContractId),
    `${parameter.id} has unknown owner ${parameter.ownerContractId}`,
  );
  assertString(parameter.sourceOwner, `${parameter.id} sourceOwner`);
  assertString(parameter.mutability, `${parameter.id} mutability`);
  assert(allowedStability.has(parameter.stability), `${parameter.id} stability is invalid`);
  assertString(parameter.valueOwnerTask, `${parameter.id} valueOwnerTask`);
  assert(
    parameter.currentValueIncluded === false,
    `${parameter.id} must not freeze a current value in implementation review`,
  );
  await assertEvidence(parameter.evidence, `parameter ${parameter.id}`);
}
for (const key of ["pure", "rpcAdapters", "excluded"]) {
  assert(
    Array.isArray(model.futureModuleBoundary?.[key]) && model.futureModuleBoundary[key].length > 0,
    `future module ${key} boundary is missing`,
  );
}

for (const evidencePath of index.evidence) {
  const evidence = await loadJson<ObservationSet>(join(knowledgeDirectory, evidencePath));
  assert(evidence.schemaVersion === 1, `${evidencePath} schemaVersion must be 1`);
  assert(evidence.kind === "musd-protocol-read-observations", `${evidencePath} kind is invalid`);
  assertTimestamp(evidence.observedAt, `${evidencePath} observedAt`);
  assert(
    Array.isArray(evidence.observations) && evidence.observations.length > 0,
    `${evidencePath} observations are missing`,
  );
  assertUnique(
    evidence.observations.map((observation) => observation.id),
    `${evidencePath} observation IDs`,
  );
  for (const observation of evidence.observations) {
    assert(networksById.has(observation.networkId), `${observation.id} has unknown network`);
    const endpoint = endpointsById.get(observation.endpointId);
    assert(
      endpoint?.networkId === observation.networkId,
      `${observation.id} endpoint/network mismatch`,
    );
    const deployment = deploymentsById.get(observation.deploymentId);
    assert(deployment, `${observation.id} has unknown deployment`);
    assert(deployment.contractId === "musd.token", `${observation.id} is not a MUSD token read`);
    assert(
      deployment.networkId === observation.networkId,
      `${observation.id} deployment/network mismatch`,
    );
    assert(
      Number.isSafeInteger(observation.blockNumber),
      `${observation.id} block number is invalid`,
    );
    assert(hashPattern.test(observation.blockHash), `${observation.id} block hash is invalid`);
    assert(
      deployment.runtime.blockNumber === observation.blockNumber,
      `${observation.id} block number differs from registry evidence`,
    );
    assert(
      deployment.runtime.blockHash === observation.blockHash,
      `${observation.id} block hash differs from registry evidence`,
    );
    assert(observation.function === "decimals()", `${observation.id} function is invalid`);
    assert(observation.callData === "0x313ce567", `${observation.id} calldata is invalid`);
    assert(
      /^0x[a-f0-9]{64}$/.test(observation.rawResult),
      `${observation.id} raw result is invalid`,
    );
    assert(
      Number.parseInt(observation.rawResult, 16) === observation.decodedResult,
      `${observation.id} decoded result differs`,
    );
    assert(observation.decodedResult === 18, `${observation.id} must establish 18 decimals`);
    assert(observation.status === "verified", `${observation.id} status is invalid`);
  }
}

for (const path of [index.candidateInventory, index.derivedReference]) {
  const absolute = resolve(knowledgeDirectory, path);
  assert(await exists(absolute), `indexed file ${path} is missing`);
}

const nestedModuleDirectories = index.extensions.nestedModules.map((moduleId) =>
  resolve(repositoryRoot, "knowledge", moduleId),
);
const protocolFiles = (await listFiles(knowledgeDirectory)).filter(
  (path) =>
    !nestedModuleDirectories.some(
      (directory) => path === directory || path.startsWith(`${directory}${sep}`),
    ),
);
for (const path of protocolFiles) {
  const contents = await readFile(path, "utf8");
  assert(
    !addressAnywherePattern.test(contents),
    `${relative(repositoryRoot, path)} duplicates an EVM address`,
  );
}
const derivedReferencePath = resolve(knowledgeDirectory, index.derivedReference);
assert(
  !addressAnywherePattern.test(await readFile(derivedReferencePath, "utf8")),
  "derived MUSD reference duplicates an EVM address",
);

process.stdout.write(
  `Validated ${components.records.length} MUSD components, ${terminology.records.length} terms, ${model.claims.length} system claims, ${model.units.length} units, and ${model.parameters.length} parameter owners.\n`,
);
