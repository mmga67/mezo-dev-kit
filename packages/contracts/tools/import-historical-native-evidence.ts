import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAddress, parseHash32, parseHexData, parseRpcQuantity } from "@mezo-dev-kit/evm";
import { object, objects, parseJson, text, values } from "../../../scripts/lib/json.ts";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";

// Explicit offline import. Inputs are the retained September 12 fixed-block capture,
// exact solc standard input/output, and an official mezod checkout containing v10.
const [captureDirectory, mezodDirectory] = process.argv.slice(2);
assert(
  captureDirectory && mezodDirectory,
  "usage: import-historical-native-evidence.ts <capture-directory> <mezod-checkout>",
);
const root = process.cwd();
const commit = "8542dad7bab1ca2b32d96c37d966f5b713906737";
const sha = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
async function json(path: string): Promise<unknown> {
  return parseJson(await readFile(path, "utf8"), path);
}
const probes = objects(
  await json(resolve(captureDirectory, "native-qualification.json")),
  "probes",
);
function probe(id: number) {
  const found = probes.find((row) => object(row.request, "request").id === id);
  assert(found);
  return found;
}
function result(id: number) {
  const row = probe(id);
  assert.equal(row.httpStatus, 200);
  const response = object(row.response, "response");
  assert.equal(response.error, undefined);
  return response.result;
}
const evidence = object(
  (
    await loadKnowledgeReference(root, {
      moduleId: "workflows/bridges",
      resourceId: "bridge-native-evidence",
    })
  ).document,
  "native evidence",
);
const [inbound, outbound] = objects(evidence.completedTransfers, "transfers");
assert(inbound && outbound);
const ethSource = object(inbound.source, "source");
const deployment = object(
  (
    await loadKnowledgeReference(root, {
      moduleId: "contracts",
      resourceId: "contract-deployments",
      recordId: "bridge.native-mezo-bridge@ethereum-mainnet",
    })
  ).value,
  "deployment",
);
const proxy = object(deployment.proxy, "proxy");
const history = objects(proxy.implementationHistory, "history").find(
  (row) => row.implementationAddress === ethSource.implementation,
);
assert(history);
const compilerInput = object(
  await json(resolve(captureDirectory, "native-historical-standard-input.json")),
  "compiler input",
);
const output = object(
  await json(resolve(captureDirectory, "native-historical-compiler-output.json")),
  "compiler output",
);
const compiled = object(
  object(object(output.contracts, "contracts")["contracts/MezoBridge.sol"], "source").MezoBridge,
  "compiled contract",
);
const evm = object(compiled.evm, "evm"),
  runtime = object(evm.deployedBytecode, "runtime"),
  creation = object(evm.bytecode, "creation");
