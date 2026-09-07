import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeModule, loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, text, type JsonObject } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = createHash("sha256");
for (const id of [
  "protocols/lending/musdc",
  "contracts",
  "networks",
  "prices",
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
const model = await resource("protocols/lending/musdc", "musdc-lending-market");
const formulas = await resource("protocols/lending/musdc", "musdc-lending-formulas");
const evidence = await resource("protocols/lending/musdc", "musdc-lending-fixed-block-state");
for (const record of [model, formulas, evidence])
  if (
    record.reviewStatus !== "accepted" ||
    record.status !== "verified" ||
    record.supportStatus !== "proposed"
  )
    throw new Error("lending model lifecycle drift");
const deployments = await resource("contracts", "contract-deployments");
const market = object(evidence.market, "market");
const bridge = await loadKnowledgeReference(root, model.loanAssetReference);
digest.update(await readFile(bridge.path));
if (object(bridge.value, "bridge asset").id !== "usdc-native-bridge")
  throw new Error("wrong bridge representation");
const bridgeAsset = object(bridge.value, "bridge asset");
const representation = objects(bridgeAsset.representations, "representations").find(
  (entry) => entry.network === "mezo-mainnet",
);
if (!representation || representation.decimals !== object(evidence.oracle, "oracle").loanDecimals)
  throw new Error("bridge representation decimals drift");
const bridgeModule = await loadKnowledgeModule(root, "workflows/bridges");
let loanMatches = 0;
for (const entry of bridgeModule.index.resources.filter((entry) => entry.role === "evidence")) {
  const value = await resource("workflows/bridges", entry.id);
  if (!Array.isArray(value.deploymentObservations)) continue;
  if (
    !objects(value.deploymentObservations, "observations").some(
      (observation) =>
        observation.id === representation.evidenceObservation &&
        observation.network === "mezo-mainnet",
    )
  )
    continue;
  if (value.status !== "verified" || value.reviewStatus !== "accepted")
    throw new Error("unaccepted bridge evidence");
  const configuration = objects(value.volatileConfiguration, "configuration").find(
    (item) => item.representation === representation.id,
  );
  if (
    configuration &&
    configuration.decimals === representation.decimals &&
    text(configuration.token, "token").toLowerCase() ===
      text(market.loanToken, "loan token").toLowerCase() &&
    objects(value.erc20Mappings, "mappings").some(
      (mapping) => mapping.mezoToken === configuration.token,
    )
  )
    loanMatches++;
}
if (loanMatches !== 1) throw new Error("loan token lacks unique linked bridge evidence");
const oracle = object(evidence.oracle, "oracle");
const roots: Record<string, unknown> = {};
for (const id of [
  "lending.morpho",
  "lending.adaptive-curve-irm",
  "lending.musdc-btc-oracle",
  "oracle.skip-btc-usd",
]) {
  const deployment = objects(deployments.records, "deployments").find(
    (entry) => entry.contractId === id && entry.networkId === "mezo-mainnet",
  );
  if (deployment?.reviewStatus !== "accepted" || deployment.supportStatus !== "supported")
    throw new Error(`unsupported root ${id}`);
  const runtime = object(deployment.runtime, "runtime");
  roots[id] = {
    runtimeSha256: runtime.addressCodeSha256,
    implementationSha256: runtime.implementationCodeSha256,
    implementationSlot:
      deployment.proxy === null ? null : object(deployment.proxy, "proxy").implementationSlot,
  };
}
const runtimeCapture = await resource("contracts", "lending-mainnet-runtime-bytes");
const scope = object(evidence.scope, "scope");
if (
  runtimeCapture.networkId !== scope.networkId ||
  runtimeCapture.blockNumber !== scope.blockNumber ||
  runtimeCapture.blockHash !== scope.blockHash
)
  throw new Error("runtime fixture coordinate drift");
const runtimeRecords = objects(runtimeCapture.records, "runtime records");
if (runtimeRecords.length !== 5) throw new Error("runtime fixture set drift");
const seenRuntimeAddresses = new Set<string>();
for (const record of runtimeRecords) {
  const runtimeAddress = text(record.address, "runtime address");
  if (seenRuntimeAddresses.has(runtimeAddress)) throw new Error("duplicate runtime fixture");
  seenRuntimeAddresses.add(runtimeAddress);
  const deployment = objects(deployments.records, "deployments").find(
    (entry) => entry.contractId === record.contractId && entry.networkId === "mezo-mainnet",
  );
  if (!deployment || !Object.hasOwn(roots, text(record.contractId, "runtime contract")))
    throw new Error("unknown runtime fixture");
  const runtime = object(deployment.runtime, "runtime");
  const expected =
    record.address === deployment.address
      ? runtime.addressCodeSha256
      : deployment.proxy !== null &&
          record.address === object(deployment.proxy, "proxy").currentImplementationAddress
        ? runtime.implementationCodeSha256
        : null;
  const code = text(record.code, "runtime code");
  if (
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) ||
    expected === null ||
    createHash("sha256")
      .update(Buffer.from(code.slice(2), "hex"))
      .digest("hex") !== expected ||
    record.sha256 !== expected
  )
    throw new Error("runtime fixture digest drift");
}
const output = `// Generated from canonical lending/Contracts/Bridges evidence. Do not edit.\nexport const LENDING_MODEL = ${JSON.stringify(
  {
    networkId: "mezo-mainnet",
    marketId: object(model.scope, "scope").marketId,
    loanToken: text(market.loanToken, "loan token").toLowerCase(),
    collateralToken: text(market.collateralToken, "collateral").toLowerCase(),
    lltv: market.lltv,
    oracle: {
      loanDecimals: oracle.loanDecimals,
      collateralDecimals: oracle.collateralDecimals,
      scaleFactor: oracle.scaleFactor,
    },
    constants: formulas.constants,
    roots,
    verifiedAt: model.verifiedAt,
    reviewAfter: model.reviewAfter,
    inputDigest: digest.digest("hex"),
  },
  null,
  2,
)} as const;\n`;
const path = resolve(root, "packages/protocols/musdc-lending/src/model.generated.ts");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check"))
  throw new Error("usage: generate-lending-package.ts [--check]");
if (args.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output)
    throw new Error("Lending generated inputs drifted");
} else await writeFile(path, output);
process.stdout.write("Lending generated inputs current.\n");
