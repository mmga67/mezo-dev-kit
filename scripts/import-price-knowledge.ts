import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, parseJson, text, type JsonObject } from "./lib/json.ts";

const [capturePath] = process.argv.slice(2);
if (!capturePath) throw new Error("usage: node scripts/import-price-knowledge.ts <capture-json>");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "prices");
const capture = object(parseJson(await readFile(capturePath, "utf8"), capturePath), capturePath);
const verifiedAt = text(capture.capturedAt, "capture timestamp");
const reviewAfter = "2026-08-26T16:00:00.000Z";
await Promise.all([
  mkdir(join(moduleDirectory, "evidence"), { recursive: true }),
  mkdir(join(moduleDirectory, "sources"), { recursive: true }),
]);

const observations: JsonObject[] = [];
const capturedObservations = object(capture.observations, "capture observations");
const expected = object(capture.expected, "capture expectations");
const staleSelector = text(expected.staleSelector, "stale selector");
for (const networkId of ["mezo-mainnet", "mezo-testnet"]) {
  const network = object(capturedObservations[networkId], `${networkId} observation`);
  const contracts = object(network.contracts, `${networkId} contracts`);
  const skip = object(contracts.skipBtcUsd, `${networkId} Skip oracle`);
  const latestRoundData = object(skip.latestRoundData, `${networkId} latest round data`);
  const musdPriceFeed = object(contracts.musdPriceFeed, `${networkId} MUSD price feed`);
  observations.push({
    id: `observe-skip-${networkId}`,
    networkId,
    observedAt: verifiedAt,
    block: network.block,
    sourceId: "source.skip-price-oracle-v1",
    feedId: "feed.skip-btc-usd",
    sourceClass: "pushed-feed-observation",
    contractReference: {
      moduleId: "contracts",
      resourceId: "contract-deployments",
      recordId: `oracle.skip-btc-usd@${networkId}`,
    },
    rawDatum: {
      price: latestRoundData.answer,
      expo: -18,
      decimals: skip.decimals,
      roundId: latestRoundData.roundId,
      startedAt: latestRoundData.startedAt,
      updatedAt: latestRoundData.updatedAt,
      answeredInRound: latestRoundData.answeredInRound,
      confidence: null,
    },
    protocolAdapterObservation: {
      sourceClass: "protocol-oracle-state",
      componentReference: {
        moduleId: "protocols/musd",
        resourceId: "musd-components",
        recordId: "musd.price-feed",
      },
      configuredOracle: musdPriceFeed.oracle,
      fetchPrice: musdPriceFeed.fetchPrice,
      targetDigits: musdPriceFeed.targetDigits,
      equalsDirectSourceAtBlock: musdPriceFeed.fetchPrice === latestRoundData.answer,
    },
    interfaceObservation: {
      decimals: "succeeded",
      latestRoundData: "succeeded",
      description: skip.description,
    },
    result: "valid-bounded-observation",
    limitations: [
      "This is a fixed-block observation, not a current-value constant or an availability guarantee.",
      "The MUSD adapter equality is established only at this block and retains protocol-oracle-state as a distinct source class.",
    ],
  });
  const pyth = object(contracts.pyth, `${networkId} Pyth oracle`);
  observations.push({
    id: `observe-pyth-${networkId}`,
    networkId,
    observedAt: verifiedAt,
    block: network.block,
    sourceId: "source.pyth-core-v1",
    sourceClass: "pushed-feed-observation",
    contractReference: {
      moduleId: "contracts",
      resourceId: "contract-deployments",
      recordId: `oracle.pyth-price-feed@${networkId}`,
    },
    proxy: {
      address: pyth.address,
      codeSha256: pyth.codeSha256,
      implementationSlot: pyth.implementationSlot,
      implementation: pyth.implementation,
      implementationCodeSha256: pyth.implementationCodeSha256,
    },
    feeds: Object.entries(object(pyth.feeds, `${networkId} Pyth feeds`)).map(
      ([pair, feedValue]) => {
        const feed = object(feedValue, `${networkId} Pyth feed ${pair}`);
        return {
          pair,
          feedId: feed.feedId,
          maxAgeSeconds: feed.maxAgeSeconds,
          freshnessResult: normalizePythFreshness(feed.freshResult, staleSelector),
          diagnosticResult: feed.diagnosticResult,
          diagnosticClassification: "stale-diagnostic-not-current-price",
        };
      },
    ),
    result: "stale-at-3600-seconds",
    limitations: [
      "Both one-hour reads reverted StalePrice() at this block; the retained payloads came only from an oversized diagnostic max age.",
      "Diagnostic payloads must not be displayed or normalized as current, selected as fallback, or used to assert live Pyth feed support.",
      "The current proxy and implementation require re-observation after the announced 2026-08-26 16:00 UTC upgrade.",
    ],
  });
}

