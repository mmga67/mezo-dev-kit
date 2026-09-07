import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleArgument = process.argv[process.argv.indexOf("--module") + 1];
const check = process.argv.includes("--check");
const supported = new Set([
  "protocols/musd/savings",
  "protocols/lending/musdc",
  "protocols/vaults/usdc-lending",
]);
if (moduleArgument === undefined || !supported.has(moduleArgument)) {
  throw new Error(
    "--module must be protocols/musd/savings, protocols/lending/musdc, or protocols/vaults/usdc-lending",
  );
}
const moduleId = moduleArgument;

type Json = Record<string, unknown>;
const directory = join(repositoryRoot, "knowledge", ...moduleId.split("/"));
const json = async (path: string): Promise<Json> =>
  JSON.parse(await readFile(join(directory, path), "utf8")) as Json;
const object = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Json;
};
const objects = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error("expected array");
  return value.map(object);
};
const scalar = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error("expected scalar");
};
const scalars = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error("expected array");
  return value.map(scalar);
};

const index = await json("index.json");
const scope = object(index.scope);
let lines: string[];

if (moduleId === "protocols/musd/savings") {
  const model = await json("records/model.json");
  const roles = await json("records/roles.json");
  const reconciliation = await json("records/reconciliation.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const savings = object(evidence.savings);
  lines = [
    "# MUSD Savings reference",
    "",
    "> Generated from canonical `protocols/musd/savings` records and evidence. Do not edit manually.",
    "",
    "## Lifecycle",
    "",
    `- Status: \`${scalar(index.status)}\`; support: \`${scalar(index.supportStatus)}\`; review: \`${scalar(index.reviewStatus)}\``,
    `- Evidence block: \`${scalar(scope.blockNumber)}\` (\`${scalar(scope.blockHash)}\`)`,
    "- Writers: none",
    "",
    "## Accounting boundary",
    "",
    `- ${scalar(object(model.principal).deposit)}`,
    `- ${scalar(object(model.principal).withdraw)}`,
    `- Yield update: ${scalar(object(model.yieldAccounting).userUpdate)}`,
    "- sMUSD principal, claimable MUSD yield, gauge stake, and MEZO rewards are separate values.",
    "- Savings state does not enter troves, TCR, Stability Pool, or redemptions.",
    "",
    "## Current topology",
    "",
    `- Savings proxy: \`${scalar(savings.proxy)}\``,
    `- Strategy: \`${scalar(savings.strategy)}\` (resolved through the Savings root)`,
    `- Gauge: \`${scalar(savings.vaultGauge)}\` (must equal PoolsVoter discovery)`,
    `- Indexed principal supply: \`${scalar(savings.totalSupply)}\``,
    `- Yield index: \`${scalar(savings.yieldIndex)}\``,
    "",
    "## Double-counting guards",
    "",
    ...scalars(reconciliation.doubleCountingGuards).map((rule) => `- ${rule}`),
    "",
    `Stable references: ${objects(roles.stableReferences).length}; see \`review/gaps.md\` before relying on proposed identities.`,
    "",
  ];
} else if (moduleId === "protocols/lending/musdc") {
  const market = await json("records/market.json");
  const formulas = await json("records/formulas.json");
  const reconciliation = await json("records/reconciliation.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const state = object(evidence.market);
  lines = [
    "# mUSDC lending reference",
    "",
    "> Generated from canonical `protocols/lending/musdc` records and evidence. Do not edit manually.",
    "",
    "## Lifecycle",
    "",
    `- Status: \`${scalar(index.status)}\`; support: \`${scalar(index.supportStatus)}\`; review: \`${scalar(index.reviewStatus)}\``,
    `- Evidence block: \`${scalar(scope.blockNumber)}\` (\`${scalar(scope.blockHash)}\`)`,
    "- Writers: none",
    "",
    "## Market",
    "",
    `- Market ID: \`${scalar(object(market.scope).marketId)}\``,
    `- LLTV: \`${scalar(state.lltv)}\` (WAD-scaled, block-scoped)`,
    `- Supply assets/shares: \`${scalar(state.totalSupplyAssets)}\` / \`${scalar(state.totalSupplyShares)}\``,
    `- Borrow assets/shares: \`${scalar(state.totalBorrowAssets)}\` / \`${scalar(state.totalBorrowShares)}\``,
    `- Token liquidity: \`${scalar(state.tokenLiquidity)}\``,
    "",
    "## Exact formula set",
    "",
    ...objects(formulas.records).map(
      (record) => `- \`${scalar(record.id)}\`: ${scalar(record.formula)}`,
    ),
    "",
    "## Boundary",
    "",
    ...scalars(reconciliation.rules).map((rule) => `- ${rule}`),
    "",
  ];
} else {
  const architecture = await json("records/architecture.json");
  const accounting = await json("records/accounting.json");
  const liquidity = await json("records/liquidity.json");
  const reconciliation = await json("records/reconciliation.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const vault = object(evidence.vault);
  const wrapper = object(evidence.wrapper);
  const configuration = object(evidence.configuration);
  const gates = object(configuration.gates);
  const capInventory = objects(configuration.allocationCaps);
  const timelockInventory = objects(configuration.timelockedFunctions);
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  lines = [
    "# USDC Lending Vault reference",
    "",
    "> Generated from canonical `protocols/vaults/usdc-lending` records and evidence. Do not edit manually.",
    "",
    "## Lifecycle",
    "",
    `- Status: \`${scalar(index.status)}\`; support: \`${scalar(index.supportStatus)}\`; review: \`${scalar(index.reviewStatus)}\``,
    `- Evidence block: \`${scalar(scope.blockNumber)}\` (\`${scalar(scope.blockHash)}\`)`,
    "- Writers: none",
    "",
    "## Layers",
    "",
    ...objects(architecture.layers).map(
      (layer) => `- \`${scalar(layer.id)}\`: ${scalar(layer.position)}`,
    ),
    "",
    "## Current state",
    "",
    `- Vault total assets / shares: \`${scalar(vault.totalAssetsView)}\` / \`${scalar(vault.totalSupply)}\``,
    `- Adapter real assets: \`${scalar(object(evidence.marketAdapter).realAssets)}\` (included in vault total assets)`,
    `- Wrapper receipts: \`${scalar(wrapper.totalSupply)}\``,
    `- Wrapper accumulated yield shares: \`${scalar(wrapper.accumulatedYield)}\``,
    `- Gauge stake: \`${scalar(object(evidence.gauge).totalSupply)}\``,
    `- Adapter queue entries: \`${scalars(configuration.adapterQueue).length}\`; allocation cap dimensions: \`${capInventory.length}\``,
    `- Enabled gates: \`${Object.values(gates).filter((gate) => gate !== zeroAddress).length}\` of \`${Object.keys(gates).length}\` at the evidence block`,
    `- Curator timelock inventory: \`${timelockInventory.length}\` selectors; nonzero durations: \`${timelockInventory.filter((entry) => entry.duration !== "0").length}\`; abdicated: \`${timelockInventory.filter((entry) => entry.abdicated === true).length}\``,
    "",
    "## Conversion and liquidity",
    "",
    `- Vault deposit: ${scalar(object(accounting.vault).previewDeposit)}`,
    `- Wrapper deposit: ${scalar(object(accounting.wrapper).depositReceipts)}`,
    `- Allocation: ${scalar(liquidity.allocationRule)}`,
    "",
    "## Reconciliation",
    "",
    ...scalars(reconciliation.rules).map((rule) => `- ${rule}`),
    "",
  ];
}

const output = `${lines.join("\n").trimEnd()}\n`;
const outputPath = join(directory, "generated", "reference.md");
if (check) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== output) {
    process.stderr.write(`${moduleId} reference is stale; run this generator without --check\n`);
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, output, "utf8");
  process.stdout.write(`${outputPath}\n`);
}
