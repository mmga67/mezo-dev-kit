import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text } from "./json.ts";
import { validateNativeMinterProbe } from "../../packages/contracts/tools/native-transfer-evidence.ts";

/** Validate retained Native qualification and project its bounded token/client expectations. */
export async function generateNativeTransferModel(root: string): Promise<{
  digest: string;
  tokens: readonly Record<string, unknown>[];
  client: { reportedVersionPrefix: string; mintAuthority: string; blockedRecipients: string[] };
}> {
  const digest = createHash("sha256");
  async function load(reference: unknown, expected?: unknown) {
    const resource = await loadKnowledgeReference(root, reference);
    const bytes = await readFile(resource.path);
    if (expected !== undefined)
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        expected,
        "Native artifact digest changed",
      );
    digest.update(bytes);
    return object(resource.document, "Native evidence");
  }
  const qualification = await load({
    moduleId: "workflows/bridges",
    resourceId: "native-transfer-qualification-2026-09-15",
  });
  const profile = await load(qualification.tokenRuntimeReference);
  for (const record of [qualification, profile]) {
    assert.equal(record.status, "verified");
    assert.equal(record.supportStatus, "proposed");
    assert.equal(record.reviewStatus, "pending-qualified-review");
    for (const artifact of objects(record.artifacts, "artifacts"))
      await load(artifact.reference, artifact.sha256);
  }
  const musdc = await load(profile.musdcRuntimeReference);
  assert.equal(musdc.status, "verified");
  assert.equal(musdc.supportStatus, "proposed");
  for (const artifact of objects(musdc.artifacts, "mUSDC artifacts"))
    await load(artifact.reference, artifact.sha256);
  const capture = await load({ moduleId: "contracts", resourceId: "native-transfer-current-rpc" });
  const capturedRecords = objects(capture.records, "RPC records");
  const decimal = capturedRecords.find(
    (r) => r.stage === "read" && r.name === "decimals" && r.address === musdc.tokenAddress,
  );
  assert(decimal && Array.isArray(decimal.values));
  const source = await load({
    moduleId: "contracts",
    resourceId: "musdc-token-implementation-explorer",
  });
  const minterAbi = objects(source.abi, "mUSDC ABI").filter(
    (e) => e.type === "function" && e.name === "minter",
  );
  assert.equal(minterAbi.length, 1);
  const rows = [
    ...objects(profile.records, "token profiles"),
    {
      networkId: "mezo-mainnet",
      tokenAddress: musdc.tokenAddress,
      decimals: Number(decimal.values[0]),
      addressCodeSha256: musdc.addressCodeSha256,
      implementationAddress: musdc.implementationAddress,
      implementationSlot: musdc.implementationSlot,
      implementationCodeSha256: musdc.implementationCodeSha256,
    },
  ];
  for (const row of rows) {
    assert(
      typeof row.decimals === "number" &&
        Number.isInteger(row.decimals) &&
        row.decimals >= 0 &&
        row.decimals <= 77,
    );
    const code = capturedRecords.find(
      (r) =>
        r.stage === "token-code" &&
        r.token === row.tokenAddress &&
        object(r.coordinate, "coordinate").networkId === row.networkId,
    );
    assert(code, "Native token code capture missing");
    const actual = createHash("sha256")
      .update(Buffer.from(text(code.code, "code").slice(2), "hex"))
      .digest("hex");
    assert.equal(
      actual,
      row.addressCodeSha256,
      "Native token profile disagrees with captured bytes",
    );
    if (row.implementationAddress !== null) {
      const proxy = capturedRecords.find(
        (r) => r.stage === "token-proxy" && r.token === row.tokenAddress,
      );
      assert(proxy);
      assert.equal(proxy.implementation, row.implementationAddress);
      assert.equal(proxy.slot, row.implementationSlot);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(text(proxy.code, "implementation bytes").slice(2), "hex"))
          .digest("hex"),
        row.implementationCodeSha256,
      );
    }
  }
  const tokens = rows.map((row) => ({
    networkId: text(row.networkId, "network"),
    tokenAddress: text(row.tokenAddress, "token"),
    decimals: row.decimals,
    addressCodeSha256: text(row.addressCodeSha256, "runtime"),
    implementationAddress: row.implementationAddress,
    implementationSlot: row.implementationSlot,
    implementationCodeSha256: row.implementationCodeSha256,
    extraReadAbi: row.tokenAddress === musdc.tokenAddress ? minterAbi : [],
  }));
  assert.equal(tokens.length, 4);
  const client = object(qualification.client, "client");
  const minter = await load(qualification.minterReference);
  const minterEntry = minterAbi[0];
  assert(minterEntry);
  validateNativeMinterProbe({
    probe: minter,
    functionAbi: minterEntry,
    tokenAddress: musdc.tokenAddress,
    mintAuthority: client.mintAuthority,
  });
  for (const module of objects(client.blockedRecipients, "module accounts"))
    assert.equal(
      module.address,
      `0x${createHash("sha256").update(text(module.moduleName, "module name")).digest("hex").slice(0, 40)}`,
    );
  return {
    digest: digest.digest("hex"),
    tokens,
    client: {
      reportedVersionPrefix: text(client.reportedVersionPrefix, "client version"),
      mintAuthority: text(client.mintAuthority, "mint authority"),
      blockedRecipients: objects(client.blockedRecipients, "blocked recipients").map((r) =>
        text(r.address, "module address"),
      ),
    },
  };
}