assert.deepEqual(runtime.immutableReferences, {});
assert.deepEqual(runtime.linkReferences, {});
const ethCode = parseHexData(`0x${text(runtime.object, "runtime bytes")}`);
assert.equal(
  sha(Buffer.from(ethCode.slice(2), "hex")),
  "7ad35b4278f3ccc6fde4490c99f6c9653b25e765ad79cadaafe709762c3da96c",
);
assert.equal(
  sha(Buffer.from(text(creation.object, "creation"), "hex")),
  "6df715476aaf20e3e84579bd1e28af4b20118c73ecdcf67c5b4da3bc9b99c46f",
);
const sourcePaths = [
  "precompile/assetsbridge/abi.json",
  "precompile/assetsbridge/byte_code.go",
  "precompile/assetsbridge/assets_bridge.go",
  "precompile/assetsbridge/IAssetsBridge.sol",
  "precompile/assetsbridge/bridge_out.go",
  "precompile/assetsbridge/observability.go",
  "x/bridge/keeper/assets_locked.go",
  "rpc/backend/tx_info.go",
  "rpc/backend/blocks.go",
  "rpc/backend/tracing.go",
  "indexer/kv_indexer.go",
  "app/upgrades/v9_0/upgrades.go",
  "app/upgrades/v10_0/upgrades.go",
  "x/evm/types/precompile.go",
  "docs/upgrades.md",
];
const sourceFiles = Object.fromEntries(
  sourcePaths.map((path) => {
    const content = execFileSync("git", ["-C", mezodDirectory, "show", `${commit}:${path}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return [path, { content, sha256: sha(content) }];
  }),
);
const abiFile = sourceFiles["precompile/assetsbridge/abi.json"],
  wrapper = sourceFiles["precompile/assetsbridge/byte_code.go"];
assert(abiFile && wrapper);
const mezoAbi = objects(parseJson(abiFile.content, "official ABI"), "official ABI");
const mezoCode = parseHexData(result(15));
assert(wrapper.content.toLowerCase().includes(mezoCode.slice(2)));
assert.equal(
  sha(Buffer.from(mezoCode.slice(2), "hex")),
  "449e7ecd473b8f73842104061d2e9fb9766da719bc2accda8f013940ef8ece92",
);
const indexPath = resolve(root, "knowledge/contracts/index.json"),
  index = object(await json(indexPath), "index");
const resources = objects(index.resources, "resources");
function indexResource(id: string, path: string, role = "artifact", kind = "json-artifact") {
  const row = { id, role, kind, path };
  const i = resources.findIndex((r) => r.id === id);
  if (i < 0) resources.push(row);
  else resources[i] = row;
}
async function artifact(id: string, value: unknown) {
  const path = `artifacts/historical-interfaces/${id}.json`,
    bytes = JSON.stringify(value, null, 2) + "\n";
  await mkdir(resolve(root, "knowledge/contracts/artifacts/historical-interfaces"), {
    recursive: true,
  });
  await writeFile(resolve(root, "knowledge/contracts", path), bytes);
  indexResource(id, path);
  return { reference: { moduleId: "contracts", resourceId: id }, sha256: sha(bytes) };
}
const ethSourceArtifact = await artifact("historical-native-ethereum-source", {
  url: `https://etherscan.io/address/${text(ethSource.implementation, "implementation")}`,
  compiler: "0.8.24+commit.e11b9ed9",
  standardInput: compilerInput,
});
const ethBuild = await artifact("historical-native-ethereum-build", {
  compiler: "0.8.24+commit.e11b9ed9",
  contract: "contracts/MezoBridge.sol:MezoBridge",
  abi: compiled.abi,
  metadata: parseJson(text(compiled.metadata, "metadata"), "metadata"),
  creationBytecode: `0x${text(creation.object, "creation")}`,
  runtimeBytecode: ethCode,
  immutableReferences: runtime.immutableReferences,
  linkReferences: runtime.linkReferences,
});
const mezoSource = await artifact("historical-native-mezo-source", {
  repository: "https://github.com/mezo-org/mezod",
  commit,
  release: "v10.0.0",
  files: sourceFiles,
});
const mezoBuild = await artifact("historical-native-mezo-interface", {
  abi: mezoAbi,
  runtimeBytecode: mezoCode,
  executionVersion: 5,
});
const raw = await artifact("historical-native-rpc", probes);
const verifiedAt = text(probes.at(-1)?.at, "capture time");
const envelope = {
  schemaVersion: 1,
  knowledgeVersion: "0.4",
  kind: "historical-contract-evidence-catalog",
  id: "historical-contract-evidence",
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt,
  reviewAfter: null,
  scope: { networkIds: ["ethereum-mainnet", "mezo-mainnet"] },
  limitations: [
    "Private historical evidence only; qualified release review is pending. No route, writer or current-generation support is implied.",
    "Coverage consists only of pinned observed blocks. One-block intervals are observation coverage, never claimed deployment activation heights.",
    "Historical block hashes and exact source/build artifacts govern validity; widening coverage requires new indexed evidence and review.",
  ],
};
function coordinate(blockId: number, codeId: number, ids: number[]) {
  const block = object(result(blockId), "block");
  return {
    fromBlock: parseRpcQuantity(block.number).toString(),
    untilExclusiveBlock: (parseRpcQuantity(block.number) + 1n).toString(),
    blockHash: parseHash32(block.hash),
    blockProbeId: blockId,
    codeProbeId: codeId,
    probeIds: ids,
  };
}
const records = [
  {
    id: "native-ethereum-7e994d7f",
    contractId: deployment.contractId,
    networkId: deployment.networkId,
    address: parseAddress(deployment.address),
    provenanceClass: deployment.provenanceClass,
    implementationAddress: parseAddress(ethSource.implementation),
    implementationSlot: proxy.implementationSlot,
    generationRange: history,
    executionVersion: null,
    source: ethSourceArtifact,
    build: ethBuild,
    observations: raw,
    chainProbeId: 1,
    coverage: [coordinate(3, 2, [4]), coordinate(6, 5, [7])],
  },
  {
    id: "native-mezo-v5",
    contractId: "bridge.native-assets-precompile",
    networkId: "mezo-mainnet",
    address: parseAddress(values(object(probe(15).request, "request").params, "params")[0]),
    provenanceClass: "official-client-precompile-source",
    implementationAddress: null,
    implementationSlot: null,
    generationRange: null,
    executionVersion: 5,
    source: mezoSource,
    build: mezoBuild,
    observations: raw,
    chainProbeId: 13,
    coverage: [
      coordinate(14, 15, [16, 18]),
      coordinate(21, 22, [23, 25]),
      coordinate(28, 29, [30, 32]),
    ],
  },
];
for (const id of [2, 5]) assert.equal(result(id), ethCode);
for (const id of [15, 22, 29]) assert.equal(result(id), mezoCode);
const catalogPath = "records/historical-contract-evidence.json";
await writeFile(
  resolve(root, "knowledge/contracts", catalogPath),
  JSON.stringify({ ...envelope, records }, null, 2) + "\n",
);
indexResource(envelope.id, catalogPath, "canonical-record", envelope.kind);
const catalogResource = resources.find((r) => r.id === envelope.id);
assert(catalogResource);
catalogResource.recordIds = records.map((r) => r.id);
catalogResource.recordCollectionPointer = "/records";
index.resources = resources;
const checks = objects(index.checks, "checks");
if (!checks.some((r) => r.id === "historical-contract-evidence"))
  checks.push({
    id: "historical-contract-evidence",
    type: "semantic",
    command: "node scripts/generate-contracts-package.ts --check",
  });
index.checks = checks;
await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
process.stdout.write(
  "Retained two historical Native generations; qualified review remains pending.\n",
);
