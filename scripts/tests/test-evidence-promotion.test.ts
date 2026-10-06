import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  applyPromotionFiles,
  promotionDiff,
  promotionDigest,
  promotionRead,
  recoverPromotionFiles,
} from "../evidence/promotion-files.ts";
import { proposeOracleRefresh } from "../evidence/oracle-refresh-plan.ts";
import { applyOraclePromotion } from "../evidence/oracle-promotion.ts";
import { object, parseJson } from "../lib/json.ts";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "promotion-test-"));
  roots.push(root);
  const path = "knowledge/contracts/index.json";
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), "before");
  const changes = [
    { path, before: "before", after: "after" },
    {
      path: `knowledge/contracts/artifacts/oracle-captures/mezo-mainnet-2026-10-06-${"a".repeat(24)}.json`,
      before: null,
      after: "capture",
    },
  ];
  return { root, path, changes, inputs: [{ path, sha256: promotionDigest("before") }] };
}
test.for([
  { refusal: "review-digest", message: "Reviewed changeset digest mismatch" },
  { refusal: "capture-digest", message: "Capture digest mismatch" },
  { refusal: "validation", message: "Required proposal validation did not pass" },
])("reviewed apply rejects $refusal before any canonical write", async ({ refusal, message }) => {
  const f = await fixture();
  const capture = "retained capture bytes";
  const proposal = JSON.stringify({
    formatVersion: 1,
    recipe: "oracle-mainnet-matching-v1",
    disposition: "matching-reverification",
    inputs: f.inputs,
    capture,
    captureSha256: promotionDigest(refusal === "capture-digest" ? "different bytes" : capture),
    validation: [],
    changes: f.changes,
  });
  await expect(
    applyOraclePromotion(
      f.root,
      proposal,
      promotionDigest(refusal === "review-digest" ? `${proposal}\n` : proposal),
      Date.now(),
    ),
  ).rejects.toThrow(message);
  expect(await promotionRead(f.root, f.path)).toBe("before");
  expect(await promotionRead(f.root, f.changes[1]!.path)).toBeNull();
  expect(await promotionRead(f.root, "local/evidence-promotion-operation/journal.json")).toBeNull();
});
test("a complete staged apply preserves unrelated content and commits exact proposed bytes", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "unrelated"), "human edit");
  await applyPromotionFiles(f.root, f.changes, f.inputs);
  expect(await promotionRead(f.root, f.path)).toBe("after");
  expect(await promotionRead(f.root, f.changes[1]!.path)).toBe("capture");
  expect(await readFile(join(f.root, "unrelated"), "utf8")).toBe("human edit");
  await expect(applyPromotionFiles(f.root, f.changes, f.inputs)).rejects.toThrow("Concurrent edit");
});
test.for([0, 1])(
  "interruption after write %s restores inputs and archives capture bytes for retry",
  async (at) => {
    const f = await fixture();
    await expect(
      applyPromotionFiles(f.root, f.changes, f.inputs, async (i) => {
        if (i === at) throw new Error("power interrupted");
      }),
    ).rejects.toThrow("interrupted");
    await recoverPromotionFiles(f.root);
    expect(await promotionRead(f.root, f.path)).toBe("before");
    expect(await promotionRead(f.root, f.changes[1]!.path)).toBeNull();
    const archive = (await readdir(join(f.root, "local"))).find((p) =>
      p.startsWith("evidence-promotion-recovery-"),
    );
    expect(await readFile(join(f.root, "local", archive!), "utf8")).toContain("capture");
    await applyPromotionFiles(f.root, f.changes, f.inputs);
    expect(await promotionRead(f.root, f.path)).toBe("after");
  },
);
test("concurrent source edits prevent the first write", async () => {
  const f = await fixture();
  await writeFile(join(f.root, f.path), "later edit");
  await expect(applyPromotionFiles(f.root, f.changes, f.inputs)).rejects.toThrow("Concurrent edit");
  expect(await promotionRead(f.root, f.changes[1]!.path)).toBeNull();
});
test("recovery refuses to overwrite an edit made after interruption", async () => {
  const f = await fixture();
  await expect(
    applyPromotionFiles(f.root, f.changes, f.inputs, async () => {
      throw new Error("stop");
    }),
  ).rejects.toThrow("interrupted");
  await writeFile(join(f.root, f.path), "human correction");
  await expect(recoverPromotionFiles(f.root)).rejects.toThrow("later edit");
  expect(await promotionRead(f.root, f.path)).toBe("human correction");
});
test("a dependency edit during apply retains recovery and preserves the later source edit", async () => {
  const f = await fixture();
  await writeFile(join(f.root, "source.json"), "original source");
  const inputs = [...f.inputs, { path: "source.json", sha256: promotionDigest("original source") }];
  await expect(
    applyPromotionFiles(f.root, f.changes, inputs, async (index) => {
      if (index === 0) await writeFile(join(f.root, "source.json"), "later source");
    }),
  ).rejects.toThrow("interrupted");
  await recoverPromotionFiles(f.root);
  expect(await promotionRead(f.root, f.path)).toBe("before");
  expect(await promotionRead(f.root, "source.json")).toBe("later source");
});
test("history replacement and symlink traversal are rejected before mutation", async () => {
  const f = await fixture();
  await expect(
    applyPromotionFiles(f.root, [{ ...f.changes[1]!, before: "old capture" }], []),
  ).rejects.toThrow("overwrites history");
  await symlink(tmpdir(), join(f.root, "escape"), "dir");
  await expect(promotionRead(f.root, "escape/example")).rejects.toThrow("Symlinked");
});
test("field changes retain absent/null and escape JSON pointer keys", () => {
  expect(promotionDiff({ "a/b": null }, { "a/b": 1, "~x": null })).toEqual([
    {
      pointer: "/a~1b",
      before: { present: true, value: null },
      after: { present: true, value: 1 },
    },
    {
      pointer: "/~0x",
      before: { present: false, value: null },
      after: { present: true, value: null },
    },
  ]);
});
const repository = resolve(import.meta.dirname, "../..");
async function captureFixture() {
  const deployment = object(
    (
      await loadKnowledgeReference(repository, {
        moduleId: "contracts",
        resourceId: "contract-deployments",
        recordId: "oracle.pyth-price-feed@mezo-mainnet",
      })
    ).value,
    "current oracle deployment",
  );
  const evidence = await loadKnowledgeReference(repository, deployment.evidenceReference);
  const capture = object(
    (
      await loadKnowledgeReference(
        repository,
        object(evidence.document, "evidence").captureReference,
      )
    ).document,
    "capture",
  );
  const network = object(object(capture.observations, "observations")["mezo-mainnet"], "mainnet");
  const block = object(network.block, "block");
  if (typeof block.number !== "number") throw new Error("fixture block");
  block.number += 1; // Synthetic next block: never represented as live evidence.
  return {
    capture,
    previousEvidencePath: evidence.resource.path,
    asOf: Date.parse(String(capture.capturedAt)),
    read: (p: string) => readFile(join(repository, p), "utf8"),
  };
}
test("oracle proposal is offline, preserves history, and uses unique content identities within one day", async () => {
  const f = await captureFixture();
  const first = await proposeOracleRefresh(Buffer.from(JSON.stringify(f.capture)), f.read, f.asOf);
  const second = await proposeOracleRefresh(
    Buffer.from(JSON.stringify(f.capture, null, 2)),
    f.read,
    f.asOf,
  );
  expect(first).toHaveLength(8);
  expect(first[0]!.path).not.toBe(second[0]!.path);
  const index = object(
    parseJson(first.find((e) => e.path === "knowledge/contracts/index.json")!.content, "index"),
    "index",
  );
  expect(JSON.stringify(index)).toContain(f.previousEvidencePath);
  // A subsequent renewal must remain testable after the first proposal becomes
  // the baseline. Both captures are synthetic, never retained as live evidence.
  const updated = new Map(first.map((entry) => [entry.path, entry.content]));
  const next = structuredClone(f.capture);
  const block = object(
    object(object(next.observations, "observations")["mezo-mainnet"], "network").block,
    "block",
  );
  if (typeof block.number !== "number") throw new Error("fixture block");
  block.number += 1;
  const third = await proposeOracleRefresh(
    Buffer.from(JSON.stringify(next)),
    async (path) => updated.get(path) ?? f.read(path),
    f.asOf,
  );
  const nextIndex = third.find((entry) => entry.path === "knowledge/contracts/index.json")!;
  expect(nextIndex.content).toContain(first[0]!.path.replace("knowledge/contracts/", ""));
});
test("expired and incomplete captures cannot propose a renewal", async () => {
  const f = await captureFixture();
  await expect(
    proposeOracleRefresh(Buffer.from(JSON.stringify(f.capture)), f.read, f.asOf + 86400000),
  ).rejects.toThrow("24 hours");
  delete f.capture.officialPyth;
  await expect(
    proposeOracleRefresh(Buffer.from(JSON.stringify(f.capture)), f.read, f.asOf),
  ).rejects.toThrow("official Pyth");
});
test("later configuration drift and historical replay corrections require different dispositions", async () => {
  const f = await captureFixture();
  const network = object(object(f.capture.observations, "observations")["mezo-mainnet"], "network");
  const pyth = object(object(network.contracts, "contracts").pyth, "pyth");
  const original = pyth.version;
  pyth.version = "changed";
  await expect(
    proposeOracleRefresh(Buffer.from(JSON.stringify(f.capture)), f.read, f.asOf),
  ).rejects.toMatchObject({ disposition: "later-change-review" });
  pyth.version = original;
  if (!Array.isArray(pyth.implementationHistory)) throw new Error("fixture history");
  object(
    object(pyth.implementationHistory[0], "generation").effectiveFrom,
    "transition",
  ).blockHash = `0x${"ab".repeat(32)}`;
  await expect(
    proposeOracleRefresh(Buffer.from(JSON.stringify(f.capture)), f.read, f.asOf),
  ).rejects.toMatchObject({ disposition: "historical-correction-review" });
});
