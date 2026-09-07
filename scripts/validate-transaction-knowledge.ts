import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, text, values, type JsonObject } from "./lib/json.ts";
import { loadKnowledgeModule, loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function recordId(record: JsonObject, label: string): string {
  return text(record.id, `${label} ID`);
}

const transactionModule = await loadKnowledgeModule(root, "workflows/transactions");
const index = transactionModule.index;
const extensions = object(index.extensions, "transaction module extensions");
assert(index.schemaVersion === 1, "index schemaVersion must be 1");
assert(
  index.status === "candidate",
  "transaction module must remain non-runtime architecture knowledge before implementation",
);
assert(index.supportStatus === "none", "transaction module must not imply runtime support");
assert(index.reviewStatus === "accepted", "transaction architecture review must remain accepted");
assert(
  index.verifiedAt === null && index.reviewAfter === null,
  "candidate module cannot claim fact verification dates",
);
assert(
  extensions.architectureStatus === "accepted",
  "ADR-0002/0003 architecture must remain accepted",
);

const resourceIds = new Set(index.resources.map((resource) => resource.id));
assert(resourceIds.size === index.resources.length, "transaction resource IDs must be unique");
for (const id of [
  "transaction-state-machine",
  "transaction-client-requirements",
  "transaction-errors",
  "transaction-requirement-matrix",
  "transaction-mezo-observations",
  "transaction-proposal-schema",
  "transaction-observation-schema",
  "transaction-candidates",
  "transaction-legacy-schema-v1",
  "transaction-reference",
]) {
  assert(resourceIds.has(id), `missing transaction resource ${id}`);
}

const load = async (resourceId: string): Promise<unknown> =>
  (
    await loadKnowledgeReference(root, {
      moduleId: "workflows/transactions",
      resourceId,
    })
  ).document;
const machine = object(await load("transaction-state-machine"), "transaction state machine");
const requirements = object(
  await load("transaction-client-requirements"),
  "transaction client requirements",
);
const errors = object(await load("transaction-errors"), "transaction errors");
const matrix = object(await load("transaction-requirement-matrix"), "transaction matrix");
const observations = object(
  await load("transaction-mezo-observations"),
  "transaction observations",
);

function assertEnvelope(record: JsonObject, label: string): void {
  assert(record.schemaVersion === 1, `${label} schemaVersion must be 1`);
  assert(record.owner === "core-transactions", `${label} owner must remain core-transactions`);
  assert(
    Object.keys(object(record.scope, `${label} scope`)).length > 0,
    `${label} scope is required`,
  );
  assert(
    values(record.limitations, `${label} limitations`).length > 0,
    `${label} limitations are required`,
  );
}

const records: [string, JsonObject][] = [
  ["state machine", machine],
  ["client requirements", requirements],
  ["errors", errors],
  ["requirement matrix", matrix],
  ["Mezo observations", observations],
];
for (const [label, record] of records) assertEnvelope(record, label);
for (const [label, record] of records.slice(0, 4)) {
  assert(record.status === "candidate", `${label} must be visibly candidate knowledge`);
  assert(record.supportStatus === "none", `${label} must not imply support`);
  assert(record.reviewStatus === "accepted", `${label} architecture review must remain accepted`);
  assert(
    record.verifiedAt === null && record.reviewAfter === null,
    `${label} cannot claim evidence verification`,
  );
  assert(record.proposalStatus === "accepted", `${label} decision status must remain accepted`);
}
assert(observations.status === "verified", "Mezo observations must remain evidence-verified");
assert(observations.supportStatus === "none", "Mezo observations do not create a support promise");
assert(
  observations.reviewStatus === "pending-qualified-review",
  "Mezo observations require qualified review",
);
assert(
  typeof observations.verifiedAt === "string" && typeof observations.reviewAfter === "string",
  "Mezo observations require an evidence window",
);

const states = objects(machine.states, "transaction states");
const transitions = objects(machine.transitions, "transaction transitions");
const stateIds = new Set(states.map((state) => recordId(state, "state")));
assert(stateIds.size === states.length, "state IDs must be unique");
const transitionsByStateAndEvent = new Map<string, JsonObject>();
for (const item of transitions) {
  const from = text(item.from, "transition source");
  const to = text(item.to, "transition target");
  const event = text(item.event, "transition event");
  assert(stateIds.has(from), `unknown transition source ${from}`);
  assert(stateIds.has(to), `unknown transition target ${to}`);
  const key = `${from}:${event}`;
  assert(!transitionsByStateAndEvent.has(key), `nondeterministic transition ${key}`);
  transitionsByStateAndEvent.set(key, item);
}

function transition(state: string, event: string): string {
  const next = transitionsByStateAndEvent.get(`${state}:${event}`);
  assert(next !== undefined, `invalid transition ${state}:${event}`);
  return text(next.to, "transition target");
}

const reconciled = states.find((state) => state.id === "reconciled");
assert(reconciled?.terminal === true, "reconciled must be terminal");
assert(reconciled.successLevel === "protocol-success", "reconciled must be protocol success");
assert(
  states.filter((state) => state.successLevel === "protocol-success").length === 1,
  "only one state may be protocol success",
);
for (const id of [
  "submitted",
  "included",
  "confirmed",
  "reconciled",
  "transaction-failed",
  "replaced",
  "cancelled",
  "reorged",
]) {
  assert(
    states.find((state) => state.id === id)?.actionHashRequired,
    `${id} must require action hash`,
  );
}
for (const id of [
  "replacement-observed",
  "cancellation-observed",
  "wait-timeout",
  "reorg-detected",
  "protocol-reconciliation-failed",
]) {
  assert(
    transitions.some((item) => item.event === id),
    `missing ${id} transition`,
  );
}
for (const state of states.filter((item) => item.terminal)) {
  const id = recordId(state, "terminal state");
  assert(
    !transitions.some((item) => item.from === id),
    `terminal state ${id} has an outgoing transition`,
  );
}

const paths = new Map<string, JsonObject[]>([["constructed", []]]);
const queue = ["constructed"];
while (queue.length > 0) {
  const from = queue.shift();
  assert(from !== undefined, "state traversal queue is empty");
  for (const candidate of transitions.filter((item) => item.from === from)) {
    const to = text(candidate.to, "transition target");
    if (paths.has(to)) continue;
    const priorPath = paths.get(from);
    assert(priorPath !== undefined, `state path to ${from} is missing`);
    paths.set(to, [...priorPath, candidate]);
    queue.push(to);
  }
}
for (const state of states) {
  const id = recordId(state, "state");
  assert(paths.has(id), `state ${id} is unreachable from constructed`);
}

const exercisedTransitions = new Set<string>();
for (const candidate of transitions) {
  const candidateFrom = text(candidate.from, "candidate transition source");
  const candidateEvent = text(candidate.event, "candidate transition event");
  const candidateTo = text(candidate.to, "candidate transition target");
  let current = "constructed";
  const path = paths.get(candidateFrom);
  assert(path !== undefined, `model path to ${candidateFrom} is missing`);
  for (const pathStep of path) {
    const event = text(pathStep.event, "path transition event");
    current = transition(current, event);
    exercisedTransitions.add(
      `${text(pathStep.from, "path source")}:${event}:${text(pathStep.to, "path target")}`,
    );
  }
  assert(current === candidateFrom, `model path did not reach ${candidateFrom}`);
  const result = transition(current, candidateEvent);
  assert(
    result === candidateTo,
    `model transition ${candidateFrom}:${candidateEvent} reached ${result}`,
  );
  exercisedTransitions.add(`${candidateFrom}:${candidateEvent}:${candidateTo}`);
}
assert(exercisedTransitions.size === transitions.length, "not every transition was model-tested");

function runScenario(name: string, events: readonly string[], expected: string): void {
  let current = "constructed";
  for (const event of events) current = transition(current, event);
  assert(current === expected, `${name} ended at ${current}, expected ${expected}`);
}

runScenario(
  "direct success",
  [
    "simulation-succeeded",
    "action-submitted",
    "successful-receipt-observed",
    "confirmation-threshold-met",
    "protocol-reconciliation-succeeded",
  ],
  "reconciled",
);
runScenario(
  "approval then success",
  [
    "simulation-succeeded",
    "approval-required-and-submitted",
    "approval-receipt-succeeded",
    "approval-confirmation-threshold-met",
    "volatile-inputs-revalidated-and-simulation-succeeded",
    "action-submitted",
    "successful-receipt-observed",
    "confirmation-threshold-met",
    "protocol-reconciliation-succeeded",
  ],
  "reconciled",
);
runScenario(
  "timeout remains trackable",
  ["simulation-succeeded", "action-submitted", "wait-timeout", "successful-receipt-observed"],
  "included",
);
runScenario(
  "included reorg resumes tracking",
  [
    "simulation-succeeded",
    "action-submitted",
    "successful-receipt-observed",
    "reorg-detected",
    "tracking-resumed",
  ],
  "submitted",
);
runScenario(
  "confirmed reconciliation mismatch",
  [
    "simulation-succeeded",
    "action-submitted",
    "successful-receipt-observed",
    "confirmation-threshold-met",
    "protocol-reconciliation-failed",
  ],
  "reconciliation-failed",
);
for (const [name, event, expected] of [
  ["validation failure", "validation-or-build-invalid", "validation-failed"],
  ["simulation revert", "simulation-reverted", "simulation-failed"],
] as const) {
  runScenario(name, [event], expected);
}
for (const [name, event, expected] of [
  ["failed receipt", "failed-receipt-observed", "transaction-failed"],
  ["replacement", "replacement-observed", "replaced"],
  ["cancellation", "cancellation-observed", "cancelled"],
] as const) {
  runScenario(name, ["simulation-succeeded", "action-submitted", event], expected);
}

const requirementRecords = objects(requirements.requirements, "transaction requirements");
const requirementIds = new Set(requirementRecords.map((item) => recordId(item, "requirement")));
assert(requirementIds.size === requirementRecords.length, "requirement IDs must be unique");
for (const id of [
  "client-chain-assertion",
  "client-deployment-resolution",
  "read-block-coherence",
  "read-partial-results",
  "provider-failover-safety",
  "retry-classification",
  "exact-entrypoint-simulation",
  "approval-boundary",
  "receipt-is-not-success",
  "reconciliation-evidence",
]) {
  assert(requirementIds.has(id), `missing requirement ${id}`);
}

const errorRecords = objects(errors.errors, "transaction errors");
const errorIds = new Set(errorRecords.map((item) => recordId(item, "error")));
assert(errorIds.size === errorRecords.length, "error IDs must be unique");
for (const id of [
  "UnsupportedNetwork",
  "MissingDeployment",
  "ChainMismatch",
  "InvalidUnits",
  "StaleQuote",
  "ProviderError",
  "ContractRevert",
  "ApprovalError",
  "TransactionReplaced",
  "TransactionFailed",
  "ReconciliationError",
]) {
  assert(errorIds.has(id), `missing shared error ${id}`);
}
for (const item of errorRecords) {
  const id = recordId(item, "error");
  assert(
    values(item.requiredContext, `${id} required context`).length > 0,
    `${id} requires debug context`,
  );
  assert(item.retry !== "always", `${id} cannot allow blind retry`);
}

const observationRecords = objects(observations.observations, "transaction observations");
for (const observation of observationRecords) {
  const observationId = recordId(observation, "observation");
  const evidenceRecords = objects(observation.canonicalEvidence, `${observationId} evidence`);
  assert(evidenceRecords.length > 0, `${observationId} lacks evidence`);
  for (const evidence of evidenceRecords) {
    const reference = object(evidence.reference, `${observationId} evidence reference`);
    assert(
      reference.moduleId === "networks",
      `${observationId} evidence must use a network logical reference`,
    );
    const resolved = await loadKnowledgeReference(root, reference);
    if (evidence.claimId !== undefined) {
      const claimId = text(evidence.claimId, `${observationId} claim ID`);
      const document = object(resolved.document, `${observationId} evidence document`);
      assert(
        objects(document.claims, `${observationId} claims`).some((claim) => claim.id === claimId),
        `${observationId} references missing claim ${claimId}`,
      );
    }
  }
}

assert(
  matrix.domainReviewStatus === "pending-domain-review",
  "legacy domain review gate must remain explicit",
);
const domains = objects(matrix.domains, "transaction domains");
assert(
  domains.map((item) => text(item.taskId, "domain task ID")).join(",") ===
    "implementation review,implementation review,implementation review,incentives evidence review,bridge evidence review",
  "matrix must cover implementation review through bridge evidence review in order",
);
for (const domain of domains) {
  const taskId = text(domain.taskId, "domain task ID");
  assert(
    values(domain.requirements, `${taskId} requirements`).length > 0,
    `${taskId} has no transaction requirements`,
  );
  assert(
    domain.knowledgeReference !== null &&
      domain.knowledgeReference !== undefined &&
      !Object.hasOwn(domain, "knowledgeRoot"),
    `${taskId} must use a logical knowledge reference`,
  );
  await loadKnowledgeReference(root, domain.knowledgeReference);
}

await load("transaction-proposal-schema");
await load("transaction-observation-schema");
await load("transaction-candidates");
await load("transaction-legacy-schema-v1");
const generatedReference = await load("transaction-reference");
assert(typeof generatedReference === "string", "generated transaction reference must be Markdown");
assert(
  generatedReference.includes("Fact and proposal boundary"),
  "generated reference must state the fact/proposal boundary",
);
assert(
  generatedReference.includes("ADR-0002 and ADR-0003 are accepted"),
  "generated reference must preserve accepted ADR status",
);

process.stdout.write(
  `Validated ${states.length} states, model-tested ${exercisedTransitions.size} transitions, ${requirementRecords.length} client requirements, ${errorRecords.length} errors, ${observationRecords.length} Mezo observations, and ${domains.length} protocol domains.\n`,
);
