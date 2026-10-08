import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text, type JsonObject } from "./json.ts";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Reconcile only the two static TransferSent declarations from the pinned interface. */
export function reconcileNttManagerEvents(original: unknown, source: string): JsonObject[] {
  const abi = objects(original, "original manager ABI");
  const priorEvents = abi.filter((e) => e.type === "event" && e.name === "TransferSent");
  assert.equal(priorEvents.length, 1, "original TransferSent overload count differs");
  const prior = priorEvents[0];
  assert(prior);
  const priorInputs = objects(prior.inputs, "original TransferSent inputs");
  assert.equal(priorInputs.length, 6);
  assert(
    priorInputs.every((p) => p.indexed === false),
    "original indexed layout differs",
  );
  const declarations = [...source.matchAll(/event TransferSent\(([\s\S]*?)\);/g)].map((m) => {
    assert(m[1]);
    return m[1].split(",").map((parameter) => {
      const match = /^(bytes32|uint256|uint16|uint64)\s+(indexed\s+)?([A-Za-z][A-Za-z0-9_]*)$/.exec(
        parameter.trim(),
      );
      assert(match, "unsupported TransferSent source parameter");
      return { name: match[3], type: match[1], indexed: Boolean(match[2]), internalType: match[1] };
    });
  });
  assert.equal(declarations.length, 2, "source TransferSent overload count differs");
  const six = declarations.find((d) => d.length === 6);
  const digest = declarations.find((d) => d.length === 1);
  assert(six && digest, "source TransferSent arities differ");
  assert.deepEqual(
    six.map(({ name, type }) => ({ name, type })),
    priorInputs.map(({ name, type }) => ({ name, type })),
    "source/TypeChain parameter identities differ",
  );
  const corrected = {
    ...prior,
    inputs: priorInputs.map((p, i) => ({ ...p, indexed: six[i]!.indexed })),
  };
  const added = { type: "event", name: "TransferSent", inputs: digest, anonymous: false };
  return abi.flatMap((e) => (e === prior ? [corrected, added] : [e]));
}

/** Load the accepted correction and bind its original bytes, pinned source and exact result. */
export async function loadReviewedNttManagerAbi(root: string): Promise<{
  abi: JsonObject[];
  original: JsonObject[];
  source: string;
  sourcePath: string;
  correctionReference: JsonObject;
}> {
  const catalog = object(
    (
      await loadKnowledgeReference(root, {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: "bridge.musd-ntt-manager",
      })
    ).value,
    "manager ABI catalog",
  );
  const review = object(
    (await loadKnowledgeReference(root, catalog.correctionReference)).document,
    "ABI correction",
  );
  assert.equal(review.kind, "ntt-transfer-event-abi-compatibility-review");
  assert.equal(review.status, "verified");
  assert.equal(review.reviewStatus, "accepted", "NTT ABI correction is not accepted");
  assert.equal(review.supportStatus, "none");
  const candidate = object(review.candidate, "reviewed ABI");
  const acceptance = object(review.acceptance, "ABI correction acceptance");
  assert.equal(acceptance.fileSha256, candidate.fileSha256, "accepted ABI digest differs");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(text(acceptance.acceptedOn, "acceptance date")));
  assert(text(acceptance.disposition, "acceptance disposition").length > 0);
  const originalRecord = object(review.original, "original ABI metadata");
  const original = await loadKnowledgeReference(root, originalRecord.artifactReference);
  assert.equal(
    sha(await readFile(original.path)),
    originalRecord.fileSha256,
    "original ABI digest differs",
  );
  const sourceRecord = object(review.source, "correction source");
  const bundle = await loadKnowledgeReference(root, sourceRecord.bundleReference);
  assert.equal(
    sha(await readFile(bundle.path)),
    sourceRecord.bundleSha256,
    "source bundle digest differs",
  );
  const sourceBundle = object(bundle.document, "source bundle");
  assert.equal(sourceBundle.repository, sourceRecord.repository);
  assert.equal(sourceBundle.commit, sourceRecord.commit);
  const sourcePath = text(sourceRecord.path, "source path");
  const sourceFile = objects(sourceBundle.files, "source files").find((f) => f.path === sourcePath);
  assert(sourceFile, "reviewed interface source is missing");
  const source = text(sourceFile.content, "interface source");
  assert.equal(sha(source), sourceRecord.fileSha256, "interface source digest differs");
  const sourceArtifact = objects(catalog.sourceArtifacts, "ABI source artifacts").find(
    (a) => a.path === sourcePath,
  );
  assert.equal(sourceArtifact?.sha256, sourceRecord.fileSha256, "ABI source binding differs");
  const abi = reconcileNttManagerEvents(original.document, source);
  assert.equal(abi.length, candidate.entryCount);
  const reviewed = await loadKnowledgeReference(root, candidate.artifactReference);
  assert.equal(
    sha(await readFile(reviewed.path)),
    candidate.fileSha256,
    "reviewed ABI digest differs",
  );
  assert.deepEqual(abi, reviewed.document, "derived ABI differs from the accepted correction");
  assert.equal(
    sha(JSON.stringify(abi, null, 2) + "\n"),
    candidate.fileSha256,
    "derived ABI bytes differ",
  );
  return {
    abi,
    original: objects(original.document, "original ABI"),
    source,
    sourcePath,
    correctionReference: object(catalog.correctionReference, "correction reference"),
  };
}
