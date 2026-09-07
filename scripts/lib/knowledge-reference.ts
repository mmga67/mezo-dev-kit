import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

export interface KnowledgeReference {
  moduleId: string;
  resourceId: string;
  recordId?: string;
  pointer?: string;
}

export interface KnowledgeResource {
  id: string;
  path: string;
  recordIds?: readonly string[];
  recordCollectionPointer?: string;
  [key: string]: unknown;
}

export interface KnowledgeModuleIndex {
  knowledgeVersion: "0.4";
  moduleId: string;
  resources: KnowledgeResource[];
  [key: string]: unknown;
}

export interface LoadedKnowledgeModule {
  index: KnowledgeModuleIndex;
  indexPath: string;
  directory: string;
}

export interface ResolvedKnowledgeResource extends LoadedKnowledgeModule {
  resource: KnowledgeResource;
  path: string;
}

export interface LoadedKnowledgeReference extends ResolvedKnowledgeResource {
  document: unknown;
  value: unknown;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnowledgeResource(value: unknown): value is KnowledgeResource {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.path !== "string") {
    return false;
  }
  if (
    value.recordIds !== undefined &&
    (!Array.isArray(value.recordIds) ||
      !value.recordIds.every((recordId) => typeof recordId === "string"))
  ) {
    return false;
  }
  return (
    value.recordCollectionPointer === undefined || typeof value.recordCollectionPointer === "string"
  );
}

function isKnowledgeModuleIndex(
  value: unknown,
  expectedModuleId?: string,
): value is KnowledgeModuleIndex {
  return (
    isRecord(value) &&
    value.knowledgeVersion === "0.4" &&
    typeof value.moduleId === "string" &&
    (expectedModuleId === undefined || value.moduleId === expectedModuleId) &&
    Array.isArray(value.resources) &&
    value.resources.every(isKnowledgeResource)
  );
}

function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}

function parseKnowledgeReference(reference: unknown): KnowledgeReference {
  assert(isRecord(reference), "knowledge reference must be an object");
  assert(typeof reference.moduleId === "string", "knowledge reference moduleId is required");
  assert(typeof reference.resourceId === "string", "knowledge reference resourceId is required");
  assert(
    reference.recordId === undefined || typeof reference.recordId === "string",
    "knowledge reference recordId must be a string",
  );
  assert(
    reference.pointer === undefined || typeof reference.pointer === "string",
    "knowledge reference pointer must be a string",
  );

  return {
    moduleId: reference.moduleId,
    resourceId: reference.resourceId,
    ...(typeof reference.recordId === "string" ? { recordId: reference.recordId } : {}),
    ...(typeof reference.pointer === "string" ? { pointer: reference.pointer } : {}),
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findIndexes(directory: string, excludedDirectory: string): Promise<string[]> {
  const indexes: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === excludedDirectory) continue;
      indexes.push(...(await findIndexes(path, excludedDirectory)));
    } else if (entry.isFile() && entry.name === "index.json") {
      indexes.push(path);
    }
  }
  return indexes;
}

export function resolveJsonPointer(value: unknown, pointer: string): unknown {
  assert(typeof pointer === "string", "JSON Pointer must be a string");
  if (pointer === "") return value;
  assert(pointer.startsWith("/"), `invalid JSON Pointer '${pointer}'`);

  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => {
      assert(
        current !== null && current !== undefined,
        `JSON Pointer '${pointer}' has no '${segment}'`,
      );
      assert(typeof current === "object", `JSON Pointer '${pointer}' has no '${segment}'`);
      assert(Object.hasOwn(current, segment), `JSON Pointer '${pointer}' has no '${segment}'`);
      return (current as Record<string, unknown>)[segment];
    }, value);
}

