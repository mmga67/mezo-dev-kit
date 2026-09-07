import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type evidenceShape from "../knowledge/workflows/swaps/evidence/mainnet-routing-2026-08-25.json";
import type fixturesShape from "../knowledge/workflows/swaps/fixtures/routes.json";
import type indexShape from "../knowledge/workflows/swaps/index.json";
import type executionShape from "../knowledge/workflows/swaps/records/execution.json";
import type providersShape from "../knowledge/workflows/swaps/records/providers.json";
import type routesShape from "../knowledge/workflows/swaps/records/routes.json";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "workflows", "swaps");
const outputPath = join(moduleDirectory, "generated", "reference.md");
const check = process.argv.includes("--check");

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(moduleDirectory, path), "utf8")) as T;
}

const inputPaths = [
  "index.json",
  "records/providers.json",
  "records/routes.json",
  "records/execution.json",
  "fixtures/routes.json",
  "evidence/mainnet-routing-2026-08-25.json",
] as const;
const inputBuffers = await Promise.all(
  inputPaths.map((path) => readFile(join(moduleDirectory, path))),
);
const inputDigest = createHash("sha256").update(Buffer.concat(inputBuffers)).digest("hex");

const index = await json<typeof indexShape>("index.json");
const providers = await json<typeof providersShape>("records/providers.json");
const routes = await json<typeof routesShape>("records/routes.json");
const execution = await json<typeof executionShape>("records/execution.json");
const fixtures = await json<typeof fixturesShape>("fixtures/routes.json");
const evidence = await json<typeof evidenceShape>("evidence/mainnet-routing-2026-08-25.json");
const scope = evidence.scope;

const lines: string[] = [
  "# Mezo swaps and routing reference",
  "",
  "> Generated from canonical `workflows/swaps` records and evidence. Do not edit manually.",
  "",
  "## Lifecycle",
  "",
  `- Status: \`${index.status}\``,
  `- Support: \`${index.supportStatus}\``,
  `- Review: \`${index.reviewStatus}\``,
  `- Evidence block: Mezo Mainnet \`${scope.currentBlockNumber}\` (\`${scope.currentBlockHash}\`)`,
  "- Public readers: none",
  "- Writers: none",
  `- Input digest: \`${inputDigest}\``,
  "",
  "## Deployed providers",
  "",
  "| Provider | Architecture | Quote boundary | Approval spender |",
  "| --- | --- | --- | --- |",
];

for (const provider of providers.records) {
  const quote = provider.quote;
  lines.push(
    `| \`${provider.id}\` | \`${provider.architecture}\` | \`${quote.status}\` | \`${provider.approvalSpender}\` |`,
  );
}

lines.push(
  "",
  "The basic router's `getAmountsOut` is a block-scoped convenience quote. The CL router has no standalone Quoter. Neither estimate is exact-call simulation or a guaranteed minimum.",
  "",
  "## Route dispositions",
  "",
  "| Route | Disposition | Encoding |",
  "| --- | --- | --- |",
);
for (const route of routes.records) {
  const encoding = (route.hopEncoding ?? "none").replaceAll("|", "\\|");
  lines.push(`| \`${route.id}\` | \`${route.disposition}\` | ${encoding} |`);
}

lines.push("", "## Execution lifecycle", "");
for (const phase of execution.phases) {
  lines.push(`### ${phase.id}`, "");
  for (const rule of phase.rules) lines.push(`- ${rule}`);
  lines.push("");
}

lines.push(
  "## Evidence",
  "",
  `- Current router roots: ${Object.keys(evidence.currentRoots).length}`,
  `- Historical exact-call replays: ${evidence.historicalReplays.length}`,
  `- Deterministic fixtures: ${fixtures.records.length}`,
  "- Basic evidence includes a successful exact two-hop replay whose returned amounts match receipt transfers.",
  "- CL evidence includes a successful exact direct replay, but its historical zero minimum is negative evidence and must not be copied.",
  "",
  "See `review/gaps.md` before relying on a route or operation. No public reader or writer is enabled.",
  "",
);

const output = `${lines.join("\n").trimEnd()}\n`;
if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    process.stderr.write("swap reference is stale; run node scripts/generate-swap-reference.ts\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`wrote ${outputPath} (${inputDigest})\n`);
}
