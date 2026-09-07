import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type abisShape from "../knowledge/contracts/records/abis.json";
import type deploymentsShape from "../knowledge/contracts/records/deployments.json";
import type historicalEvidenceShape from "../knowledge/prices/evidence/fixed-block-observations-2026-08-23.json";
import type evidenceShape from "../knowledge/prices/evidence/fixed-block-observations-2026-08-27.json";
import type fixturesShape from "../knowledge/prices/fixtures/prices.json";
import type indexShape from "../knowledge/prices/index.json";
import type datumRulesShape from "../knowledge/prices/records/datum-rules.json";
import type freshnessFallbackShape from "../knowledge/prices/records/freshness-fallback.json";
import type sourcesFeedsShape from "../knowledge/prices/records/sources-feeds.json";
import type taxonomyShape from "../knowledge/prices/records/taxonomy.json";
import type sourcesShape from "../knowledge/prices/sources/catalog.json";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, parseJson, text, texts, type JsonObject } from "./lib/json.ts";

import { parseEvidenceArguments, type EvidenceNetwork } from "./lib/evidence-scope.ts";
const { network: selectedNetwork } = parseEvidenceArguments(process.argv.slice(2));
const networkIds: EvidenceNetwork[] = selectedNetwork
  ? [selectedNetwork]
  : ["mezo-mainnet", "mezo-testnet"];

import { assertOracleCaptureEvidence } from "./lib/oracle-capture-evidence.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "prices");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const MAX_UINT256 = (1n << 256n) - 1n;
const expectedClasses = [
  "protocol-oracle-state",
  "pushed-feed-observation",
  "offchain-market-reference",
  "dex-derived-observation",
  "dex-execution-quote",
  "stored-analytics-projection",
];

const index = await json<typeof indexShape>(join(moduleDirectory, "index.json"));
const taxonomy = await json<typeof taxonomyShape>(
  join(moduleDirectory, "records", "taxonomy.json"),
);
const sourcesFeeds = await json<typeof sourcesFeedsShape>(
  join(moduleDirectory, "records", "sources-feeds.json"),
);
const datumRules = await json<typeof datumRulesShape>(
  join(moduleDirectory, "records", "datum-rules.json"),
);
const freshnessFallback = await json<typeof freshnessFallbackShape>(
  join(moduleDirectory, "records", "freshness-fallback.json"),
);
const fixtures = await json<typeof fixturesShape>(join(moduleDirectory, "fixtures", "prices.json"));
const sources = await json<typeof sourcesShape>(join(moduleDirectory, "sources", "catalog.json"));
const evidenceByNetwork = new Map<EvidenceNetwork, typeof evidenceShape>();
for (const networkId of ["mezo-mainnet", "mezo-testnet"] as const) {
  const reference = index.extensions.currentEvidenceByNetwork[networkId];
  expect(reference.moduleId === "prices", `${networkId} current evidence module drifted`);
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  const current = await json<typeof evidenceShape>(resolved.path);
  expect(
    current.id === reference.resourceId && current.scope.networkIds.includes(networkId),
    `${networkId} current evidence scope drifted`,
  );
  evidenceByNetwork.set(networkId, current);
}
const historicalEvidence = await json<typeof historicalEvidenceShape>(
  join(moduleDirectory, "evidence", "fixed-block-observations-2026-08-23.json"),
);
const deployments = await json<typeof deploymentsShape>(
  join(contractsDirectory, "records", "deployments.json"),
);
const abis = await json<typeof abisShape>(join(contractsDirectory, "records", "abis.json"));

expect(index.moduleId === "prices" && index.owner === "prices", "Prices module identity drifted");
expect(index.status === "verified", "Prices module must remain verified");
expect(index.supportStatus === "proposed", "Prices module was promoted prematurely");
expect(
  index.reviewStatus === "accepted",
  "Prices post-upgrade evidence must retain oracle re-verification acceptance",
);
expect(index.extensions.writerSupport === "none", "Prices writer support must remain none");
expect(
  index.extensions.publicReaderSupport === "none",
  "Prices public reader support must remain none",
);
if (selectedNetwork === undefined) {
  expect(
    Date.parse(index.reviewAfter) > Date.now(),
    "Prices review window expired (full module; testnet refresh remains required)",
  );
}
expect(
  sourcesFeeds.reviewStatus === "accepted" && sources.reviewStatus === "accepted",
  "Price catalogs must retain oracle re-verification acceptance",
);

