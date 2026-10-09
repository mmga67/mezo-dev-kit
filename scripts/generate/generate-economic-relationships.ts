import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import {
  loadEconomicRelationships,
  renderEconomicRelationships,
} from "../lib/economic-relationships.ts";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--check"))
  throw new Error("usage: generate-economic-relationships.ts [--check]");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = await format(renderEconomicRelationships(await loadEconomicRelationships(root)), {
  parser: "markdown",
});
const path = resolve(root, "knowledge/generated/economic-relationships.md");
if (args.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output)
    throw new Error("Economic relationship reference drifted");
} else {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, output);
}