const evidence = {
  schemaVersion: 1,
  kind: "price-fixed-block-observation-set",
  id: "price-fixed-block-observations-2026-08-23",
  owner: "prices",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt,
  reviewAfter,
  scope: {
    networkIds: ["mezo-mainnet", "mezo-testnet"],
    feedIds: ["feed.skip-btc-usd", "feed.pyth-btc-usd", "feed.pyth-musd-usd"],
  },
  limitations: [
    "Observations are immutable block-scoped evidence and never mutable current-price constants.",
    "Pyth results were stale under the explicit one-hour rule on both networks; identity and bytecode presence do not establish feed liveness.",
    "The evidence creates no public reader, updater, hosted-provider, route, credential, or writer support.",
  ],
  methodology: [
    "Resolve current RPC endpoints through the Networks module and verify chain IDs.",
    "Pin one exact block per network before reading code, storage, and oracle results.",
    "Read the MUSD configured oracle and normalized adapter result at each pinned block.",
    "Read Skip decimals and latestRoundData while preserving the unsupported description call.",
    "Read the Pyth proxy implementation slot and code identities.",
    "Call getPriceNoOlderThan with an explicit one-hour bound and retain StalePrice failures.",
    "Use an oversized max age only to verify raw Pyth tuple decoding, marking every payload stale diagnostic.",
  ],
  networkSnapshots: Object.values(capturedObservations).map((networkValue) => {
    const network = object(networkValue, "network snapshot");
    const block = object(network.block, "network snapshot block");
    return {
      networkId: network.networkId,
      evmChainId: network.chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
      rpcUrl: network.rpcUrl,
      explorerApiUrl: network.explorerApiUrl,
    };
  }),
  observations,
};
const evidencePath = join(moduleDirectory, "evidence", "fixed-block-observations-2026-08-23.json");
await writeJson(evidencePath, evidence);
const evidenceDigest = sha256(await readFile(evidencePath));
const adrPath = join(repositoryRoot, "docs", "decisions", "0009-oracle-price-source-ownership.md");

