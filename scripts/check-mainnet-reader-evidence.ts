import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeModule } from "./lib/knowledge-reference.ts";
import { objects, text } from "./lib/json.ts";

// The approved source-alpha program mainnet reader dependency boundary. Public/full registry
// acceptance still uses every module's unmodified, unscoped declared checks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
  "networks",
  "contracts",
  "prices",
  "protocols/musd",
  "protocols/musd/savings",
  "protocols/musd/borrowing",
  "protocols/musd/redemptions",
  "protocols/musd/institutional-debt",
  "protocols/lending/musdc",
  "protocols/vaults/usdc-lending",
  "protocols/incentives",
  "protocols/pools",
  "workflows/swaps",
  "workflows/bridges",
  "workflows/transactions",
];
const scopedValidators = new Set([
  "scripts/validate-contract-knowledge.ts",
  "scripts/validate-price-knowledge.ts",
]);
if (process.argv.length !== 2)
  throw new Error("usage: node scripts/check-mainnet-reader-evidence.ts");
for (const moduleId of modules) {
  const module = await loadKnowledgeModule(root, moduleId);
  for (const check of objects(module.index.checks, `${moduleId} checks`)) {
    const command = text(check.command, "check command");
    const [executable, script, ...args] = command.split(/\s+/);
    if (executable !== "node" || !script?.startsWith("scripts/") || /[;&|<>]/.test(command)) {
      throw new Error(`Unsupported declared check command: ${command}`);
    }
    if (scopedValidators.has(script)) args.push("--network", "mezo-mainnet");
    process.stdout.write(`[mainnet reader evidence] ${moduleId}: ${script} ${args.join(" ")}\n`);
    const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
      cwd: root,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${moduleId} check failed: ${command}`);
  }
}
process.stdout.write(
  "Mainnet reader evidence checks passed. This is not full-registry acceptance; historical testnet re-verification is outside this current reader scope.\n",
);
