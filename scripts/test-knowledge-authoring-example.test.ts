import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { object, objects, parseJson } from "./lib/json.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = resolve(
  repositoryRoot,
  "docs/guides/examples/knowledge-authoring/synthetic-widget-catalog",
);
const validator = resolve(repositoryRoot, "scripts/validate-knowledge-structure.ts");
const semanticValidator = resolve(
  repositoryRoot,
  "scripts/validate-knowledge-authoring-example.ts",
);
const generator = resolve(repositoryRoot, "scripts/generate-knowledge-authoring-example.ts");

function run(script: string, ...arguments_: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [script, ...arguments_], { encoding: "utf8" });
}

async function withDisposableExample(
  useExample: (fixtureRoot: string, moduleRoot: string) => Promise<void>,
): Promise<void> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "mdk-knowledge-authoring-"));
  const moduleRoot = resolve(fixtureRoot, "knowledge/synthetic/widget-catalog");
  try {
    await cp(
      resolve(repositoryRoot, "knowledge/schema"),
      resolve(fixtureRoot, "knowledge/schema"),
      {
        recursive: true,
      },
    );
    await cp(exampleRoot, moduleRoot, { recursive: true });
    await useExample(fixtureRoot, moduleRoot);
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
}

describe("knowledge-authoring documentation example", () => {
  test("the disposable module passes structural, semantic, and drift checks", async () => {
    await withDisposableExample(async (fixtureRoot, moduleRoot) => {
      const structure = run(
        validator,
        "--repository-root",
        fixtureRoot,
        "--module",
        "synthetic/widget-catalog",
      );
      expect(structure.status, structure.stderr).toBe(0);

      const semantics = run(semanticValidator, "--module-root", moduleRoot);
      expect(semantics.status, semantics.stderr).toBe(0);

      const drift = run(generator, "--module-root", moduleRoot, "--check");
      expect(drift.status, drift.stderr).toBe(0);
    });
  });

  test("a canonical-input change fails drift until deterministic regeneration", async () => {
    await withDisposableExample(async (_fixtureRoot, moduleRoot) => {
      const recordsPath = resolve(moduleRoot, "records/widgets.json");
      const records = object(
        parseJson(await readFile(recordsPath, "utf8"), "synthetic records"),
        "synthetic records",
      );
      const [record] = objects(records.records, "synthetic record rows");
      expect(record).toBeDefined();
      if (record === undefined) throw new Error("synthetic record is missing");
      record.displayName = "Drifted Widget";
      await writeFile(recordsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");

      const semanticFailure = run(semanticValidator, "--module-root", moduleRoot);
      expect(semanticFailure.status).not.toBe(0);
      expect(semanticFailure.stderr).toContain("record display name drifted from its evidence");

      const artifactPath = resolve(moduleRoot, "artifacts/widget-specification.json");
      const artifact = object(
        parseJson(await readFile(artifactPath, "utf8"), "synthetic artifact"),
        "synthetic artifact",
      );
      object(artifact.widget, "synthetic artifact widget").displayName = "Drifted Widget";
      const artifactBytes = `${JSON.stringify(artifact, null, 2)}\n`;
      await writeFile(artifactPath, artifactBytes, "utf8");

      const staleSource = run(semanticValidator, "--module-root", moduleRoot);
      expect(staleSource.status).not.toBe(0);
      expect(staleSource.stderr).toContain("source digest does not match its artifact");

      const sourcesPath = resolve(moduleRoot, "sources/catalog.json");
      const sources = object(
        parseJson(await readFile(sourcesPath, "utf8"), "synthetic sources"),
        "synthetic sources",
      );
      const [source] = objects(sources.sources, "synthetic source rows");
      if (source === undefined) throw new Error("synthetic source is missing");
      source.sha256 = createHash("sha256").update(artifactBytes).digest("hex");
      await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, "utf8");

      const evidencePath = resolve(moduleRoot, "evidence/observations.json");
      const evidence = object(
        parseJson(await readFile(evidencePath, "utf8"), "synthetic evidence"),
        "synthetic evidence",
      );
      const [observation] = objects(evidence.observations, "synthetic observations");
      if (observation === undefined) throw new Error("synthetic observation is missing");
      observation.displayName = "Drifted Widget";
      await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

      const semantics = run(semanticValidator, "--module-root", moduleRoot);
      expect(semantics.status, semantics.stderr).toBe(0);

      const drift = run(generator, "--module-root", moduleRoot, "--check");
      expect(drift.status).not.toBe(0);
      expect(drift.stderr).toContain("synthetic generated reference drifted");

      const regenerate = run(generator, "--module-root", moduleRoot);
      expect(regenerate.status, regenerate.stderr).toBe(0);
      const current = run(generator, "--module-root", moduleRoot, "--check");
      expect(current.status, current.stderr).toBe(0);
      expect(await readFile(resolve(moduleRoot, "generated/reference.md"), "utf8")).toContain(
        "Display name: Drifted Widget",
      );
    });
  });
});
