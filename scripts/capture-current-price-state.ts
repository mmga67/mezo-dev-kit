import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, text } from "./lib/json.ts";
import { parseEvidenceArguments } from "./lib/evidence-scope.ts";
import {
  abiWords,
  assessFeed,
  assertSameSnapshot,
  signedWord,
  snapshotBlock,
  verifyCode,
} from "./lib/current-price-state.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { network, paths } = parseEvidenceArguments(process.argv.slice(2), 1);
if (!network || !paths[0])
  throw new Error(
    "usage: node scripts/capture-current-price-state.ts --network mezo-mainnet|mezo-testnet OUTPUT.json",
  );
const inputHash = createHash("sha256");
async function resource(moduleId: string, resourceId: string): Promise<Record<string, unknown>> {
  const value = await loadKnowledgeReference(root, { moduleId, resourceId });
  inputHash.update(await readFile(value.path));
  return object(value.document, resourceId);
}
const networkRecord = await resource("networks", network),
  endpoints = await resource("networks", "rpc-endpoints"),
  deployments = await resource("contracts", "contract-deployments"),
  feeds = await resource("prices", "price-sources-feeds");
const endpoint = objects(endpoints.records, "endpoints").find(
  (x) => x.networkId === network && x.transport === "https" && x.supportStatus === "supported",
);
if (!endpoint) throw new Error("No supported HTTPS endpoint");
const rpcUrl = text(endpoint.url, "RPC URL"),
  chainId = object(networkRecord.values, "network values").evmChainId;
let id = 0;
const requests: unknown[] = [];
async function request(
  method: string,
  params: unknown[],
): Promise<{ ok: true; result: unknown } | { ok: false; error: unknown }> {
  const requestId = ++id;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const value = object(await response.json(), "RPC envelope");
  if (value.id !== requestId || value.jsonrpc !== "2.0") throw new Error("RPC envelope mismatch");
  const result =
    value.error !== undefined
      ? { ok: false as const, error: value.error }
      : { ok: true as const, result: value.result };
  requests.push({ method, params, ...result });
  return result;
}
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const result = await request(method, params);
  if (!result.ok) throw new Error(`${method} failed: ${JSON.stringify(result.error)}`);
  return result.result;
}
if (BigInt(text(await rpc("eth_chainId", []), "chainId")) !== BigInt(String(chainId)))
  throw new Error("Wrong chain");
const block = snapshotBlock(await rpc("eth_getBlockByNumber", ["latest", false])),
  tag = `0x${BigInt(block.number).toString(16)}`;
const contracts: Record<string, unknown> = {},
  addresses: Record<string, string> = {};
for (const contractId of ["oracle.skip-btc-usd", "oracle.pyth-price-feed"]) {
  const deployment = objects(deployments.records, "deployments").find(
    (x) => x.networkId === network && x.contractId === contractId,
  );
  if (deployment?.reviewStatus !== "accepted" || deployment.supportStatus !== "supported")
    throw new Error("Unaccepted root");
  const address = text(deployment.address, "address"),
    runtime = object(deployment.runtime, "runtime");
  addresses[contractId] = address;
  const codeSha256 = verifyCode(
    await rpc("eth_getCode", [address, tag]),
    runtime.addressCodeSha256,
  );
  let implementation: unknown = null;
  if (deployment.proxy !== null) {
    const proxy = object(deployment.proxy, "proxy"),
      slot = text(proxy.implementationSlot, "slot");
    const raw = text(await rpc("eth_getStorageAt", [address, slot, tag]), "implementation slot");
    if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(raw)) throw new Error("Malformed implementation slot");
    const target = `0x${raw.slice(-40)}`.toLowerCase();
    if (target !== proxy.currentImplementationAddress)
      throw new Error("Implementation changed; review required");
    implementation = {
      address: target,
      slot,
      slotValue: raw,
      codeSha256: verifyCode(
        await rpc("eth_getCode", [target, tag]),
        runtime.implementationCodeSha256,
      ),
    };
  }
  contracts[contractId] = { address, codeSha256, implementation };
}
const maxAgeSeconds = 3600n,
  observations: unknown[] = [];
const skip = addresses["oracle.skip-btc-usd"],
  pyth = addresses["oracle.pyth-price-feed"];
if (!skip || !pyth) throw new Error("Missing captured roots");
const decimals = abiWords(await rpc("eth_call", [{ to: skip, data: "0x313ce567" }, tag]), 1)[0];
if (
  decimals !==
  BigInt(
    String(objects(feeds.feeds, "feeds").find((x) => x.id === "feed.skip-btc-usd")?.sourceDecimals),
  )
)
  throw new Error("Skip decimals changed");
