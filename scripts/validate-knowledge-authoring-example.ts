import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeAuthoringExample } from "./lib/knowledge-authoring-example.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultModuleRoot = resolve(
  repositoryRoot,
  "docs/guides/examples/knowledge-authoring/synthetic-widget-catalog",
);

function parseModuleRoot(arguments_: string[]): string {
  if (arguments_.length === 0) return defaultModuleRoot;
  if (arguments_.length === 2 && arguments_[0] === "--module-root" && arguments_[1]) {
    return resolve(arguments_[1]);
  }
  throw new Error(
    "Usage: node scripts/validate-knowledge-authoring-example.ts [--module-root <path>]",
  );
}

const example = await loadKnowledgeAuthoringExample(parseModuleRoot(process.argv.slice(2)));
process.stdout.write(
  `Validated documentation-only ${example.moduleId} source, evidence, record, schema declaration, and logical references.\n`,
);
