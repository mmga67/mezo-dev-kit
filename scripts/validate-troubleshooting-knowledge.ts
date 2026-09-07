import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, text, texts, values, type JsonObject } from "./lib/json.ts";
import { loadKnowledgeModule, loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function required(map: ReadonlyMap<string, JsonObject>, id: string, label: string): JsonObject {
  const value = map.get(id);
  assert(value !== undefined, `${label} '${id}' is missing`);
  return value;
}

function optionalValues(value: unknown, label: string): unknown[] {
  return value === undefined || value === null ? [] : values(value, label);
}

const troubleshootingModule = await loadKnowledgeModule(root, "troubleshooting");
const index = troubleshootingModule.index;
const extensions = object(index.extensions, "troubleshooting extensions");
assert(index.schemaVersion === 1, "troubleshooting index schemaVersion must be 1");
assert(index.kind === "knowledge-module-index", "troubleshooting index kind is invalid");
assert(index.owner === "troubleshooting", "troubleshooting index owner is invalid");
assert(index.status === "verified", "troubleshooting index evidence status is invalid");
assert(index.supportStatus === "none", "troubleshooting knowledge must not imply runtime support");
assert(index.reviewStatus === "accepted", "troubleshooting qualified review must be accepted");
assert(
  Number.isFinite(Date.parse(text(index.verifiedAt, "troubleshooting verifiedAt"))),
  "troubleshooting index verifiedAt is invalid",
);
assert(
  Number.isFinite(Date.parse(text(index.reviewAfter, "troubleshooting reviewAfter"))),
  "troubleshooting index reviewAfter is invalid",
);
assert(extensions.catalogStatus === "verified-versioned", "legacy catalog status is not preserved");
assert(
  extensions.securityPlaceholderDecision ===
    "removed-empty-placeholder-security-policy-remains-in-SECURITY.md",
  "security placeholder decision is missing",
);
assert(
  !(await exists(resolve(root, "knowledge/security"))),
  "empty knowledge/security placeholder must not be retained",
);

const issueResourceIds = texts(extensions.issueResourceIds, "issue resource IDs");
assert(issueResourceIds.length === 7, "exactly seven issue resources are required");
assert(
  new Set(issueResourceIds).size === issueResourceIds.length,
  "issue resource IDs must be unique",
);
const resourceById = new Map(index.resources.map((resource) => [resource.id, resource]));
const ids = new Set<string>();
const issuesById = new Map<string, JsonObject>();
const allowedIssueStatuses = new Set([
  "verified-point-in-time",
  "verified-versioned",
  "verified-version-scoped",
]);
const allowedSeverities = new Set(["low", "medium", "high", "critical"]);

for (const resourceId of issueResourceIds) {
  const resource = resourceById.get(resourceId);
  assert(
    resource?.role === "canonical-record" && resource.kind === "troubleshooting-issue",
    `${resourceId} is not an issue resource`,
  );
  const issue = object(
    (
      await loadKnowledgeReference(root, {
        moduleId: "troubleshooting",
        resourceId,
      })
    ).document,
    resourceId,
  );
  const issueId = text(issue.id, `${resourceId} issue ID`);
  assert(issue.schemaVersion === 1, `${resourceId} schemaVersion must be 1`);
  assert(issue.kind === "troubleshooting-issue", `${resourceId} kind is invalid`);
  assert(issue.owner === "troubleshooting", `${resourceId} owner is invalid`);
  assert(!ids.has(issueId), `duplicate issue ID ${issueId}`);
  ids.add(issueId);
  issuesById.set(issueId, issue);
  assert(issue.status === "verified", `${issueId} common status is invalid`);
  assert(issue.supportStatus === "none", `${issueId} must not imply support`);
  assert(
    typeof issue.issueStatus === "string" && allowedIssueStatuses.has(issue.issueStatus),
    `${issueId} issueStatus is invalid`,
  );
  assert(
    typeof issue.severity === "string" && allowedSeverities.has(issue.severity),
    `${issueId} severity is invalid`,
  );
  assert(issue.reviewStatus === "accepted", `${issueId} qualified review must be accepted`);
  for (const field of [
    "symptom",
    "expected",
    "observed",
    "control",
    "verifiedCause",
    "safeMitigation",
    "verifiedAt",
    "reviewAfter",
  ]) {
    assert(
      typeof issue[field] === "string" && issue[field].length > 0,
      `${issueId} missing ${field}`,
    );
  }
  const verifiedAt = text(issue.verifiedAt, `${issueId} verifiedAt`);
  const reviewAfter = text(issue.reviewAfter, `${issueId} reviewAfter`);
  assert(Number.isFinite(Date.parse(verifiedAt)), `${issueId} verifiedAt is invalid`);
  assert(Number.isFinite(Date.parse(reviewAfter)), `${issueId} reviewAfter is invalid`);
  assert(Date.parse(verifiedAt) <= Date.now(), `${issueId} verification date is in the future`);
  assert(Date.parse(reviewAfter) > Date.now(), `${issueId} review window expired`);
  assert(
    Date.parse(reviewAfter) > Date.parse(verifiedAt),
    `${issueId} reviewAfter does not follow verification`,
  );
  assert(Object.keys(object(issue.scope, `${issueId} scope`)).length > 0, `${issueId} needs scope`);
  assert(
    values(issue.prerequisites, `${issueId} prerequisites`).length > 0,
    `${issueId} needs prerequisites`,
  );
  assert(
    values(issue.diagnosticSteps, `${issueId} diagnostic steps`).length >= 2,
    `${issueId} needs repeatable diagnostic steps`,
  );
  const canonicalLinks = objects(issue.canonicalLinks, `${issueId} canonical links`);
  assert(canonicalLinks.length > 0, `${issueId} needs canonical links`);
  assert(
    values(issue.limitations, `${issueId} limitations`).length > 0,
    `${issueId} needs limitations`,
  );
  const reproduction = object(issue.reproduction, `${issueId} reproduction`);
  const repeatedCount =
    optionalValues(reproduction.receiptMissingObservationIds, "missing receipt IDs").length +
    optionalValues(reproduction.blockFallbackObservationIds, "block fallback IDs").length +
    optionalValues(reproduction.evidenceNetworks, "evidence networks").length;
  const minimumCaseCount =
    reproduction.minimumCaseCount === undefined ? 2 : Number(reproduction.minimumCaseCount);
  assert(
    repeatedCount >= minimumCaseCount ||
      reproduction.deterministicEvidenceIsStrongerThanLiveWrites === true,
    `${issueId} lacks repeated or stronger deterministic evidence`,
  );
  for (const reference of canonicalLinks) await loadKnowledgeReference(root, reference);
}

const indexScope = object(index.scope, "troubleshooting index scope");
assert(
  texts(indexScope.issueIds, "index issue IDs").join(",") ===
    issueResourceIds
      .map((resourceId) => {
        const resource = resourceById.get(resourceId);
        assert(resource !== undefined, `issue resource '${resourceId}' is missing`);
        const recordIds = resource.recordIds;
        assert(recordIds !== undefined && recordIds.length > 0, `${resourceId} has no record ID`);
        return recordIds[0];
      })
      .join(","),
  "index issue order or identities drifted",
);

const rpcIssue = required(
  issuesById,
  "testnet-rpc-historical-data-gap-2026-08-18",
  "troubleshooting issue",
);
const rpcScope = object(rpcIssue.scope, "RPC issue scope");
const contractEvidence = object(
  (await loadKnowledgeReference(root, rpcScope.observationSet)).document,
  "contract evidence",
);
const observations = new Map<string, JsonObject>(
  objects(contractEvidence.observations, "contract observations").map(
    (item): [string, JsonObject] => [text(item.id, "contract observation ID"), item],
  ),
);
const rpcReproduction = object(rpcIssue.reproduction, "RPC issue reproduction");
for (const id of texts(rpcReproduction.receiptMissingObservationIds, "missing receipt IDs")) {
  const observation = required(observations, id, "contract observation");
  const activation = object(observation.activation, `${id} activation`);
  const receiptOutcome = object(activation.receiptRpcOutcome, `${id} receipt outcome`);
  assert(observation.networkId === "mezo-testnet", `${id} is not testnet`);
  assert(receiptOutcome.outcome === "missing", `${id} receipt was not missing`);
  assert(
    activation.evidenceMethod === "official-explorer-transaction-fallback",
    `${id} lacks explorer receipt fallback`,
  );
}
for (const id of texts(rpcReproduction.blockFallbackObservationIds, "block fallback IDs")) {
  const observation = required(observations, id, "contract observation");
  const activation = object(observation.activation, `${id} activation`);
  assert(
    activation.blockEvidenceMethod === "official-explorer-block-fallback",
    `${id} lacks explorer block fallback`,
  );
}

const sourceCatalog = object(
  (
    await loadKnowledgeReference(root, {
      moduleId: "protocols/musd",
      resourceId: "musd-sources",
    })
  ).document,
  "MUSD source catalog",
);
const sourceArtifactIds = new Set(
  objects(sourceCatalog.artifacts, "MUSD source artifacts").map((item) =>
    text(item.id, "source artifact ID"),
  ),
);
const capacityIssue = required(
  issuesById,
  "musd-borrowing-capacity-snapshot",
  "troubleshooting issue",
);
const capacityReproduction = object(capacityIssue.reproduction, "capacity issue reproduction");
for (const id of texts(capacityReproduction.sourceArtifactIds, "capacity source artifact IDs")) {
  assert(sourceArtifactIds.has(id), `missing MUSD source artifact ${id}`);
}

const borrowing = await loadKnowledgeModule(root, "protocols/musd/borrowing");
const borrowingExtensions = object(borrowing.index.extensions, "borrowing extensions");
assert(
  objects(borrowingExtensions.resolvedDiscrepancies, "borrowing discrepancies").some(
    (item) => item.id === "refinance-fee-docs-vs-deployment",
  ),
  "missing refinance discrepancy owner",
);
const redemptions = await loadKnowledgeModule(root, "protocols/musd/redemptions");
const redemptionExtensions = object(redemptions.index.extensions, "redemption extensions");
assert(
  objects(redemptionExtensions.resolvedDiscrepancies, "redemption discrepancies").some(
    (item) => item.id === "borrower-redemption-fee-waiver",
  ),
  "missing redemption discrepancy owner",
);

for (const resourceId of [
  "troubleshooting-index-schema",
  "troubleshooting-issue-schema",
  "troubleshooting-legacy-schema-v1",
]) {
  await loadKnowledgeReference(root, { moduleId: "troubleshooting", resourceId });
}
const generated = (
  await loadKnowledgeReference(root, {
    moduleId: "troubleshooting",
    resourceId: "troubleshooting-reference",
  })
).document;
assert(typeof generated === "string", "troubleshooting reference must be Markdown");
for (const id of ids) assert(generated.includes(`## ${id}`), `generated reference omits ${id}`);
assert(
  generated.includes("Security findings follow `SECURITY.md`"),
  "generated reference must preserve the security boundary",
);

process.stdout.write(
  `Validated ${ids.size} troubleshooting issues, ${texts(rpcReproduction.receiptMissingObservationIds, "missing receipt IDs").length} missing-receipt cases, and ${texts(rpcReproduction.blockFallbackObservationIds, "block fallback IDs").length} block-fallback cases.\n`,
);
