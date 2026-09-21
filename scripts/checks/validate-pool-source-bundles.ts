import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { object, objects, text } from "../lib/json.ts";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";
import { loadPoolSourceBundle } from "../lib/pool-source.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = object(
  (
    await loadKnowledgeReference(repositoryRoot, {
      moduleId: "contracts",
      resourceId: "pool-source-bundles",
    })
  ).value,
  "pool source catalog",
);
const reproduction = object(
  (
    await loadKnowledgeReference(repositoryRoot, {
      moduleId: "protocols/pools",
      resourceId: "pools-source-reproduction",
    })
  ).value,
  "pool reproductions",
);
const retained = objects(catalog.records, "retained sources");
const expectedIds = objects(reproduction.records, "reproductions")
  .map((record) => text(record.contractId, "contract ID"))
  .sort();
const actualIds = retained.map((record) => text(record.id, "contract ID")).sort();
if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
  throw new Error("retained source coverage differs from the reviewed CL roots");
}
for (const id of actualIds) await loadPoolSourceBundle(repositoryRoot, id);
process.stdout.write(
  `Validated ${actualIds.length} retained CL source bundles against recorded reproduction digests.\n`,
);