const classes = taxonomy.records.map(({ id }) => id);
expect(
  JSON.stringify(classes) === JSON.stringify(expectedClasses),
  "price source taxonomy drifted",
);
expect(new Set(classes).size === 6, "price source classes repeat");
expect(
  String(taxonomy.selectionBoundary).includes("explicit typed selection"),
  "source-class change boundary is missing",
);

const sourceRecords = sourcesFeeds.sources;
const feedRecords = sourcesFeeds.feeds;
expect(sourceRecords.length === 2 && feedRecords.length === 3, "initial source/feed scope drifted");
const pythSource = sourceRecords.find(({ id }) => id === "source.pyth-core-v1");
expect(
  pythSource?.supportStatus === "proposed" && pythSource.reviewStatus === "accepted",
  "Pyth source review must remain accepted without promoting feed support",
);
expect(
  feedRecords.find(({ id }) => id === "feed.pyth-btc-usd")?.providerFeedId ===
    "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "Pyth BTC/USD feed ID drifted",
);
expect(
  feedRecords.find(({ id }) => id === "feed.pyth-musd-usd")?.providerFeedId ===
    "0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de",
  "Pyth MUSD/USD feed ID drifted",
);
expect(
  JSON.stringify(sourcesFeeds).includes("cannot replace or be labeled as the MUSD protocol price"),
  "MUSD non-substitution rule is missing from feed ownership",
);

for (const source of sources.records) {
  if (source.reference) {
    const resolved = await loadKnowledgeReference(repositoryRoot, source.reference);
    expect(
      resolved.resource.id === source.reference.resourceId,
      `${source.id} logical reference drifted`,
    );
    if (source.sha256) {
      expect(
        sha256(await readFile(resolved.path)) === source.sha256,
        `${source.id} evidence digest drifted`,
      );
    }
  }
  if (source.path) {
    const path = resolve(moduleDirectory, source.path);
    expect(
      sha256(await readFile(path)) === source.sha256,
      `${source.id} local source digest drifted`,
    );
  }
}

const deploymentRecords = deployments.records;
const abiRecords = abis.records;
for (const contractId of ["oracle.skip-btc-usd"]) {
  const contractDeployments = deploymentRecords.filter(
    (record) => record.contractId === contractId,
  );
  const abi = abiRecords.find((record) => record.contractId === contractId);
  expect(
    contractDeployments.length === 2,
    `${contractId} must have mainnet and testnet deployments`,
  );
  expect(abi, `${contractId} ABI is missing`);
  expect(
    abi.supportStatus === "supported" && abi.reviewStatus === "accepted",
    `${contractId} ABI lifecycle drifted`,
  );
  for (const deployment of contractDeployments) {
    expect(
      deployment.supportStatus === "supported" && deployment.reviewStatus === "accepted",
      `${deployment.id} lifecycle drifted`,
    );
  }
}
const pythAbi = abiRecords.find((record) => record.contractId === "oracle.pyth-price-feed");
expect(pythAbi, "Pyth ABI is missing");
expect(
  pythAbi.supportStatus === "supported" && pythAbi.reviewStatus === "accepted",
  "Pyth ABI must retain oracle re-verification registry acceptance",
);
const pythAbiArtifact = objects(
  JSON.parse(
    await readFile(
      join(contractsDirectory, "artifacts", "abis", "oracle", "pyth-price-feed.json"),
      "utf8",
    ),
  ),
  "Pyth ABI artifact",
);
expect(
  pythAbiArtifact.some(({ name }) => name === "parsePriceFeedUpdatesWithConfig") &&
    !pythAbiArtifact.some(({ name }) => name === "parsePriceFeedUpdatesWithSlotsStrict"),
  "Pyth ABI generation boundary drifted",
);
expect(
  deploymentRecords.find(({ id }) => id === "oracle.skip-btc-usd@mezo-mainnet")?.address ===
    "0x7b7c000000000000000000000000000000000015",
  "Skip address drifted",
);
const pythDeployments = deploymentRecords.filter(
  ({ contractId }) => contractId === "oracle.pyth-price-feed",
);
expect(
  pythDeployments.every(({ address }) => address === "0x2880ab155794e7179c9ee2e38200202908c17b43"),
  "Pyth proxy address drifted",
);
expect(pythDeployments.length === 2, "Pyth deployments must cover both Mezo networks");
const expectedPythGenerations: Record<string, { implementation: string; upgradeBlock: number }> = {
  "mezo-mainnet": {
    implementation: "0x6e7d74fa7d5c90fef9f0512987605a6d546181bb",
    upgradeBlock: 11_408_732,
  },
  "mezo-testnet": {
    implementation: "0xfc6bd9f9f0c6481c6af3a7eb46b296a5b85ed379",
    upgradeBlock: 15_131_069,
  },
};
const expectedPythDiagnostics: Record<
  string,
  Record<string, { price: string; conf: string; expo: number; publishTime: string }>
