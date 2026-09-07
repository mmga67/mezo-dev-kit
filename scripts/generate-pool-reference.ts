import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "protocols", "pools");
const outputPath = join(moduleDirectory, "generated", "reference.md");
const check = process.argv.includes("--check");

type JsonObject = Record<string, unknown>;

async function json(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(join(moduleDirectory, path), "utf8")) as JsonObject;
}

function objects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  return value.map(object);
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected an object");
  return value as JsonObject;
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error("expected a scalar value");
}

function scalars(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  return value.map(scalar);
}

const index = await json("index.json");
const architectureCatalog = await json("records/architectures.json");
const math = await json("records/math.json");
const positions = await json("records/positions-gauges.json");
const operations = await json("records/operations.json");
const classification = await json("records/classification.json");
const fixtures = await json("fixtures/math.json");
const topology = await json("evidence/mainnet-topology-2026-08-23.json");
const reproductions = await json("evidence/source-reproduction-2026-08-23.json");

const lines: string[] = [
  "# Mezo pools and liquidity reference",
  "",
  "> Generated from canonical `protocols/pools` records and evidence. Do not edit manually.",
  "",
  "## Lifecycle",
  "",
  `- Status: \`${scalar(index.status)}\``,
  `- Support: \`${scalar(index.supportStatus)}\``,
  `- Review: \`${scalar(index.reviewStatus)}\``,
  `- Evidence block: Mezo Mainnet \`${scalar(object(index.scope).blockNumber)}\` (\`${scalar(object(index.scope).blockHash)}\`)`,
  "- Writers: none",
  "- Quoter: no current official deployment identity established",
  "",
  "## Architectures",
  "",
];

for (const architecture of objects(architectureCatalog.architectures)) {
  lines.push(`### ${scalar(architecture.id)}`, "");
  lines.push(
    `- Pool key: ${scalars(architecture.poolKey)
      .map((part) => `\`${part}\``)
      .join(" + ")}`,
  );
  lines.push(`- Position: ${scalar(architecture.positionType)}`);
  const discovery = object(architecture.discovery);
  lines.push(`- Discovery: ${scalar(discovery.rule ?? discovery.poolRule)}`);
  if (discovery.gaugeRule) lines.push(`- Gauge discovery: ${scalar(discovery.gaugeRule)}`);
  lines.push("");
}

lines.push(
  "## Liquidity and ownership boundaries",
  "",
  "| Dimension | Read | Meaning |",
  "| --- | --- | --- |",
);
for (const dimension of objects(positions.liquidityDimensions)) {
  lines.push(
    `| ${scalar(dimension.id)} | \`${scalar(dimension.read)}\` | ${scalar(dimension.meaning)} |`,
  );
}
const ownership = object(positions.ownership);
lines.push(
  "",
  `- Staked ERC-721 owner: ${scalar(ownership.stakedContractOwner)}`,
  `- Beneficial depositor: ${scalar(ownership.beneficialDepositor)}`,
  `- Unknown depositor: ${scalar(ownership.missingDepositor)}`,
  "",
  "## Deterministic math",
  "",
);
const constants = object(math.constants);
lines.push(
  `- Tick range: \`${scalar(constants.minTick)}\` through \`${scalar(constants.maxTick)}\``,
  `- Q96: \`${scalar(constants.Q96)}\``,
  `- Minimum sqrt ratio: \`${scalar(constants.minSqrtRatioX96)}\``,
  `- Maximum sqrt ratio: \`${scalar(constants.maxSqrtRatioX96)}\``,
  `- Price rule: ${scalar(object(math.tickAndPrice).rawPrice)}`,
  `- Rounding rule: ${scalar(object(math.liquidityAmounts).roundingBoundary)}`,
  "",
  "### Fixture coverage",
  "",
  "| Fixture | Operation |",
  "| --- | --- |",
);
for (const fixture of objects(fixtures.records)) {
  lines.push(`| \`${scalar(fixture.id)}\` | \`${scalar(fixture.operation)}\` |`);
}

lines.push("", "## Fixed-block topology", "");
const dynamicDiscovery = object(topology.dynamicDiscovery);
const basic = object(dynamicDiscovery.basic);
const concentrated = object(dynamicDiscovery.concentrated);
const clPools = objects(concentrated.pools);
lines.push(
  `- Reviewed roots: ${Object.keys(object(topology.roots)).length}`,
  `- Basic pool observations: ${scalar(basic.allPoolsLength)}`,
  `- CL pool observations: ${scalar(concentrated.allPoolsLength)}`,
  `- CL pools without a gauge at the evidence block: ${clPools.filter((pool) => pool.gauge === null).length}`,
  `- CL roots with exact executable reproduction: ${objects(reproductions.records).length}`,
  "",
  "These instance counts are dated evidence. Current consumers rediscover through the root factory and gauge relationships.",
  "",
  "## Future operation gates",
  "",
);
for (const requirement of objects(operations.requirements)) {
  lines.push(`### ${scalar(requirement.id)}`, "");
  for (const rule of scalars(requirement.rules)) lines.push(`- ${rule}`);
  lines.push("");
}

lines.push(
  "## Surface classification",
  "",
  "| Class | Owned here | Boundary |",
  "| --- | --- | --- |",
);
for (const entry of objects(classification.classes)) {
  lines.push(
    `| \`${scalar(entry.id)}\` | ${entry.ownedHere ? "yes" : "no"} | ${scalar(entry.identity ?? entry.reason)} |`,
  );
}
lines.push(
  "",
  "See `review/gaps.md` before relying on any proposed root or operation requirement.",
  "",
);

const output = `${lines.join("\n").trimEnd()}\n`;
if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    process.stderr.write("pool reference is stale; run node scripts/generate-pool-reference.ts\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`wrote ${outputPath}\n`);
}