const sourceCatalog = {
  schemaVersion: 1,
  kind: "price-source-catalog",
  id: "price-sources",
  owner: "prices",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "pending-qualified-review",
  verifiedAt,
  reviewAfter,
  scope: {
    sourceIds: [
      "official-docs-mezo-oracles",
      "official-client-mezod-price-oracle",
      "price-fixed-block-capture",
      "contract-oracle-roots",
      "network-capabilities",
      "musd-price-consumption",
      "pool-price-mechanics",
      "transaction-boundary",
      "pyth-evm-api",
      "adr-0009-price-ownership",
    ],
  },
  limitations: [
    "Source entries establish bounded provenance only for exact commits, paths, URLs, observations, and logical references.",
    "External pages and deployed state may change; the scheduled Pyth boundary requires a fresh capture and review.",
  ],
  records: [
    {
      id: "official-docs-mezo-oracles",
      kind: "official-documentation-source",
      repository: object(capture.officialDocumentation, "official documentation").repository,
      commit: object(capture.officialDocumentation, "official documentation").commit,
      artifacts: object(capture.officialDocumentation, "official documentation").artifacts,
      establishes: "Documented Skip/Pyth roots, feed IDs, read surfaces, and datum fields.",
    },
    {
      id: "official-client-mezod-price-oracle",
      kind: "official-client-source",
      repository: object(capture.officialClient, "official client").repository,
      commit: object(capture.officialClient, "official client").commit,
      tag: object(capture.officialClient, "official client").tag,
      artifacts: object(capture.officialClient, "official client").artifacts,
      establishes:
        "PriceOracle precompile address, version, ABI, wrapper bytecode, execution methods, and activation source.",
    },
    {
      id: "price-fixed-block-capture",
      kind: "on-chain-observation",
      reference: { moduleId: "prices", resourceId: "price-fixed-block-observations-2026-08-23" },
      sha256: evidenceDigest,
      retrievedAt: verifiedAt,
      establishes: "Pinned source, adapter, freshness, code, and proxy observations.",
    },
    {
      id: "contract-oracle-roots",
      kind: "logical-knowledge-reference",
      reference: { moduleId: "contracts", resourceId: "contract-oracle-probes-2026-08-23" },
      establishes: "Oracle deployment, ABI, source provenance, activation, and runtime identities.",
    },
    {
      id: "network-capabilities",
      kind: "logical-knowledge-reference",
      reference: { moduleId: "networks", resourceId: "rpc-endpoints" },
      establishes: "Network and RPC capability evidence used for fixed-block reads.",
    },
    {
      id: "musd-price-consumption",
      kind: "logical-knowledge-reference",
      reference: {
        moduleId: "protocols/musd",
        resourceId: "musd-components",
        recordId: "musd.price-feed",
      },
      establishes:
        "MUSD protocol ownership of configured-oracle consumption, freshness, and normalization.",
    },
    {
      id: "pool-price-mechanics",
      kind: "logical-knowledge-reference",
      reference: { moduleId: "protocols/pools", resourceId: "pools-math" },
      establishes: "Pool ownership of reserve, tick, Q64.96, spot, and TWAP mechanics.",
    },
    {
      id: "transaction-boundary",
      kind: "logical-knowledge-reference",
      reference: {
        moduleId: "workflows/transactions",
        resourceId: "transaction-client-requirements",
      },
      establishes: "Separate lifecycle gates required before any future updater or writer.",
    },
    {
      id: "pyth-evm-api",
      kind: "official-provider-documentation",
      urls: [
        "https://api-reference.pyth.network/price-feeds/evm/getPriceNoOlderThan",
        "https://docs.pyth.network/price-feeds/core/contract-addresses/evm",
      ],
      retrievedAt: verifiedAt,
      establishes:
        "Freshness-gated read semantics and the announced 2026-08-26 16:00 UTC upgrade boundary.",
    },
    {
      id: "adr-0009-price-ownership",
      kind: "accepted-architecture-decision",
      path: "../../docs/decisions/0009-oracle-price-source-ownership.md",
      sha256: sha256(await readFile(adrPath)),
      establishes:
        "Accepted Prices ownership, taxonomy, dependency, datum, freshness, and no-substitution boundaries.",
    },
  ],
};
await writeJson(join(moduleDirectory, "sources", "catalog.json"), sourceCatalog);
process.stdout.write(
  `Imported ${observations.length} bounded price observations and ${sourceCatalog.records.length} sources.\n`,
);

function normalizePythFreshness(result: unknown, staleSelector: string): JsonObject {
  const resultObject = object(result, "Pyth freshness result");
  const error =
    resultObject.error === null || resultObject.error === undefined
      ? undefined
      : object(resultObject.error, "Pyth freshness error");
  if (
    resultObject.ok === false &&
    typeof error?.data === "string" &&
    error.data.toLowerCase() === staleSelector
  ) {
    return { status: "stale", errorSelector: staleSelector, errorName: "StalePrice()" };
  }
  return resultObject.ok
    ? { status: "valid", raw: resultObject.raw }
    : { status: "failed", error: resultObject.error ?? null };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
