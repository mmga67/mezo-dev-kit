import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, values } from "../../../scripts/lib/json.ts";
import { validateNttTransferEvidence } from "../tools/ntt-transfer-evidence.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
test("NTT source and fixed-block observations bind all three token runtimes", async () => {
  const result = await validateNttTransferEvidence(root);
  expect(result.tokens.map((t) => t.networkId).sort()).toEqual([
    "base-mainnet",
    "ethereum-mainnet",
    "mezo-mainnet",
  ]);
});
test.for([
  "artifact bytes",
  "lifecycle",
  "chain",
  "header",
  "runtime block",
  "slot",
  "token",
  "attestation message",
] as const)("rejects NTT provenance drift: %s", async (kind) => {
  const scratch = await mkdtemp(join(tmpdir(), "mdk-ntt-negative-"));
  try {
    const envelope = await loadKnowledgeReference(root, {
      moduleId: "workflows/bridges",
      resourceId: "ntt-transfer-qualification-2026-09-13",
    });
    const evidence = object(envelope.document, "evidence");
    for (const ref of [
      { moduleId: "workflows/bridges", resourceId: "ntt-transfer-qualification-2026-09-13" },
      evidence.sourceReference,
      evidence.captureReference,
      evidence.attestationReference,
      { moduleId: "workflows/bridges", resourceId: "bridge-sources" },
      { moduleId: "workflows/bridges", resourceId: "bridge-musd-ntt-evidence" },
      { moduleId: "contracts", resourceId: "contract-deployments" },
      ...["mezo-mainnet", "ethereum-mainnet", "base-mainnet"].map((resourceId) => ({
        moduleId: "networks",
        resourceId,
      })),
    ]) {
      const loaded = await loadKnowledgeReference(root, ref);
      for (const path of [loaded.path, loaded.indexPath]) {
        const target = join(scratch, relative(root, path));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target);
      }
    }
    const captured = await loadKnowledgeReference(scratch, evidence.captureReference),
      capture = object(captured.document, "capture");
    if (kind === "artifact bytes")
      await writeFile(captured.path, (await readFile(captured.path, "utf8")) + "\n");
    else if (kind === "lifecycle") evidence.reviewStatus = "accepted";
    else if (kind === "attestation message") {
      const loaded = await loadKnowledgeReference(scratch, evidence.attestationReference),
        document = object(loaded.document, "attestations");
      const row = objects(document.records, "records")[0];
      assert(row);
      row.message = `0x${"00".repeat(145)}`;
      const bytes = JSON.stringify(document);
      await writeFile(loaded.path, bytes);
      evidence.attestationSha256 = createHash("sha256").update(bytes).digest("hex");
    } else {
      const requests = objects(capture.requests, "requests"),
        row = objects(capture.records, "records")[0];
      assert(row);
      if (kind === "chain") {
        const r = requests.find((r) => r.method === "eth_chainId");
        assert(r);
        object(r.response, "response").result = "0x1";
      }
      if (kind === "header") row.blockHash = `0x${"ab".repeat(32)}`;
      if (kind === "runtime block") {
        const r = requests.find((r) => r.method === "eth_getCode");
        assert(r);
        const p = [...values(r.params, "params")];
        p[p.length - 1] = "0x1";
        r.params = p;
      }
      if (kind === "slot")
        object(row["bridge.musd-ntt-manager"], "manager").slot = `0x${"00".repeat(32)}`;
      if (kind === "token") object(row.token, "token").address = `0x${"aa".repeat(20)}`;
      const bytes = JSON.stringify(capture);
      await writeFile(captured.path, bytes);
      evidence.captureSha256 = createHash("sha256").update(bytes).digest("hex");
    }
    await writeFile(join(scratch, relative(root, envelope.path)), JSON.stringify(evidence));
    await expect(validateNttTransferEvidence(scratch)).rejects.toThrow();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