export async function loadKnowledgeModule(
  repositoryRoot: string,
  moduleId: string,
): Promise<LoadedKnowledgeModule> {
  const knowledgeRoot = resolve(repositoryRoot, "knowledge");
  const schemaRoot = resolve(knowledgeRoot, "schema");
  const rootIndexPath = resolve(knowledgeRoot, "index.json");

  if (await isFile(rootIndexPath)) {
    const rootIndex = parseJson(await readFile(rootIndexPath, "utf8"));
    if (
      isRecord(rootIndex) &&
      rootIndex.knowledgeVersion === "0.4" &&
      rootIndex.moduleId === "knowledge"
    ) {
      assert(isKnowledgeModuleIndex(rootIndex, "knowledge"), "root knowledge index is invalid");
      if (moduleId === "knowledge") {
        return { index: rootIndex, indexPath: rootIndexPath, directory: knowledgeRoot };
      }

      const catalogResource = rootIndex.resources.find(
        (resource) => resource.id === "knowledge-module-catalog",
      );
      assert(catalogResource, "root knowledge index has no knowledge-module-catalog resource");
      const catalogPath = resolve(knowledgeRoot, catalogResource.path);
      const catalogRelation = relative(knowledgeRoot, catalogPath);
      assert(
        catalogRelation !== "" &&
          catalogRelation !== ".." &&
          !catalogRelation.startsWith(`..${sep}`),
        "root knowledge catalog path escapes knowledge",
      );
      const catalog = parseJson(await readFile(catalogPath, "utf8"));
      assert(
        isRecord(catalog) && Array.isArray(catalog.modules),
        "root knowledge catalog is invalid",
      );
      const entries = catalog.modules.filter(
        (entry): entry is Record<string, unknown> => isRecord(entry) && entry.moduleId === moduleId,
      );
      assert(
        entries.length > 0,
        `v0.4 knowledge module '${moduleId}' is absent from the root catalog`,
      );
      assert(
        entries.length === 1,
        `v0.4 knowledge module '${moduleId}' is duplicated in the root catalog`,
      );
      const entry = entries[0];
      assert(
        entry !== undefined && typeof entry.indexPath === "string",
        `catalog index for '${moduleId}' is invalid`,
      );

      const indexPath = resolve(knowledgeRoot, entry.indexPath);
      const indexRelation = relative(knowledgeRoot, indexPath);
      assert(
        indexRelation !== "" && indexRelation !== ".." && !indexRelation.startsWith(`..${sep}`),
        `catalog index for '${moduleId}' escapes knowledge`,
      );
      assert(await isFile(indexPath), `catalog index for '${moduleId}' is missing`);
      const index = parseJson(await readFile(indexPath, "utf8"));
      assert(
        isKnowledgeModuleIndex(index, moduleId),
        `catalog index for '${moduleId}' has the wrong identity`,
      );
      return { index, indexPath, directory: dirname(indexPath) };
    }
  }

  const matches: LoadedKnowledgeModule[] = [];

  for (const indexPath of await findIndexes(knowledgeRoot, schemaRoot)) {
    const index = parseJson(await readFile(indexPath, "utf8"));
    if (isKnowledgeModuleIndex(index, moduleId)) {
      matches.push({ index, indexPath, directory: dirname(indexPath) });
    }
  }

  assert(matches.length > 0, `v0.4 knowledge module '${moduleId}' was not found`);
  assert(matches.length === 1, `v0.4 knowledge module '${moduleId}' is duplicated`);
  const match = matches[0];
  assert(match !== undefined, `v0.4 knowledge module '${moduleId}' was not found`);
  return match;
}

export async function resolveKnowledgeResource(
  repositoryRoot: string,
  referenceInput: unknown,
): Promise<ResolvedKnowledgeResource> {
  const reference = parseKnowledgeReference(referenceInput);
  const module = await loadKnowledgeModule(repositoryRoot, reference.moduleId);
  const resource = module.index.resources.find(
    (candidate) => candidate.id === reference.resourceId,
  );
  assert(
    resource,
    `knowledge resource '${reference.moduleId}:${reference.resourceId}' was not found`,
  );

  const path = resolve(module.directory, resource.path);
  const relation = relative(module.directory, path);
  assert(
    relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`),
    "knowledge resource path escapes its module",
  );
  assert(
    await isFile(path),
    `knowledge resource '${reference.moduleId}:${reference.resourceId}' is missing`,
  );
  return { ...module, resource, path };
}

export async function loadKnowledgeReference(
  repositoryRoot: string,
  referenceInput: unknown,
): Promise<LoadedKnowledgeReference> {
  const reference = parseKnowledgeReference(referenceInput);
  const resolved = await resolveKnowledgeResource(repositoryRoot, reference);
  const contents = await readFile(resolved.path, "utf8");
  const document = extname(resolved.path) === ".json" ? parseJson(contents) : contents;
  let value: unknown = document;

  if (reference.recordId !== undefined) {
    assert(isRecord(document), "record references require a JSON resource");
    assert(
      Array.isArray(resolved.resource.recordIds) &&
        resolved.resource.recordIds.includes(reference.recordId),
      `record '${reference.recordId}' is not declared by resource '${reference.resourceId}'`,
    );
    if (document.id === reference.recordId) {
      value = document;
    } else {
      assert(
        typeof resolved.resource.recordCollectionPointer === "string",
        `resource '${reference.resourceId}' needs recordCollectionPointer to resolve '${reference.recordId}'`,
      );
      const collection = resolveJsonPointer(document, resolved.resource.recordCollectionPointer);
      assert(
        Array.isArray(collection),
        `resource '${reference.resourceId}' record collection is not an array`,
      );
      const matches = collection.filter(
        (record): record is Record<string, unknown> =>
          isRecord(record) && record.id === reference.recordId,
      );
      assert(matches.length === 1, `record '${reference.recordId}' did not resolve uniquely`);
      const match = matches[0];
      assert(match !== undefined, `record '${reference.recordId}' did not resolve uniquely`);
      value = match;
    }
  }

  if (reference.pointer !== undefined) value = resolveJsonPointer(value, reference.pointer);
  return { ...resolved, document, value };
}
