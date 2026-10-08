import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import quality from "../../vitest.quality.config.ts";
import browser from "../../vitest.browser.config.ts";
import { object, parseJson, text } from "../lib/json.ts";
import { validateGeneratorSelection, validateTestSelections } from "../lib/quality-inventory.ts";

const root = resolve(import.meta.dirname, "../..");
const tests = (await readdir(resolve(root, "scripts/tests")))
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => `scripts/tests/${file}`);
const generators = (await readdir(resolve(root, "scripts/generate")))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => `scripts/generate/${file}`);
const manifest = object(
  parseJson(await readFile(resolve(root, "package.json"), "utf8"), "root package"),
  "root package",
);
const scripts = object(manifest.scripts, "root scripts");
const diagnostics = [
  ...validateTestSelections(tests, {
    quality: quality.test?.include ?? [],
    browser: browser.test?.include ?? [],
    // Established owning-tool exception documented in scripts/tests/README.md.
    "node:test": ["scripts/tests/test-agent-skills.test.ts"],
  }),
  ...validateGeneratorSelection(generators, text(scripts["generate:check"], "generate:check")),
];
if (diagnostics.length) throw new Error(`Quality inventory failed:\n${diagnostics.join("\n")}`);
process.stdout.write("Test runner and runtime-generator selections are complete.\n");