> = {
  "mezo-mainnet": {
    "BTC/USD": {
      price: "6310464500000",
      conf: "1983500000",
      expo: -8,
      publishTime: "1784284881",
    },
    "MUSD/USD": {
      price: "100775755",
      conf: "1029338",
      expo: -8,
      publishTime: "1784284881",
    },
  },
  "mezo-testnet": {
    "BTC/USD": {
      price: "6523803881085",
      conf: "1777881084",
      expo: -8,
      publishTime: "1785145687",
    },
    "MUSD/USD": {
      price: "100270118",
      conf: "1046118",
      expo: -8,
      publishTime: "1785145687",
    },
  },
};
for (const deployment of pythDeployments) {
  const expected = expectedPythGenerations[deployment.networkId];
  expect(expected, `${deployment.id} network is outside the oracle re-verification scope`);
  expect(
    deployment.supportStatus === "supported" && deployment.reviewStatus === "accepted",
    `${deployment.id} must retain oracle re-verification registry acceptance`,
  );
  expect(
    deployment.proxy?.currentImplementationAddress === expected.implementation,
    `${deployment.id} current implementation drifted`,
  );
  expect(
    deployment.proxy?.implementationHistory.length === 2 &&
      deployment.proxy.implementationHistory[0]?.implementationAddress ===
        "0xa2aa501b19aff244d90cc15a4cf739d2725b5729" &&
      deployment.proxy.implementationHistory[0]?.effectiveUntilExclusive?.blockNumber ===
        expected.upgradeBlock &&
      deployment.proxy.implementationHistory[1]?.effectiveFrom.blockNumber ===
        expected.upgradeBlock &&
      deployment.proxy.implementationHistory[1]?.effectiveUntilExclusive === null,
    `${deployment.id} append-only implementation history drifted`,
  );
  expect(
    deployment.runtime.version === "1.4.6",
    `${deployment.id} post-upgrade runtime observation drifted`,
  );
}

