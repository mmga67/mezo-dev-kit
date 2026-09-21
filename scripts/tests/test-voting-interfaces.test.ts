import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";
import { object, objects } from "../lib/json.ts";
import { generateVotingInterfaces } from "../lib/voting-interface-generation.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("compiler profiles retain three separate voters and exact embedded reward children", async () => {
  const result = await generateVotingInterfaces(root);
  expect(Object.keys(result.voters).sort()).toEqual(["boost", "pools", "validator"]);
  expect(Object.keys(result.rewards).sort()).toEqual(["bribe", "fees"]);
});
test.for(["source bytes", "storage slot", "immutable binding", "child executable"] as const)(
  "rejects altered %s before generating a voting profile",
  async (kind) => {
    const scratch = await mkdtemp(join(tmpdir(), "mdk-voting-evidence-"));
    try {
      const catalogResource = await loadKnowledgeReference(root, {
        moduleId: "contracts",
        resourceId: "voting-interfaces",
      });
      const catalog = object(catalogResource.document, "catalog"),
        records = objects(catalog.records, "records"),
        children = objects(catalog.children, "children");
      const references = [
        { moduleId: "contracts", resourceId: "contract-deployments" },
        ...records.flatMap((record) => [
          object(record.source, "source").reference,
          object(record.build, "build").reference,
        ]),
        ...children.map((row) => row.reference),
      ];
      for (const path of [
        catalogResource.indexPath,
        catalogResource.path,
        ...(await Promise.all(
          references.map(async (reference) => (await loadKnowledgeReference(root, reference)).path),
        )),
      ]) {
        const target = join(scratch, relative(root, path));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target);
      }
      const record = records[0],
        child = children[0];
      if (!record || !child) throw new Error("missing voting records");
      if (kind === "source bytes") {
        const path = (
          await loadKnowledgeReference(scratch, object(record.source, "source").reference)
        ).path;
        await writeFile(path, (await readFile(path, "utf8")) + "\n");
      }
      if (kind === "storage slot") record.targetListSlot = "167";
      if (kind === "immutable binding") {
        const binding = objects(child.immutableBindings, "bindings")[0];
        if (!binding) throw new Error("missing binding");
        binding.role = "unknown";
      }
      if (kind === "child executable") {
        const resource = await loadKnowledgeReference(scratch, child.reference),
          build = object(resource.document, "build"),
          code = object(build.bytecode, "bytecode");
        if (typeof code.object !== "string") throw new Error("missing bytecode");
        code.object = `0xff${code.object.slice(4)}`;
        const bytes = JSON.stringify(build);
        await writeFile(resource.path, bytes);
        child.sha256 = createHash("sha256").update(bytes).digest("hex");
      }
      await writeFile(join(scratch, relative(root, catalogResource.path)), JSON.stringify(catalog));
      const message = {
        "source bytes": /artifact digest differs/,
        "storage slot": /target layout differs/,
        "immutable binding": /unknown reward immutable role/,
        "child executable": /not embedded/,
      }[kind];
      await expect(generateVotingInterfaces(scratch)).rejects.toThrow(message);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
