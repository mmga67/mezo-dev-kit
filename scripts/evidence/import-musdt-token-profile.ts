import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { object, objects, parseJson, text } from "../lib/json.ts";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [captureDirectory, ...extra] = process.argv.slice(2);
assert(
  captureDirectory && extra.length === 0,
  "usage: import-musdt-token-profile.ts <capture-directory>",
);
const directory = resolve(captureDirectory),
  artifactDirectory = resolve(root, "knowledge/contracts/artifacts/musdt-token-runtime");
const load = async (name: string) =>
  object(parseJson(await readFile(resolve(directory, name), "utf8"), name), name);
const capture = await load("capture.json"),
  result = object(capture.result, "capture result"),
  runtime = object(result.runtime, "runtime"),
  block = object(result.block, "block");
const proxy = await load("proxy-explorer.json"),
  implementation = await load("implementation-explorer.json");
assert.equal(proxy.is_fully_verified, true);
assert.equal(implementation.is_fully_verified, true);
assert.equal(proxy.deployed_bytecode, runtime.code);
assert.equal(implementation.deployed_bytecode, runtime.implementationCode);
assert.equal(implementation.name, "mUSDT");
assert.equal(result.decimals, "6");
const oldNative = object(
  (
    await loadKnowledgeReference(root, {
      moduleId: "workflows/bridges",
      resourceId: "bridge-native-evidence",
    })
  ).document,
  "Native evidence",
);
const mapping = object(result.mapping, "mapping");
assert(
  objects(oldNative.erc20Mappings, "mappings").some(
    (row) => row.sourceToken === mapping.sourceToken && row.mezoToken === runtime.token,
  ),
);
assert.deepEqual(result.currentMapping, [mapping.sourceToken, runtime.token]);
const formatted = async (value: unknown) =>
  format(JSON.stringify(value), {
    ...(await resolveConfig(resolve(root, "package.json"))),
    parser: "json",
  });
await mkdir(artifactDirectory, { recursive: true });
const artifacts = [];
for (const [resourceId, name, value] of [
  ["musdt-token-proxy-explorer", "proxy-explorer.json", proxy],
  ["musdt-token-implementation-explorer", "implementation-explorer.json", implementation],
  ["musdt-token-runtime-probe", "runtime-probe.json", capture],
] as const) {
  const bytes = await formatted(value);
  await writeFile(resolve(artifactDirectory, name), bytes);
  artifacts.push({
    reference: { moduleId: "contracts", resourceId },
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const profile = {
  schemaVersion: 1,
  knowledgeVersion: "0.4",
  kind: "token-runtime-profile",
  id: "musdt-token-runtime",
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt: capture.at,
  reviewAfter: new Date(Date.parse(text(capture.at, "capture time")) + 30 * 86400000).toISOString(),
  scope: { networkIds: ["mezo-mainnet"], blockNumber: block.number, blockHash: block.hash },
  sourceMappingReference: { moduleId: "workflows/bridges", resourceId: "bridge-native-evidence" },
  sourceToken: mapping.sourceToken,
  tokenAddress: runtime.token,
  decimals: 6,
  implementationAddress: runtime.implementation,
  implementationSlot: runtime.slot,
  addressCodeSha256: runtime.codeSha256,
  implementationCodeSha256: runtime.implementationCodeSha256,
  artifacts,
  transferSemantics:
    "mUSDT is an empty mERC20 subclass. Its inherited source files match the retained mUSDC source class. ERC20Upgradeable transfers debit and credit the exact value and emit Transfer; mERC20 changes precision and privileged minting without overriding transfer/_update. No transfer fee or rebase path is present in this generation.",
  sourceUrls: [runtime.token, runtime.implementation].map(
    (address) => `https://api.explorer.mezo.org/api/v2/smart-contracts/${text(address, "address")}`,
  ),
  limitations: [
    "Private pool/swap writer asset qualification only, pending qualified review; this does not qualify a USDT Native Bridge writer or destination delivery.",
    "Own fully verified explorer source/runtime and fixed-block RPC code/slot/mapping/precision agree. Proxy and implementation hashes differ from mUSDC and must not be substituted.",
    "Independent Solidity 0.8.29 compilation was not performed; no compiler dependency was installed. Source equivalence and deployed bytes, plus separate fork verification, define this private qualification.",
    "Factory pool lookups are fixed-block discovery candidates, not current liquidity or transaction authorization. Native BTC/MEZO execution remains outside this profile.",
  ],
};
await writeFile(
  resolve(root, "knowledge/contracts/records/musdt-token-runtime.json"),
  await formatted(profile),
);