const roundAttempt = await request("eth_call", [{ to: skip, data: "0xfeaf968c" }, tag]);
if (roundAttempt.ok) {
  const words = abiWords(roundAttempt.result, 5),
    answer = words[1],
    publishedAt = words[3];
  if (answer === undefined || publishedAt === undefined) throw new Error("Missing round words");
  const price = signedWord(answer, 256);
  observations.push({
    feedId: "feed.skip-btc-usd",
    raw: roundAttempt.result,
    price: price.toString(),
    publishedAt: publishedAt.toString(),
    decimals: Number(decimals),
    ...assessFeed(price, publishedAt, BigInt(block.timestamp), maxAgeSeconds),
  });
} else
  observations.push({ feedId: "feed.skip-btc-usd", status: "unavailable", attempt: roundAttempt });
for (const feed of objects(feeds.feeds, "feeds").filter(
  (x) => x.sourceId === "source.pyth-core-v1",
)) {
  const providerId = text(feed.providerFeedId, "provider feed ID");
  if (!/^0x[0-9a-f]{64}$/.test(providerId)) throw new Error("Invalid feed ID");
  const call = (age: bigint) =>
    request("eth_call", [
      { to: pyth, data: `0xa4ae35e0${providerId.slice(2)}${age.toString(16).padStart(64, "0")}` },
      tag,
    ]);
  const bounded = await call(maxAgeSeconds),
    diagnostic = await call(1_000_000_000n);
  let observation: Record<string, unknown> = {
    feedId: feed.id,
    providerFeedId: providerId,
    status: "unavailable",
    bounded,
    diagnostic,
  };
  if (diagnostic.ok) {
    const words = abiWords(diagnostic.result, 4),
      [priceRaw, conf, expoRaw, publishedAt] = words;
    if (
      priceRaw === undefined ||
      conf === undefined ||
      expoRaw === undefined ||
      publishedAt === undefined ||
      conf >= 1n << 64n
    )
      throw new Error("Malformed Pyth datum");
    const price = signedWord(priceRaw, 64),
      expo = signedWord(expoRaw, 32);
    const assessment = assessFeed(price, publishedAt, BigInt(block.timestamp), maxAgeSeconds);
    if (bounded.ok && (assessment.status !== "usable" || bounded.result !== diagnostic.result))
      throw new Error("Pyth bounded/diagnostic disagreement");
    observation = {
      ...observation,
      ...assessment,
      price: price.toString(),
      conf: conf.toString(),
      expo: expo.toString(),
      publishedAt: publishedAt.toString(),
    };
    if (assessment.status === "usable" && !bounded.ok) observation.status = "unavailable";
  }
  observations.push(observation);
}
assertSameSnapshot(block, snapshotBlock(await rpc("eth_getBlockByNumber", [tag, false])));
if (BigInt(text(await rpc("eth_chainId", []), "chainId")) !== BigInt(String(chainId)))
  throw new Error("Chain changed");
const capturedAt = new Date().toISOString();
if (Math.abs(Date.now() - Number(BigInt(block.timestamp)) * 1000) > 300_000)
  throw new Error("Endpoint head is not recent");
const output = {
  schemaVersion: 1,
  kind: "current-price-state-capture",
  scope: {
    networkId: network,
    coverage: "current-state-only",
    historicalStorage: "not-rechecked",
    block,
    maxAgeSeconds: maxAgeSeconds.toString(),
  },
  capturedAt,
  rpcUrl,
  inputDigest: inputHash.digest("hex"),
  contracts,
  observations,
  requests,
  limitations: [
    "Current runtime/implementation hashes match existing accepted Contracts identities; proxy activation history and old storage were not recaptured.",
    "Usability is specific to this block and the explicit 3600-second policy, not a persistent supported-feed allowlist.",
    "No source reproduction, updater transaction, alternative-feed discovery, SDK network promotion, or historical refresh is claimed.",
  ],
};
const outputPath = resolve(paths[0]);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
process.stdout.write(`Captured ${network} current state at ${block.number} ${block.hash}\n`);
for (const observation of observations) {
  const o = object(observation, "observation");
  process.stdout.write(
    `${String(o.feedId)}: ${String(o.status)} (age ${String(o.ageSeconds)} seconds)\n`,
  );
}
