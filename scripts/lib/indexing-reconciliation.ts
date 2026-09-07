export type IndexingEvaluation = Readonly<Record<string, unknown>>;

type JsonRecord = Record<string, unknown>;

type Range = Readonly<{
  from: number;
  to: number;
}>;

type EventObservation = Readonly<{
  id: string;
  networkId: string;
  deploymentId: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
}>;

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a string`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) fail(`${label} must be a safe integer`);
  return value as number;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const result = integer(value, label);
  if (result < 0) fail(`${label} must be nonnegative`);
  return result;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function range(value: unknown, label: string): Range {
  const candidate = record(value, label);
  const from = nonnegativeInteger(candidate.from, `${label}.from`);
  const to = nonnegativeInteger(candidate.to, `${label}.to`);
  if (from > to) fail(`${label}.from must not exceed ${label}.to`);
  return { from, to };
}

function ranges(value: unknown, label: string): Range[] {
  return array(value, label).map((item, index) => range(item, `${label}[${index}]`));
}

function mergeRanges(values: Range[], requested: Range): Range[] {
  const clipped = values
    .map(({ from, to }) => ({
      from: Math.max(from, requested.from),
      to: Math.min(to, requested.to),
    }))
    .filter(({ from, to }) => from <= to)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: { from: number; to: number }[] = [];
  for (const candidate of clipped) {
    const previous = merged.at(-1);
    if (previous && candidate.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, candidate.to);
    } else {
      merged.push({ ...candidate });
    }
  }
  return merged;
}

function missingRanges(requested: Range, covered: Range[]): Range[] {
  const missing: { from: number; to: number }[] = [];
  let cursor = requested.from;
  for (const segment of covered) {
    if (segment.from > cursor) missing.push({ from: cursor, to: segment.from - 1 });
    cursor = Math.max(cursor, segment.to + 1);
  }
  if (cursor <= requested.to) missing.push({ from: cursor, to: requested.to });
  return missing;
}

function evaluateCoverage(input: JsonRecord): IndexingEvaluation {
  const requested = range(input.requestedRange, "coverage.requestedRange");
  const covered = mergeRanges(ranges(input.coveredRanges, "coverage.coveredRanges"), requested);
  const missing = missingRanges(requested, covered);
  const requiredFailures = nonnegativeInteger(input.requiredFailures, "coverage.requiredFailures");
  const optionalFailures = nonnegativeInteger(input.optionalFailures, "coverage.optionalFailures");
  const currentBlock = nonnegativeInteger(input.currentBlock, "coverage.currentBlock");
  const observedAtBlock = nonnegativeInteger(input.observedAtBlock, "coverage.observedAtBlock");
  const maxAgeBlocks = nonnegativeInteger(input.maxAgeBlocks, "coverage.maxAgeBlocks");
  const parentObserved = boolean(input.parentObserved, "coverage.parentObserved");

  let status: "complete" | "partial" | "unknown" | "stale";
  if (requiredFailures > 0 && covered.length === 0) status = "unknown";
  else if (requiredFailures > 0 || missing.length > 0) status = "partial";
  else if (currentBlock - observedAtBlock > maxAgeBlocks) status = "stale";
  else status = "complete";

  return {
    status,
    coveredRanges: covered,
    missingRanges: missing,
    rowRetained: parentObserved,
    metadataComplete: optionalFailures === 0,
    retryable: status === "partial" || status === "unknown" || status === "stale",
  };
}

function evaluateCheckpoint(input: JsonRecord): IndexingEvaluation {
  const previous = record(input.previous, "checkpoint.previous");
  const previousBlock = nonnegativeInteger(previous.blockNumber, "checkpoint.previous.blockNumber");
  const previousHash = string(previous.blockHash, "checkpoint.previous.blockHash");
  const scanned = range(input.scannedRange, "checkpoint.scannedRange");
  const fullyCommitted = boolean(input.fullyCommitted, "checkpoint.fullyCommitted");
  const headHash = string(input.headHash, "checkpoint.headHash");

  if (!fullyCommitted) {
    return {
      advanced: false,
      checkpoint: { blockNumber: previousBlock, blockHash: previousHash },
    };
  }
  if (scanned.from !== previousBlock + 1) {
    fail("committed checkpoint range must start immediately after the previous checkpoint");
  }
  return {
    advanced: true,
    checkpoint: { blockNumber: scanned.to, blockHash: headHash },
  };
}

function event(value: unknown, label: string): EventObservation {
  const candidate = record(value, label);
  return {
    id: string(candidate.id, `${label}.id`),
    networkId: string(candidate.networkId, `${label}.networkId`),
    deploymentId: string(candidate.deploymentId, `${label}.deploymentId`),
    transactionHash: string(candidate.transactionHash, `${label}.transactionHash`),
    logIndex: nonnegativeInteger(candidate.logIndex, `${label}.logIndex`),
    blockNumber: nonnegativeInteger(candidate.blockNumber, `${label}.blockNumber`),
    blockHash: string(candidate.blockHash, `${label}.blockHash`),
  };
}

function eventKey(value: EventObservation): string {
  return [value.networkId, value.deploymentId, value.transactionHash, value.logIndex].join(":");
}

function evaluateOverlap(input: JsonRecord): IndexingEvaluation {
  const existing = array(input.existing, "overlap.existing").map((value, index) =>
    event(value, `overlap.existing[${index}]`),
  );
  const observed = array(input.observed, "overlap.observed").map((value, index) =>
    event(value, `overlap.observed[${index}]`),
  );
  const canonicalHashesRecord = record(input.canonicalHashes, "overlap.canonicalHashes");
  const canonicalHashes = new Map<number, string>();
  for (const [block, hash] of Object.entries(canonicalHashesRecord)) {
    canonicalHashes.set(
      nonnegativeInteger(Number(block), `canonical block ${block}`),
      string(hash, `canonical hash ${block}`),
    );
  }

  const invalidated = [...existing, ...observed].filter(
    (candidate) => canonicalHashes.get(candidate.blockNumber) !== candidate.blockHash,
  );
  const canonical = [...existing, ...observed].filter(
    (candidate) => canonicalHashes.get(candidate.blockNumber) === candidate.blockHash,
  );
  const deduplicated = new Map<string, EventObservation>();
  for (const candidate of canonical) deduplicated.set(eventKey(candidate), candidate);
  const retained = [...deduplicated.values()].sort(
    (left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
  );
  const mismatchBlocks = invalidated.map(({ blockNumber }) => blockNumber);

  return {
    eventIds: retained.map(({ id }) => id),
    invalidatedEventIds: [...new Set(invalidated.map(({ id }) => id))].sort(),
    rollbackFrom: mismatchBlocks.length > 0 ? Math.min(...mismatchBlocks) : null,
  };
}

function evaluateNegativeEvidence(input: JsonRecord): IndexingEvaluation {
  const coverage = string(input.coverage, "negative.coverage");
  if (!new Set(["complete", "partial", "unknown", "stale"]).has(coverage)) {
    fail("negative.coverage is invalid");
  }
  const authoritative = boolean(input.authoritative, "negative.authoritative");
  const finalized = boolean(input.finalized, "negative.finalized");
  const attempt = nonnegativeInteger(input.attempt, "negative.attempt");
  const cooldownSeconds = nonnegativeInteger(input.cooldownSeconds, "negative.cooldownSeconds");
  const observedAt = nonnegativeInteger(input.observedAt, "negative.observedAt");
  const terminalAbsence = coverage === "complete" && authoritative && finalized;
  return {
    outcome: terminalAbsence ? "absent" : "unknown",
    retryable: !terminalAbsence,
    attempt: attempt + 1,
    nextAttemptAt: terminalAbsence ? null : observedAt + cooldownSeconds,
  };
}

type Candidate = Readonly<{
  id: string;
  invalidated: boolean;
  canonicalEvent: boolean;
  postState: boolean;
  receipt: "success" | "failed" | "missing";
  progress: boolean;
  observedAt: number;
}>;

function candidate(value: unknown, label: string): Candidate {
  const item = record(value, label);
  const receipt = string(item.receipt, `${label}.receipt`);
  if (receipt !== "success" && receipt !== "failed" && receipt !== "missing") {
    fail(`${label}.receipt is invalid`);
  }
  return {
    id: string(item.id, `${label}.id`),
    invalidated: boolean(item.invalidated, `${label}.invalidated`),
    canonicalEvent: boolean(item.canonicalEvent, `${label}.canonicalEvent`),
    postState: boolean(item.postState, `${label}.postState`),
    receipt,
    progress: boolean(item.progress, `${label}.progress`),
    observedAt: nonnegativeInteger(item.observedAt, `${label}.observedAt`),
  };
}

function evaluateCandidates(input: JsonRecord): IndexingEvaluation {
  const candidates = array(input.candidates, "candidates").map((value, index) =>
    candidate(value, `candidates[${index}]`),
  );
  const active = candidates.filter(({ invalidated }) => !invalidated);
  const completed = active
    .filter(
      ({ canonicalEvent, postState, receipt }) =>
        canonicalEvent && postState && receipt !== "failed",
    )
    .sort((left, right) => left.observedAt - right.observedAt || left.id.localeCompare(right.id));
  const progress = active
    .filter(({ progress: hasProgress, receipt }) => hasProgress && receipt !== "failed")
    .sort((left, right) => right.observedAt - left.observedAt || left.id.localeCompare(right.id));
  const failed = active.filter(({ receipt }) => receipt === "failed");

  let outcome: "completed" | "delayed" | "failed" | "unknown";
  let selectedCandidateId: string | null;
  if (completed.length > 0) {
    outcome = "completed";
    selectedCandidateId = completed[0]?.id ?? null;
  } else if (progress.length > 0) {
    outcome = "delayed";
    selectedCandidateId = progress[0]?.id ?? null;
  } else if (failed.length > 0 && failed.length === active.length) {
    outcome = "failed";
    selectedCandidateId =
      failed.sort(
        (left, right) => right.observedAt - left.observedAt || left.id.localeCompare(right.id),
      )[0]?.id ?? null;
  } else {
    outcome = "unknown";
    selectedCandidateId = null;
  }

  return {
    outcome,
    selectedCandidateId,
    preservedCandidateIds: candidates.map(({ id }) => id),
    invalidatedCandidateIds: candidates
      .filter(({ invalidated }) => invalidated)
      .map(({ id }) => id),
  };
}

function evaluateReconciliation(input: JsonRecord): IndexingEvaluation {
  const evidence = record(input.requiredEvidence, "reconciliation.requiredEvidence");
  const missing = Object.entries(evidence)
    .filter(([, present]) => present !== true)
    .map(([id]) => id)
    .sort();
  return {
    outcome: missing.length === 0 ? "completed" : "incomplete",
    missingEvidence: missing,
  };
}

export function evaluateIndexingCase(value: unknown): IndexingEvaluation {
  const item = record(value, "indexing eval case");
  const operation = string(item.operation, "indexing eval case.operation");
  const input = record(item.input, "indexing eval case.input");
  switch (operation) {
    case "coverage":
      return evaluateCoverage(input);
    case "checkpoint":
      return evaluateCheckpoint(input);
    case "overlap":
      return evaluateOverlap(input);
    case "negative-evidence":
      return evaluateNegativeEvidence(input);
    case "destination-candidates":
      return evaluateCandidates(input);
    case "reconciliation":
      return evaluateReconciliation(input);
    default:
      return fail(`unsupported indexing eval operation '${operation}'`);
  }
}
