import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, text, texts } from "./lib/json.ts";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = resolve(repositoryRoot, "knowledge");
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};
const slash = (path: string): string => path.split(sep).join("/");

async function findFiles(directory: string, name: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await findFiles(path, name)));
    else if (entry.isFile() && entry.name === name) results.push(path);
  }
  return results;
}

const resolved = await loadKnowledgeReference(repositoryRoot, {
  moduleId: "knowledge",
  resourceId: "knowledge-module-catalog",
});
const catalog = object(resolved.document, "knowledge module catalog");
const rootIndex = resolved.index;
assert(catalog.kind === "knowledge-module-catalog", "root catalog kind is invalid");
assert(
  catalog.status === "verified" &&
    catalog.supportStatus === "supported" &&
    catalog.reviewStatus === "accepted",
  "root catalog lifecycle is invalid",
);
assert(Array.isArray(catalog.modules) && catalog.modules.length > 0, "root catalog has no modules");

const modules = objects(catalog.modules, "catalog modules");
const moduleIds = modules.map((entry) => text(entry.moduleId, "catalog module ID"));
assert(new Set(moduleIds).size === moduleIds.length, "root catalog module IDs must be unique");
assert(
  modules.every((entry) => entry.id === entry.moduleId),
  "catalog entry IDs must equal module IDs",
);
assert(
  texts(object(rootIndex.scope, "root index scope").moduleIds, "root module IDs").join(",") ===
    moduleIds.join(","),
  "root index scope does not match catalog order",
);
const catalogResource = rootIndex.resources.find(
  (resource) => resource.id === "knowledge-module-catalog",
);
assert(catalogResource !== undefined, "root catalog resource is missing");
assert(
  texts(catalogResource.recordIds, "catalog resource record IDs").join(",") === moduleIds.join(","),
  "root resource record IDs do not match catalog order",
);

const catalogPaths = new Set<string>();
for (const entry of modules) {
  const moduleId = text(entry.moduleId, "catalog module ID");
  const indexPath = resolve(knowledgeRoot, text(entry.indexPath, `${moduleId} index path`));
  const indexRelation = relative(knowledgeRoot, indexPath);
  assert(
    indexRelation !== ".." && !indexRelation.startsWith(`..${sep}`),
    `${moduleId} index escapes knowledge root`,
  );
  assert(await isFile(indexPath), `${moduleId} index is missing`);
  const index = object(parseJson(await readFile(indexPath, "utf8"), indexPath), indexPath);
  assert(index.knowledgeVersion === "0.4", `${moduleId} is not v0.4`);
  assert(
    index.moduleId === moduleId && index.id === moduleId,
    `${moduleId} index identity drifted`,
  );
  assert(!catalogPaths.has(slash(indexRelation)), `${moduleId} duplicates an index path`);
  catalogPaths.add(slash(indexRelation));

  const humanPath = resolve(
    knowledgeRoot,
    text(entry.humanEntryPoint, `${moduleId} human entry point`),
  );
  const humanRelation = relative(knowledgeRoot, humanPath);
  assert(
    humanRelation !== ".." && !humanRelation.startsWith(`..${sep}`),
    `${moduleId} human entry escapes knowledge root`,
  );
  assert(await isFile(humanPath), `${moduleId} human entry point is missing`);
  assert(
    dirname(humanPath) === dirname(indexPath),
    `${moduleId} README and index must share a module root`,
  );

  if (entry.generatedReferenceResourceId === null) {
    assert(moduleId === "knowledge", `${moduleId} must name its generated human reference`);
  } else {
    const generatedReferenceResourceId = text(
      entry.generatedReferenceResourceId,
      `${moduleId} generated reference resource ID`,
    );
    const generated = objects(index.resources, `${moduleId} resources`).find(
      (resource) => resource.id === generatedReferenceResourceId,
    );
    assert(
      generated?.role === "generated",
      `${moduleId} generated reference is missing or misclassified`,
    );
  }
}

const discoveredIndexPaths = new Set(
  (await findFiles(knowledgeRoot, "index.json"))
    .filter((path) => !path.startsWith(`${resolve(knowledgeRoot, "schema")}${sep}`))
    .map((path) => slash(relative(knowledgeRoot, path))),
);
assert(discoveredIndexPaths.size === catalogPaths.size, "catalog/discovered module count differs");
for (const path of discoveredIndexPaths)
  assert(catalogPaths.has(path), `module index '${path}' is absent from root catalog`);
for (const path of catalogPaths)
  assert(discoveredIndexPaths.has(path), `catalog index '${path}' was not discovered`);

const placeholders = (await findFiles(knowledgeRoot, ".gitkeep")).map((path) =>
  slash(relative(knowledgeRoot, path)),
);
assert(
  placeholders.length === 0,
  `empty knowledge placeholders remain: ${placeholders.join(", ")}`,
);

process.stdout.write(
  `Validated root catalog discovery for ${modules.length} v0.4 modules with no empty placeholders.\n`,
);
