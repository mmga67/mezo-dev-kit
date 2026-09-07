import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type evidenceShape from "../knowledge/prices/evidence/fixed-block-observations-2026-08-27.json";
import type fixturesShape from "../knowledge/prices/fixtures/prices.json";
import type indexShape from "../knowledge/prices/index.json";
import type datumRulesShape from "../knowledge/prices/records/datum-rules.json";
import type freshnessFallbackShape from "../knowledge/prices/records/freshness-fallback.json";
import type sourcesFeedsShape from "../knowledge/prices/records/sources-feeds.json";
import type taxonomyShape from "../knowledge/prices/records/taxonomy.json";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "prices");
const outputPath = join(moduleDirectory, "generated", "reference.md");
const check = process.argv.includes("--check");

const index = await json<typeof indexShape>("index.json");
const taxonomy = await json<typeof taxonomyShape>("records/taxonomy.json");
const sourcesFeeds = await json<typeof sourcesFeedsShape>("records/sources-feeds.json");
const datumRules = await json<typeof datumRulesShape>("records/datum-rules.json");
const freshnessFallback = await json<typeof freshnessFallbackShape>(
  "records/freshness-fallback.json",
);
const fixtures = await json<typeof fixturesShape>("fixtures/prices.json");
const currentEvidence = await Promise.all(
  Object.entries(index.extensions.currentEvidenceByNetwork).map(async ([networkId, reference]) => {
    const resolved = await loadKnowledgeReference(repositoryRoot, reference);
    const evidence = JSON.parse(await readFile(resolved.path, "utf8")) as typeof evidenceShape;
    return { networkId, evidence };
  }),
);

const lines = [
  "# Prices reference",
  "",
  "> Generated from canonical `prices` records and evidence. Do not edit manually.",
  "",
  "## Lifecycle",
  "",
  `- Status: \`${index.status}\``,
  `- Support: \`${index.supportStatus}\``,
  `- Review: \`${index.reviewStatus}\``,
  `- Review boundary: \`${index.reviewAfter}\``,
  "- Public readers: none",
  "- Writers/updaters: none",
  "",
  "## Source classes",
  "",
  "| Class | Canonical semantics owner |",
  "| --- | --- |",
];
for (const record of taxonomy.records) {
  lines.push(`| \`${record.id}\` | ${record.canonicalSemanticsOwner} |`);
}

lines.push("", "## Initial sources and feeds", "");
for (const source of sourcesFeeds.sources) {
  lines.push(
    `- \`${source.id}\`: ${source.provider}; \`${source.sourceClass}\`; ${source.supportStatus}.`,
  );
}
lines.push("");
for (const feed of sourcesFeeds.feeds) {
  lines.push(`- \`${feed.id}\`: ${feed.baseAsset}/${feed.quoteAsset}; ${feed.supportStatus}.`);
}

lines.push(
  "",
  "## Deterministic rules",
  "",
  `- Scale: ${datumRules.scaling.formula}`,
  `- Exponent bound: ±${datumRules.scaling.maxAbsolutePowerOfTenExponent}`,
  `- Freshness: ${freshnessFallback.freshness.valid}`,
  `- Boundary: ${freshnessFallback.freshness.boundaryRule}`,
  `- MUSD: ${freshnessFallback.musdNonSubstitution}`,
  "",
  "## Fixture coverage",
  "",
  "| Fixture | Operation |",
  "| --- | --- |",
);
for (const fixture of fixtures.records)
  lines.push(`| \`${fixture.id}\` | \`${fixture.operation}\` |`);

lines.push(
  "",
  "## Current post-upgrade fixed-block observations",
  "",
  "| Observation | Network | Result |",
  "| --- | --- | --- |",
);
for (const { networkId, evidence } of currentEvidence) {
  lines.push(`| Review deadline | ${networkId} | ${evidence.reviewAfter} |`);
  for (const observation of evidence.observations.filter(
    (entry) => entry.networkId === networkId,
  )) {
    lines.push(
      `| \`${observation.id}\` | \`${observation.networkId}\` | \`${observation.result}\` |`,
    );
  }
}
lines.push(
  "",
  "Older observations remain immutable historical evidence. Current evidence is selected independently by network; the full-module deadline remains expired until the testnet refresh succeeds (current-state oracle verification). Pyth diagnostic payloads are stale evidence, not current prices. See `review/gaps.md` before relying on any proposed identity or rule.",
  "",
);

const output = `${lines.join("\n").trimEnd()}\n`;
if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    process.stderr.write(
      "price reference is stale; run node scripts/generate-price-reference.ts\n",
    );
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`wrote ${outputPath}\n`);
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(moduleDirectory, path), "utf8")) as T;
}
