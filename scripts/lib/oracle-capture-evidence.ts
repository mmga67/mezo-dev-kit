import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { object, objects, text, texts, type JsonObject } from "./json.ts";
import { loadKnowledgeReference } from "./knowledge-reference.ts";

/** Bind a new evidence envelope to the exact capture bytes and network/block scope. */
export async function assertOracleCaptureEvidence(
  root: string,
  evidence: JsonObject,
): Promise<void> {
  if (evidence.captureReference === undefined) return;
  const reference = object(evidence.captureReference, "capture reference");
  if (reference.moduleId !== "contracts") throw new Error("oracle capture owner must be Contracts");
  const capture = await loadKnowledgeReference(root, {
    moduleId: "contracts",
    resourceId: text(reference.resourceId, "capture resource"),
  });
  const digest = createHash("sha256")
    .update(await readFile(capture.path))
    .digest("hex");
  if (digest !== evidence.captureSha256) throw new Error("oracle capture digest drifted");
  const document = object(capture.document, "capture document");
  if (document.kind !== "price-source-capture" || document.capturedAt !== evidence.verifiedAt) {
    throw new Error("oracle capture identity or timestamp drifted");
  }
  const networks = texts(document.networkIds, "capture networks");
  const snapshots = objects(evidence.networkSnapshots, "evidence snapshots");
  if (networks.length !== snapshots.length || new Set(networks).size !== networks.length) {
    throw new Error("oracle capture network coverage drifted");
  }
  const observations = object(document.observations, "capture observations");
  for (const snapshot of snapshots) {
    const networkId = text(snapshot.networkId, "snapshot network");
    if (!networks.includes(networkId)) throw new Error("oracle capture network mismatch");
    const observation = object(observations[networkId], "captured network");
    const block = object(observation.block, "captured block");
    if (
      observation.chainId !== snapshot.evmChainId ||
      block.number !== snapshot.blockNumber ||
      block.hash !== snapshot.blockHash ||
      block.timestamp !== snapshot.blockTimestamp ||
      observation.rpcUrl !== snapshot.rpcUrl
    ) {
      throw new Error("oracle capture snapshot mismatch");
    }
  }
}
