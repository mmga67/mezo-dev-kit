import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeModule, loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, text, type JsonObject } from "./lib/json.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = createHash("sha256");
for (const id of [
  "protocols/vaults/usdc-lending",
  "protocols/lending/musdc",
  "contracts",
  "networks",
  "protocols/incentives",
  "workflows/bridges",
]) {
  const module = await loadKnowledgeModule(root, id);
  if (module.index.status !== "verified" || module.index.reviewStatus !== "accepted")
    throw new Error(`unaccepted module ${id}`);
  digest.update(await readFile(module.indexPath));
}
async function resource(moduleId: string, resourceId: string): Promise<JsonObject> {
  const loaded = await loadKnowledgeReference(root, { moduleId, resourceId });
  digest.update(await readFile(loaded.path));
  return object(loaded.document, resourceId);
}
const architecture = await resource(
  "protocols/vaults/usdc-lending",
  "usdc-lending-vault-architecture",
);
const accounting = await resource("protocols/vaults/usdc-lending", "usdc-lending-vault-accounting");
const reproduction = await resource(
  "protocols/vaults/usdc-lending",
  "usdc-lending-vault-source-reproduction",
);
const market = await resource("protocols/lending/musdc", "musdc-lending-fixed-block-state");
const deployments = await resource("contracts", "contract-deployments");
const abis = await resource("contracts", "contract-abis");
const catalog = await resource("contracts", "vault-dynamic-read-interfaces");
for (const record of [architecture, accounting, reproduction, market])
  if (
    record.status !== "verified" ||
    record.reviewStatus !== "accepted" ||
    record.supportStatus !== "proposed"
  )
    throw new Error("vault evidence lifecycle drift");
if (
  catalog.status !== "verified" ||
  catalog.supportStatus !== "proposed" ||
  !["pending-qualified-review", "accepted"].includes(text(catalog.reviewStatus, "reviewStatus"))
)
  throw new Error("unsupported interface review");
const profiles: Record<string, unknown> = {};
for (const entry of objects(catalog.records, "profiles")) {
  const source = await loadKnowledgeReference(root, entry.sourceReference);
  const bytes = await readFile(source.path);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sourceSha256)
    throw new Error("vault source digest drift");
  digest.update(bytes);
  const snapshot = object(source.document, "snapshot");
  const code = text(snapshot.deployed_bytecode, "runtime");
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("malformed runtime");
  const runtime = Buffer.from(code.slice(2), "hex");
  const evidence = objects(reproduction.records, "reproduction").find(
    (item) => item.id === entry.id,
  );
  if (!evidence || runtime.length < 2) throw new Error("unknown profile");
  const metadataLength = runtime.readUInt16BE(runtime.length - 2);
  if (
    metadataLength + 2 >= runtime.length ||
    createHash("sha256")
      .update(runtime.subarray(0, runtime.length - metadataLength - 2))
      .digest("hex") !== evidence.runtimeExecutableSha256 ||
    createHash("sha256").update(runtime).digest("hex") !== entry.runtimeSha256
  )
    throw new Error("vault runtime digest drift");
  const fullAbi = objects(snapshot.abi, "ABI");
  if (fullAbi.length !== entry.abiEntryCount) throw new Error("ABI count drift");
  if (entry.id === "morpho-market-adapter" || entry.id === "receipt-wrapper") {
    const contractId =
      entry.id === "receipt-wrapper"
        ? "vaults.usdc-lending-wrapper"
        : "vaults.usdc-lending-market-adapter";
    const deployment = objects(deployments.records, "deployments").find(
      (item) => item.contractId === contractId && item.networkId === "mezo-mainnet",
    );
    if (deployment?.reviewStatus !== "accepted" || deployment.supportStatus !== "supported")
      throw new Error("unsupported vault root");
    const expected = object(deployment.runtime, "runtime");
    if (
      entry.runtimeSha256 !==
      (entry.id === "receipt-wrapper"
        ? expected.implementationCodeSha256
        : expected.addressCodeSha256)
    )
      throw new Error("vault root runtime drift");
    const abiRecord = objects(abis.records, "abis").find((item) => item.id === contractId);
    if (!abiRecord) throw new Error("missing root ABI");
    // The Contracts semantic validator owns its source/ABI integrity. Keep source interfaces identical.
    const artifact = await loadKnowledgeReference(root, abiRecord.artifactReference);
    digest.update(await readFile(artifact.path));
    const canonical = artifact.document;
    if (JSON.stringify(canonical) !== JSON.stringify(fullAbi)) throw new Error("root ABI drift");
  }
  profiles[text(entry.id, "role")] = {
    runtimeSha256: entry.runtimeSha256,
    readAbi: fullAbi.filter(
      (item) =>
        item.type === "function" &&
        (item.stateMutability === "view" || item.stateMutability === "pure"),
    ),
  };
}
if (Object.keys(profiles).length !== 4) throw new Error("profile set drift");
const wrapper = object(accounting.wrapper, "wrapper");
const oracle = object(market.oracle, "oracle");
const wrapperDeployment = objects(deployments.records, "deployments").find(
  (entry) =>
    entry.contractId === "vaults.usdc-lending-wrapper" && entry.networkId === "mezo-mainnet",
);
if (!wrapperDeployment) throw new Error("missing wrapper");
const model = {
  implementationSlot: object(wrapperDeployment.proxy, "wrapper proxy").implementationSlot,
  networkId: "mezo-mainnet",
  marketId: object(market.market, "market").id,
  loanToken: text(object(market.market, "market").loanToken, "asset").toLowerCase(),
  collateralToken: text(
    object(market.market, "market").collateralToken,
    "collateral",
  ).toLowerCase(),
  lltv: object(market.market, "market").lltv,
  assetDecimals: oracle.loanDecimals,
  wrapperVirtualShares: wrapper.virtualShares,
  wrapperVirtualAssets: wrapper.virtualAssets,
  profiles,
  verifiedAt: architecture.verifiedAt,
  reviewAfter: architecture.reviewAfter,
  inputDigest: digest.digest("hex"),
};
const output = `// Generated from canonical Vault/Contracts interfaces. Do not edit.\nexport const VAULT_MODEL = ${JSON.stringify(model, null, 2)} as const;\n`;
const path = resolve(root, "packages/protocols/usdc-lending-vault/src/model.generated.ts");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check"))
  throw new Error("usage: generate-vault-package.ts [--check]");
if (args.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output) throw new Error("Vault generated inputs drifted");
} else await writeFile(path, output);
process.stdout.write("Vault generated inputs current.\n");