expect(
  historicalEvidence.reviewAfter === null &&
    historicalEvidence.reviewStatus === "accepted" &&
    historicalEvidence.supersededBy?.moduleId === "prices" &&
    historicalEvidence.supersededBy.resourceId === "price-fixed-block-observations-2026-08-27",
  "historical price evidence supersession chain drifted",
);
let observationCount = 0;
for (const networkId of networkIds) {
  const evidence = evidenceByNetwork.get(networkId);
  expect(evidence, `${networkId} current evidence is missing`);
  expect(
    evidence.reviewStatus === "accepted" && Date.parse(evidence.reviewAfter) > Date.now(),
    `${networkId} current price evidence review window expired or unaccepted`,
  );
  await assertOracleCaptureEvidence(repositoryRoot, evidence);
  const snapshot = evidence.networkSnapshots.find((entry) => entry.networkId === networkId);
  expect(snapshot, `${networkId} evidence snapshot missing`);
  const evidenceRecords = evidence.observations.filter((entry) => entry.networkId === networkId);
  expect(evidenceRecords.length === 2, `${networkId} fixed-block price observation count drifted`);
  observationCount += evidenceRecords.length;
  const skip = evidenceRecords.find(({ sourceId }) => sourceId === "source.skip-price-oracle-v1");
  const pyth = evidenceRecords.find(({ sourceId }) => sourceId === "source.pyth-core-v1");
  const deployment = pythDeployments.find((entry) => entry.networkId === networkId);
  expect(deployment && skip && pyth, `${networkId} evidence/deployment missing`);
  expect(
    deployment.runtime.blockNumber === snapshot.blockNumber &&
      deployment.runtime.blockHash === snapshot.blockHash &&
      skip.block.number === snapshot.blockNumber &&
      pyth.block.number === snapshot.blockNumber &&
      skip.block.hash === snapshot.blockHash &&
      pyth.block.hash === snapshot.blockHash,
    `${networkId} evidence/deployment block mismatch`,
  );
  expect(
    pyth.proxy?.activationHistoryReference.resourceId === deployment.evidenceReference.resourceId &&
      pyth.proxy.activationHistoryReference.recordId === deployment.evidenceReference.recordId,
    `${networkId} Contracts evidence reference mismatch`,
  );
  const expected = expectedPythGenerations[networkId];
  expect(expected, `${networkId} Pyth generation expectation is missing`);
  expect(
    skip?.rawDatum && skip.protocolAdapterObservation && skip.interfaceObservation,
    `${networkId} Skip observation is incomplete`,
  );
  expect(pyth?.feeds, `${networkId} Pyth observation is incomplete`);
  expect(
    pyth.proxy?.implementation === expected.implementation && pyth.proxy.version === "1.4.6",
    `${networkId} Pyth evidence generation drifted`,
  );
  expect(skip.rawDatum.decimals === 18, `${networkId} Skip decimals drifted`);
  expect(skip.rawDatum.answeredInRound === "0", `${networkId} Skip answeredInRound drifted`);
  expect(
    skip.protocolAdapterObservation.equalsDirectSourceAtBlock === true,
    `${networkId} MUSD/Skip equality drifted`,
  );
  expect(
    skip.interfaceObservation.description.ok === false,
    `${networkId} unsupported description result drifted`,
  );
  expect(
    pyth.result === "stale-at-3600-seconds",
    `${networkId} Pyth freshness classification drifted`,
  );
  expect(pyth.feeds.length === 2, `${networkId} Pyth feed count drifted`);
  expect(
    pyth.feeds.every(
      ({ freshnessResult, diagnosticClassification }) =>
        freshnessResult.status === "stale" &&
        freshnessResult.errorSelector === "0x19abf40e" &&
        diagnosticClassification === "stale-diagnostic-not-current-price",
    ),
    `${networkId} Pyth stale diagnostic boundary drifted`,
  );
  for (const feed of pyth.feeds) {
    const expectedDiagnostic = expectedPythDiagnostics[networkId]?.[feed.pair];
    expect(expectedDiagnostic, `${networkId} ${feed.pair} diagnostic expectation is missing`);
    expect(
      JSON.stringify(feed.diagnosticResult.value) === JSON.stringify(expectedDiagnostic),
      `${networkId} ${feed.pair} raw diagnostic tuple drifted`,
    );
  }
}

expect(datumRules.scaling.maxAbsolutePowerOfTenExponent === 77, "scaling exponent bound drifted");
expect(
  freshnessFallback.freshness.boundaryRule.startsWith("inclusive"),
  "freshness equality boundary drifted",
);
expect(
  String(freshnessFallback.musdNonSubstitution).includes("must not be labeled"),
  "MUSD fallback safety rule drifted",
);

const fixtureRecords = fixtures.records;
expect(fixtureRecords.length === 18, "price fixture coverage drifted");
expect(
  new Set(fixtureRecords.map(({ id }) => id)).size === fixtureRecords.length,
  "price fixture IDs repeat",
);
for (const fixture of fixtureRecords) {
  const actual = evaluateFixture(fixture);
  expect(
    JSON.stringify(actual) === JSON.stringify(fixture.expected),
    `${fixture.id} expected ${JSON.stringify(fixture.expected)} but received ${JSON.stringify(actual)}`,
  );
}

process.stdout.write(
  `Evidence freshness scope: ${selectedNetwork ?? "full module"}; validated ${classes.length} source classes, ${sourceRecords.length} sources, ${feedRecords.length} feeds, ${observationCount} scoped observations, and ${fixtureRecords.length} price fixtures\n`,
);

