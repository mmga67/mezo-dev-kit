import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type aggregatesShape from "../knowledge/protocols/musd/institutional-debt/records/aggregate-boundaries.json";
import type architectureShape from "../knowledge/protocols/musd/institutional-debt/records/architecture.json";
import type accountingShape from "../knowledge/protocols/musd/institutional-debt/records/positions-accounting.json";
import type formulasShape from "../knowledge/protocols/musd/institutional-debt/records/formulas.json";
import type operationsShape from "../knowledge/protocols/musd/institutional-debt/records/operations-events.json";
import type vaultsShape from "../knowledge/protocols/musd/institutional-debt/records/enclave-vaults.json";
import type fixturesShape from "../knowledge/protocols/musd/institutional-debt/fixtures/formulas.json";
import type stateShape from "../knowledge/protocols/musd/institutional-debt/evidence/fixed-block-state-2026-08-23.json";
import type reproductionShape from "../knowledge/protocols/musd/institutional-debt/evidence/source-reproduction-2026-08-23.json";
import type indexShape from "../knowledge/protocols/musd/institutional-debt/index.json";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(
  repositoryRoot,
  "knowledge",
  "protocols",
  "musd",
  "institutional-debt",
);
const outputPath = join(moduleDirectory, "generated", "reference.md");
const check = process.argv.includes("--check");

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(moduleDirectory, path), "utf8")) as T;
}

const index = await json<typeof indexShape>("index.json");
const architecture = await json<typeof architectureShape>("records/architecture.json");
const vaults = await json<typeof vaultsShape>("records/enclave-vaults.json");
const accounting = await json<typeof accountingShape>("records/positions-accounting.json");
const formulas = await json<typeof formulasShape>("records/formulas.json");
const operations = await json<typeof operationsShape>("records/operations-events.json");
const aggregates = await json<typeof aggregatesShape>("records/aggregate-boundaries.json");
const fixtures = await json<typeof fixturesShape>("fixtures/formulas.json");
const state = await json<typeof stateShape>("evidence/fixed-block-state-2026-08-23.json");
const reproduction = await json<typeof reproductionShape>(
  "evidence/source-reproduction-2026-08-23.json",
);

const scope = index.scope;
const stateScope = state.scope;
const debtManager = state.debtManager;
const totals = debtManager.totals;
const positions = debtManager.positions;
const generations = vaults.generations;

const lines: string[] = [
  "# Institutional MUSD debt reference",
  "",
  "> Generated from canonical `protocols/musd/institutional-debt` records and evidence. Do not edit manually.",
  "",
  "## Lifecycle",
  "",
  `- Status: \`${index.status}\``,
  `- Support: \`${index.supportStatus}\``,
  `- Review: \`${index.reviewStatus}\``,
  `- Evidence block: Mezo Mainnet \`${scope.blockNumber}\` (\`${scope.blockHash}\`) at \`${stateScope.blockTimestamp}\``,
  "- Writers: none",
  "- Readers: no public facade implemented",
  "",
  "## Ownership boundary",
  "",
];

for (const rule of architecture.nonNormalizationRules) {
  lines.push(`- ${rule}`);
}

lines.push(
  "",
  "## Enclave generations",
  "",
  "| Generation | Targets at evidence block | Debt-manager selectors | Triparty UTXOs |",
  "| --- | ---: | ---: | ---: |",
);
for (const generation of generations) {
  const summary = generation.fixedBlockSummary;
  lines.push(
    `| \`${generation.id}\` | ${summary.targetSelectorPairCount} | ${summary.debtManagerSelectorCount} | ${summary.tripartyUtxoCount} |`,
  );
}

lines.push(
  "",
  `- Execution: ${vaults.sharedBoundaries.executor}`,
  `- Allowlist: ${vaults.sharedBoundaries.allowlist}`,
  `- veBTC custody: ${vaults.sharedBoundaries.veBtcCustody}`,
  "",
  "## Position and accounting model",
  "",
);
for (const dimension of accounting.accountingDimensions) {
  lines.push(`- \`${dimension.id}\`: ${dimension.meaning}`);
}

lines.push(
  "",
  "### Fixed-block read summary",
  "",
  `- Known positions: ${positions.length}`,
  `- Active positions: ${positions.filter(({ status }) => status === "active").length}`,
  `- Closed by repayment: ${positions.filter(({ status }) => status === "closedByRepayment").length}`,
  `- Institutional principal: \`${totals.totalPrincipal}\``,
  `- Cumulative principal minted: \`${totals.totalMintedDebt}\``,
  `- Cumulative principal burned: \`${totals.totalDebtBurned}\``,
  `- Institutional outstanding debt: \`${totals.totalOutstandingDebt}\``,
  "",
  "## Deterministic formulas",
  "",
  "| Formula | Expression |",
  "| --- | --- |",
);
for (const formula of formulas.records) {
  lines.push(`| \`${formula.id}\` | ${formula.expression} |`);
}

lines.push("", "### Fixture coverage", "", "| Fixture | Operation |", "| --- | --- |");
for (const fixture of fixtures.records) {
  lines.push(`| \`${fixture.id}\` | \`${fixture.operation}\` |`);
}

lines.push(
  "",
  "## Classic versus institutional",
  "",
  aggregates.ratioRule,
  "",
  "The ledgers remain separate even though both can affect the same MUSD token supply through separately authorized paths.",
  "",
  "## Future operation gates",
  "",
);
for (const operation of operations.operations) {
  lines.push(`### ${operation.id}`, "");
  for (const requirement of operation.requirements) lines.push(`- ${requirement}`);
  lines.push("");
}

lines.push(
  "## Evidence",
  "",
  `- Fixed-block Enclaves: ${state.enclaves.length}`,
  `- Reproduced implementation generations: ${reproduction.records.length}`,
  "- Current logical ABI identities: 3",
  "",
  "See `review/gaps.md` before relying on any proposed identity or rule.",
  "",
);

const output = `${lines.join("\n").trimEnd()}\n`;
if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    process.stderr.write(
      "institutional debt reference is stale; run node scripts/generate-institutional-debt-reference.ts\n",
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`wrote ${outputPath}\n`);
}
