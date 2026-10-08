import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { expect, test } from "vitest";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";
import { object, objects } from "../lib/json.ts";
import { loadReviewedNttManagerAbi, reconcileNttManagerEvents } from "../lib/ntt-manager-abi.ts";

const root = resolve(import.meta.dirname, "../..");
const reviewReference = {
  moduleId: "contracts",
  resourceId: "ntt-transfer-event-abi-review-2026-10-07",
};
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

test("approved source correction reproduces the exact ABI and preserves every unrelated entry", async () => {
  const { abi, original, source } = await loadReviewedNttManagerAbi(root);
  const before = structuredClone(original);
  expect(reconcileNttManagerEvents(original, source)).toEqual(abi);
  expect(original).toEqual(before);
  expect(abi).toHaveLength(120);
  expect(original).toHaveLength(119);
  const others = (entries: typeof abi) =>
    entries.filter((e) => e.type !== "event" || e.name !== "TransferSent");
  expect(others(abi)).toEqual(others(original));
  expect(others(abi)).toHaveLength(118);
  expect(() => reconcileNttManagerEvents(abi, source)).toThrow(
    "original TransferSent overload count",
  );
});

test.for([
  ["pending", "not accepted"],
  ["accepted digest", "accepted ABI digest differs"],
  ["original bytes", "original ABI digest differs"],
  ["source bytes", "source bundle digest differs"],
  ["candidate bytes", "reviewed ABI digest differs"],
  ["unrelated edit", "derived ABI differs"],
] as const)("reviewed ABI correction rejects %s", async ([mutation, message]) => {
  const directory = await mkdtemp(resolve(tmpdir(), "mdk-ntt-abi-correction-"));
  try {
    const loadedReview = await loadKnowledgeReference(root, reviewReference);
    const review = object(loadedReview.document, "review");
    const original = object(review.original, "original");
    const candidate = object(review.candidate, "candidate");
    const source = object(review.source, "source");
    for (const reference of [
      { moduleId: "contracts", resourceId: "contract-abis" },
      reviewReference,
      original.artifactReference,
      candidate.artifactReference,
      source.bundleReference,
    ]) {
      const loaded = await loadKnowledgeReference(root, reference);
      for (const path of [loaded.path, loaded.indexPath]) {
        const target = resolve(directory, relative(root, path));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target);
      }
    }
    if (mutation === "pending") review.reviewStatus = "pending-qualified-review";
    else if (mutation === "accepted digest")
      object(review.acceptance, "acceptance").fileSha256 = "0".repeat(64);
    else {
      const reference =
        mutation === "original bytes"
          ? original.artifactReference
          : mutation === "source bytes"
            ? source.bundleReference
            : candidate.artifactReference;
      const loaded = await loadKnowledgeReference(directory, reference);
      let bytes = await readFile(loaded.path, "utf8");
      if (mutation === "unrelated edit") {
        const entries = objects(loaded.document, "candidate ABI");
        const unrelated = entries.find((e) => e.type === "function");
        assert(unrelated);
        unrelated.name = "unapprovedFunction";
        bytes = JSON.stringify(entries, null, 2) + "\n";
        candidate.fileSha256 = sha(bytes);
        object(review.acceptance, "acceptance").fileSha256 = sha(bytes);
      } else bytes += "\n";
      await writeFile(loaded.path, bytes);
    }
    await writeFile(resolve(directory, relative(root, loadedReview.path)), JSON.stringify(review));
    await expect(loadReviewedNttManagerAbi(directory)).rejects.toThrow(message);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