function evaluateFixture(fixture: JsonObject): JsonObject {
  const fixtureId = text(fixture.id, "fixture ID");
  const input = object(fixture.input, `${fixtureId} input`);
  const operation = text(fixture.operation, `${fixtureId} operation`);
  switch (operation) {
    case "scale":
      return scale(
        text(input.raw, `${fixtureId} raw value`),
        integer(input.expo, `${fixtureId} exponent`),
        integer(input.targetDecimals, `${fixtureId} target decimals`),
        flag(input.zeroAllowed, `${fixtureId} zeroAllowed`),
      );
    case "confidence":
      return input.raw === null
        ? { status: "unsupported", value: null }
        : scale(
            text(input.raw, `${fixtureId} raw confidence`),
            integer(input.expo, `${fixtureId} exponent`),
            integer(input.targetDecimals, `${fixtureId} target decimals`),
            true,
            true,
          );
    case "freshness": {
      const publishTime = BigInt(text(input.publishTime, `${fixtureId} publish time`));
      const asOf = BigInt(text(input.asOf, `${fixtureId} as-of time`));
      const maxAge = BigInt(text(input.maxAgeSeconds, `${fixtureId} max age`));
      if (publishTime > asOf) return { status: "future-dated", ageSeconds: null };
      const age = asOf - publishTime;
      return { status: age <= maxAge ? "valid" : "stale", ageSeconds: age.toString() };
    }
    case "validate": {
      if (input.raw === null) return { status: "missing" };
      const value = BigInt(text(input.raw, `${fixtureId} raw value`));
      if (value < 0n) return { status: "negative" };
      if (value === 0n && !flag(input.zeroAllowed, `${fixtureId} zeroAllowed`)) {
        return { status: "zero-invalid" };
      }
      return { status: "valid" };
    }
    case "disagreement": {
      const values = new Set(
        objects(input.observations, "disagreement observations").map(({ value }) =>
          text(value, `${fixtureId} observed value`),
        ),
      );
      const observations = objects(input.observations, "disagreement observations");
      return values.size > 1
        ? { status: "disagreement", selectedSourceId: null }
        : {
            status: "valid",
            selectedSourceId:
              observations[0] === undefined
                ? null
                : text(observations[0].sourceId, `${fixtureId} source ID`),
          };
    }
    case "fallback": {
      const candidates = objects(input.candidates, "fallback candidates");
      const forbidden = new Set(texts(input.forbiddenSelectedClasses, "forbidden classes"));
      const selected = candidates.find(
        ({ status, sourceClass }) =>
          status === "valid" &&
          !forbidden.has(text(sourceClass, `${fixtureId} candidate source class`)),
      );
      return selected
        ? {
            status: "valid",
            selectedSourceId: text(selected.sourceId, `${fixtureId} selected source ID`),
            sourceClassChanged:
              selected.sourceClass !== (candidates[0]?.sourceClass ?? selected.sourceClass),
            attemptCount: candidates.indexOf(selected) + 1,
          }
        : {
            status: "failed",
            selectedSourceId: null,
            sourceClassChanged: false,
            attemptCount: candidates.length,
          };
    }
    case "aggregate": {
      const statuses = texts(input.statuses, "aggregate statuses");
      const valid = statuses.filter((status) => status === "valid").length;
      return { status: valid === statuses.length ? "valid" : valid > 0 ? "partial" : "failed" };
    }
    default:
      fail(`unsupported fixture operation '${operation}'`);
  }
}

function scale(
  rawInput: string,
  exponent: number,
  targetDecimals: number,
  zeroAllowed: boolean,
  confidence = false,
): JsonObject {
  const raw = BigInt(rawInput);
  if (!confidence && raw < 0n) return { status: "negative" };
  if (!confidence && raw === 0n && !zeroAllowed) return { status: "zero-invalid" };
  const power = exponent + targetDecimals;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 77) {
    return { status: "failed", cause: "exponent-overflow" };
  }
  const factor = 10n ** BigInt(Math.abs(power));
  const value = power >= 0 ? raw * factor : raw / factor;
  if (value < 0n || value > MAX_UINT256) return { status: "failed", cause: "numeric-overflow" };
  const result: JsonObject = { status: "valid", value: value.toString() };
  if (!confidence) result.remainderDiscarded = power < 0 && raw % factor !== 0n;
  return result;
}

async function json<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(`${label} must be an integer`);
  return value;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`);
  return value;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function fail(message: string): never {
  throw new Error(message);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
