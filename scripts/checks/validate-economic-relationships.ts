import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEconomicRelationships } from "../lib/economic-relationships.ts";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--module" || !args[1]))
  throw new Error("usage: validate-economic-relationships.ts [--module ID]");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const collections = await loadEconomicRelationships(root, args[1]);
process.stdout.write(
  `Validated ${collections.reduce((sum, item) => sum + item.records.length, 0)} economic relationships across ${collections.length} owners; this validates references and categories, not source truth or current support.\n`,
);
