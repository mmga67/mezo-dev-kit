import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { object, objects, values } from "../../../scripts/lib/json.ts";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { generateHistoricalContractEvidence } from "../tools/historical-evidence.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
test("pinned source/build and five fixed coordinates reproduce both historical generations", async () => {
  const result = await generateHistoricalContractEvidence(root);
  expect(result.records).toHaveLength(2);
  expect(result.records.flatMap((r) => values(r.coverage, "coverage"))).toHaveLength(5);
});
test.for([
  "artifact bytes",
  "lifecycle",
  "overlap",
  "unobserved range",
  "block hash",
  "implementation slot",
  "compiler ABI",
  "client source",
] as const)("fails historical projection for %s", async (kind) => {
  const scratch = await mkdtemp(join(tmpdir(), "mdk-historical-negative-"));
  try {
    const catalogResource = await loadKnowledgeReference(root, {
      moduleId: "contracts",
      resourceId: "historical-contract-evidence",
    });
    const catalog = object(catalogResource.document, "catalog"),
      records = objects(catalog.records, "records"),
      row = records[0],
      mezo = records[1];
    if (!row || !mezo) throw new Error("missing historical profiles");
    const references = [
      { moduleId: "contracts", resourceId: "historical-contract-evidence" },
      { moduleId: "contracts", resourceId: "contract-deployments" },
      { moduleId: "contracts", resourceId: "abi.bridge.native-assets-precompile" },
      { moduleId: "networks", resourceId: "ethereum-mainnet" },
      { moduleId: "networks", resourceId: "mezo-mainnet" },
      ...records.flatMap((r) => [
        object(r.source, "source").reference,
        object(r.build, "build").reference,
        object(r.observations, "observations").reference,
      ]),
    ];
    for (const ref of references) {
      const loaded = await loadKnowledgeReference(root, ref);
      for (const path of [loaded.path, loaded.indexPath]) {
        const target = join(scratch, relative(root, path));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target);
      }
    }
    if (kind === "lifecycle") catalog.reviewStatus = "accepted";
    if (kind === "overlap") records.push({ ...row, id: "duplicate" });
    const coverage = objects(row.coverage, "coverage"),
      first = coverage[0];
    if (!first) throw new Error("missing coverage");
    if (kind === "unobserved range")
      first.untilExclusiveBlock = String(BigInt(String(first.untilExclusiveBlock)) + 1n);
    if (kind === "block hash") first.blockHash = `0x${"ff".repeat(32)}`;
    if (kind === "artifact bytes") {
      const path = (await loadKnowledgeReference(scratch, object(row.source, "source").reference))
        .path;
      await writeFile(path, (await readFile(path, "utf8")) + "\n");
    }
    if (kind === "implementation slot" || kind === "compiler ABI" || kind === "client source") {
      const binding = object(
        kind === "implementation slot"
          ? row.observations
          : kind === "compiler ABI"
            ? row.build
            : mezo.source,
        "artifact binding",
      );
      const loaded = await loadKnowledgeReference(scratch, binding.reference);
      if (kind === "implementation slot") {
        const p = objects(loaded.document, "probes").find(
          (p) => object(p.request, "request").id === 4,
        );
        if (!p) throw new Error("missing probe");
        object(p.response, "response").result = `0x${"00".repeat(32)}`;
      }
      if (kind === "compiler ABI") object(loaded.document, "build").abi = [];
      if (kind === "client source") {
        const files = object(object(loaded.document, "source").files, "files");
        object(files["precompile/assetsbridge/bridge_out.go"], "file").content = "tampered";
      }
      const bytes = JSON.stringify(loaded.document);
      await writeFile(loaded.path, bytes);
      binding.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    catalog.records = records;
    await writeFile(join(scratch, relative(root, catalogResource.path)), JSON.stringify(catalog));
    const expected = {
      "artifact bytes": /artifact digest differs/,
      lifecycle: /lifecycle differs/,
      overlap: /overlapping historical/,
      "unobserved range": /single observed block/,
      "block hash": /block hash differs/,
      "implementation slot": /implementation slot differs/,
      "compiler ABI": /ABI bounds/,
      "client source": /client source digest differs/,
    }[kind];
    await expect(generateHistoricalContractEvidence(scratch)).rejects.toThrow(expected);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
