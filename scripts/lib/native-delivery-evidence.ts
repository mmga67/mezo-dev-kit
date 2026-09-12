import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, parseJson, text, values } from "./json.ts";

/** Validate the bounded qualification's lifecycle and artifact links before projection. */
export async function validateNativeDeliveryEvidence(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function load(reference: unknown, expected?: unknown) {
    const r = await loadKnowledgeReference(root, reference),
      bytes = await readFile(r.path);
    if (expected !== undefined)
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        text(expected, "artifact SHA"),
        "Native qualification artifact digest differs",
      );
    hash.update(bytes);
    return r.document;
  }
  const q = object(
    await load({
      moduleId: "workflows/bridges",
      resourceId: "native-delivery-qualification-2026-09-12",
    }),
    "qualification",
  );
  assert.equal(q.status, "verified");
  assert.equal(q.supportStatus, "proposed");
  assert.equal(q.reviewStatus, "pending-qualified-review");
  assert.equal(q.reviewAfter, null);
  const catalog = object(await load(q.contractEvidenceReference), "historical catalog");
  assert.equal(catalog.reviewStatus, "pending-qualified-review");
  const rpc = objects(await load(q.rpcReference, q.rpcSha256), "RPC");
  assert(rpc.length > 0);
  const source = object(await load(q.sourceReference), "client source"),
    files = object(source.files, "source files");
  for (const path of [
    "rpc/backend/blocks.go",
    "rpc/backend/tracing.go",
    "indexer/kv_indexer.go",
    "x/bridge/keeper/assets_locked.go",
  ]) {
    const file = object(files[path], path);
    assert.equal(
      createHash("sha256").update(text(file.content, "source content")).digest("hex"),
      file.sha256,
      "Native source file digest differs",
    );
  }
  const capture = object(await load(q.consensusReference, q.consensusSha256), "consensus capture");
  assert.equal(capture.status, 200);
  const consensus = object(
      object(parseJson(text(capture.body, "capture body"), "consensus body"), "response").result,
      "consensus",
    ),
    block = object(consensus.block, "block"),
    header = object(block.header, "header");
  const evidence = object(await load(q.transferEvidenceReference), "transfer evidence"),
    transfer = objects(evidence.completedTransfers, "transfers").find(
      (t) => t.sourceNetwork === "ethereum-mainnet",
    );
  assert(transfer);
  const destination = object(transfer.destination, "destination");
  assert.equal(
    `0x${text(object(consensus.block_id, "block ID").hash, "block hash").toLowerCase()}`,
    destination.blockHash,
    "Native consensus block hash differs",
  );
  assert.equal(header.height, String(destination.blockNumber));
  assert.equal(
    values(object(block.data, "data").txs, "transactions").length,
    1,
    "Native consensus attribution differs",
  );
  const network = object(
    await load({ moduleId: "networks", resourceId: "mezo-mainnet" }),
    "network",
  );
  assert.equal(header.chain_id, object(network.values, "network values").cosmosChainId);
  return hash.digest("hex");
}
