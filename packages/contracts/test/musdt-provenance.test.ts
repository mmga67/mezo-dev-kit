import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects } from "../../../scripts/lib/json.ts";
import { validateMusdtTokenEvidence } from "../tools/musdt-token-evidence.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
test("mUSDT projection binds its own verified source, mapping, precision and runtime", async () => {
  const result = await validateMusdtTokenEvidence(root);
  expect(result.profile.decimals).toBe(6);
  expect(result.profile.address).not.toBe(result.profile.implementationAddress);
});
test.for([
  "artifact",
  "missing binding",
  "lifecycle",
  "inherited transfer",
  "slot",
  "precision",
  "mapping",
  "failed RPC",
] as const)("rejects mUSDT %s drift", async (kind) => {
  const scratch = await mkdtemp(join(tmpdir(), "mdk-musdt-negative-"));
  try {
    const owner = await loadKnowledgeReference(root, {
        moduleId: "contracts",
        resourceId: "musdt-token-runtime",
      }),
      profile = object(owner.document, "profile");
    const artifacts = objects(profile.artifacts, "artifacts");
    for (const reference of [
      { moduleId: "contracts", resourceId: "musdt-token-runtime" },
      ...artifacts.map((a) => a.reference),
      ...[
        "musdc-token-proxy-explorer",
        "musdc-token-implementation-explorer",
        "contract-deployments",
        "abi.bridge.native-assets-precompile",
      ].map((resourceId) => ({ moduleId: "contracts", resourceId })),
      profile.sourceMappingReference,
      { moduleId: "networks", resourceId: "mezo-mainnet" },
    ]) {
      const loaded = await loadKnowledgeReference(root, reference);
      for (const path of [loaded.path, loaded.indexPath]) {
        const target = join(scratch, relative(root, path));
        await mkdir(dirname(target), { recursive: true });
        await copyFile(path, target);
      }
    }
    if (kind === "lifecycle") profile.reviewStatus = "accepted";
    else if (kind === "missing binding") profile.artifacts = artifacts.slice(1);
    else {
      const resourceId =
        kind === "inherited transfer"
          ? "musdt-token-implementation-explorer"
          : "musdt-token-runtime-probe";
      const loaded = await loadKnowledgeReference(scratch, { moduleId: "contracts", resourceId }),
        document = object(loaded.document, "artifact");
      if (kind === "artifact")
        await writeFile(loaded.path, (await readFile(loaded.path, "utf8")) + "\n");
      else {
        if (kind === "inherited transfer") {
          const source = objects(document.additional_sources, "sources").find(
            (s) => s.file_path === "contracts/mERC20.sol",
          );
          assert(source);
          source.source_code = `${String(source.source_code)}\n// altered transfer source`;
        } else if (kind === "failed RPC") {
          object(objects(document.requests, "requests")[0]!.response, "response").error = {
            code: -32000,
            message: "unavailable",
          };
        } else {
          const result = object(document.result, "result");
          if (kind === "slot") object(result.runtime, "runtime").storage = `0x${"0".repeat(64)}`;
          if (kind === "precision") result.decimals = "18";
          if (kind === "mapping") result.currentMapping = [];
        }
        const bytes = JSON.stringify(document);
        await writeFile(loaded.path, bytes);
        const binding = artifacts.find(
          (a) => object(a.reference, "reference").resourceId === resourceId,
        );
        assert(binding);
        binding.sha256 = createHash("sha256").update(bytes).digest("hex");
      }
    }
    await writeFile(join(scratch, relative(root, owner.path)), JSON.stringify(profile));
    await expect(validateMusdtTokenEvidence(scratch)).rejects.toThrow();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
