import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  capturePoolSourceBundle,
  loadPoolSourceBundle,
  parsePoolSourceBundle,
  poolSourceDigest,
  selectPoolSource,
} from "../lib/pool-source.ts";

function capture() {
  return {
    name: "SyntheticPool",
    file_path: "contracts/Pool.sol",
    source_code: "contract SyntheticPool {}",
    additional_sources: [{ file_path: "contracts/Token.sol", source_code: "interface Token {}" }],
    verified_at: "2026-01-01T00:00:00Z",
  };
}

describe("retained pool source identity", () => {
  test("changed response metadata retains source identity", () => {
    const original = capture();
    const refreshed = { ...original, verified_at: "2026-02-01T00:00:00Z" };
    const responseHash = (value: unknown) =>
      createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(responseHash(original)).not.toBe(responseHash(refreshed));
    expect(poolSourceDigest(capturePoolSourceBundle(original))).toBe(
      poolSourceDigest(capturePoolSourceBundle(refreshed)),
    );
  });

  test("changed dependency content changes source identity", () => {
    const changed = capture();
    changed.additional_sources = [
      { file_path: "contracts/Token.sol", source_code: "interface DifferentToken {}" },
    ];
    expect(poolSourceDigest(capturePoolSourceBundle(changed))).not.toBe(
      poolSourceDigest(capturePoolSourceBundle(capture())),
    );
  });

  test("capture ordering and JSON formatting do not change source identity", () => {
    const original = capture();
    original.additional_sources.push({ file_path: "contracts/A.sol", source_code: "library A {}" });
    const reordered = {
      ...original,
      additional_sources: [...original.additional_sources].reverse(),
    };
    const bundle = capturePoolSourceBundle(original);
    expect(poolSourceDigest(capturePoolSourceBundle(reordered))).toBe(poolSourceDigest(bundle));
    expect(
      poolSourceDigest(parsePoolSourceBundle(JSON.parse(JSON.stringify(bundle, null, 2)))),
    ).toBe(poolSourceDigest(bundle));
  });

  test("selects only the requested source without evaluating a filesystem path", () => {
    const bundle = capturePoolSourceBundle(capture());
    expect(selectPoolSource(bundle)).toBe("contract SyntheticPool {}");
    expect(selectPoolSource(bundle, "contracts/Token.sol")).toBe("interface Token {}");
    expect(() => selectPoolSource(bundle, "../../etc/passwd")).toThrow(/source file.*not found/);
  });

  test.for([
    { label: "missing main source", value: { ...capture(), source_code: undefined } },
    { label: "missing dependencies", value: { ...capture(), additional_sources: undefined } },
    { label: "malformed dependency", value: { ...capture(), additional_sources: [null] } },
    {
      label: "duplicate file",
      value: {
        ...capture(),
        additional_sources: [{ file_path: "contracts/Pool.sol", source_code: "contract Other {}" }],
      },
    },
  ])("rejects $label", ({ value }) => {
    expect(() => capturePoolSourceBundle(value)).toThrow();
  });
});

describe("indexed pool source retrieval", () => {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

  test.for(["mezo-earn.cl-position-manager", "incentives.cl-gauge-implementation"])(
    "resolves %s offline and matches the accepted reproduction digest",
    async (contractId) => {
      const bundle = await loadPoolSourceBundle(repositoryRoot, contractId);
      expect(selectPoolSource(bundle)).toContain("pragma solidity");
    },
  );

  test("rejects an unknown contract rather than searching temporary directories", async () => {
    await expect(loadPoolSourceBundle(repositoryRoot, "unknown.contract")).rejects.toThrow(
      /not declared/,
    );
  });

  test.for(["altered source", "missing source"])(
    "rejects %s in an indexed artifact",
    async (scenario) => {
      const fixtureRoot = await mkdtemp(join(tmpdir(), "mdk-pool-source-test-"));
      const artifactPath =
        "knowledge/contracts/artifacts/pool-sources/incentives.cl-gauge-implementation.json";
      try {
        for (const path of [
          "knowledge/index.json",
          "knowledge/records/modules.json",
          "knowledge/contracts/index.json",
          "knowledge/contracts/sources/pool-source-bundles.json",
          "knowledge/protocols/pools/index.json",
          "knowledge/protocols/pools/evidence/source-reproduction-2026-08-23.json",
          artifactPath,
        ]) {
          await mkdir(dirname(join(fixtureRoot, path)), { recursive: true });
          await copyFile(join(repositoryRoot, path), join(fixtureRoot, path));
        }
        const target = join(fixtureRoot, artifactPath);
        if (scenario === "missing source") {
          await rm(target);
        } else {
          const bundle = parsePoolSourceBundle(JSON.parse(await readFile(target, "utf8")));
          await writeFile(target, JSON.stringify({ ...bundle, sourceCode: "contract Altered {}" }));
        }
        await expect(
          loadPoolSourceBundle(fixtureRoot, "incentives.cl-gauge-implementation"),
        ).rejects.toThrow(
          scenario === "missing source" ? /is missing/ : /source bundle digest drifted/,
        );
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );
});
