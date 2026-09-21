import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { object, objects, parseJson, text, texts, type JsonObject } from "./json.ts";
import { readContextFile, contextDigest } from "./context-files.ts";

export type MemoryScope = "shared" | "local";
export interface MemorySelection {
  readonly scope: MemoryScope;
  readonly directory: string;
  readonly present: boolean;
  readonly entries: readonly JsonObject[];
}

// This interpreter is intentionally limited to the keywords used by the owning
// memory schemas. New keywords fail explicitly until their behavior is implemented.
function schemaErrors(value: unknown, schema: JsonObject, at: string): string[] {
  const supported = new Set([
    "$schema",
    "$id",
    "title",
    "type",
    "additionalProperties",
    "required",
    "properties",
    "const",
    "enum",
    "pattern",
    "minLength",
    "maxLength",
    "format",
    "items",
    "uniqueItems",
    "minItems",
    "allOf",
    "if",
    "then",
  ]);
  for (const key of Object.keys(schema))
    if (!supported.has(key)) throw new Error(`Unsupported memory schema keyword: ${key}`);
  const errors: string[] = [];
  const fail = (reason: string) => errors.push(`${at}: ${reason}`);
  if ("const" in schema && value !== schema.const) fail("unexpected constant");
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) fail("unexpected enum value");
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      fail("expected object");
      return errors;
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      fail("expected array");
      return errors;
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") {
      fail("expected string");
      return errors;
    }
  } else if (schema.type !== undefined) throw new Error("Unsupported memory schema type");
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) fail("too short");
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) fail("too long");
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value))
      fail("invalid shape");
    if (schema.format === "date") {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        fail("invalid date");
    } else if (schema.format !== undefined) throw new Error("Unsupported memory schema format");
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      fail("too few items");
    if (
      schema.uniqueItems === true &&
      new Set(value.map((item: unknown) => JSON.stringify(item))).size !== value.length
    )
      fail("duplicate items");
    if (schema.items)
      for (const [index, item] of value.entries())
        errors.push(...schemaErrors(item, object(schema.items, "items schema"), `${at}/${index}`));
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = object(value, at);
    const properties = object(schema.properties ?? {}, "schema properties");
    for (const key of texts(schema.required ?? [], "required fields"))
      if (!Object.hasOwn(record, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(record)) {
      if (Object.hasOwn(properties, key))
        errors.push(...schemaErrors(item, object(properties[key], key), `${at}/${key}`));
      else if (schema.additionalProperties === false) fail(`unknown field ${key}`);
    }
  }
  for (const branch of objects(schema.allOf ?? [], "schema allOf"))
    errors.push(...schemaErrors(value, branch, at));
  if (schema.if && schemaErrors(value, object(schema.if, "if schema"), at).length === 0)
    errors.push(...schemaErrors(value, object(schema.then, "then schema"), at));
  return errors;
}

async function validate(
  root: string,
  value: unknown,
  kind: "entry" | "index",
): Promise<JsonObject> {
  const path = `agents/memory/schema/memory-${kind}.schema.json`;
  const raw = await readContextFile(root, path);
  if (raw === undefined) throw new Error(`Missing memory schema: ${path}`);
  const errors = schemaErrors(value, object(parseJson(raw, path), path), kind);
  if (errors.length) throw new Error(`Invalid memory ${kind}: ${errors.join("; ")}`);
  return object(value, kind);
}

export async function memoryIndex(root: string, scope: MemoryScope): Promise<MemorySelection> {
  const directory = scope === "shared" ? "agents/memory/seed" : ".mdk/memory";
  const raw = await readContextFile(root, `${directory}/index.json`, true);
  if (raw === undefined) return { scope, directory, present: false, entries: [] };
  const index = await validate(root, parseJson(raw, "memory index"), "index");
  if (index.scope !== scope) throw new Error("Memory index scope mismatch");
  const entries = objects(index.entries, "memory entries");
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = text(entry.id, "memory ID");
    if (ids.has(id) || entry.path !== `${id}.json`)
      throw new Error("Duplicate memory ID or incorrect entry filename");
    if (scope === "shared" && entry.status === "discovered")
      throw new Error("Discovered memory must remain local");
    ids.add(id);
  }
  return { scope, directory, present: true, entries };
}

export async function readMemory(
  root: string,
  scope: MemoryScope,
  id: string,
): Promise<{
  path: string;
  sha256: string;
  authority: string;
  scope: MemoryScope;
  entry: JsonObject;
}> {
  const index = await memoryIndex(root, scope);
  const metadata = index.entries.find((entry) => entry.id === id);
  if (!metadata) throw new Error(`Memory entry is not indexed in ${scope}: ${id}`);
  const path = `${index.directory}/${text(metadata.path, "memory path")}`;
  const raw = await readContextFile(root, path);
  if (raw === undefined) throw new Error(`Missing memory: ${id}`);
  const entry = await validate(root, parseJson(raw, path), "entry");
  for (const key of ["id", "domain", "status", "title"])
    if (entry[key] !== metadata[key]) throw new Error(`Memory index/entry mismatch: ${id}.${key}`);
  return { path, sha256: contextDigest(raw), authority: "supporting-context", scope, entry };
}

/** Validate both stores without importing provider state or fetching source URLs. */
export async function checkMemory(
  root: string,
  scopes: readonly MemoryScope[],
): Promise<{
  valid: boolean;
  stores: { scope: MemoryScope; present: boolean; entries: number }[];
  sourceVerification: string;
  networkRequests: number;
}> {
  const results = [];
  for (const scope of scopes) {
    const index = await memoryIndex(root, scope);
    if (!index.present) {
      // A missing index is empty only when no entry files were left behind.
      let files: string[] = [];
      try {
        files = await readdir(resolve(root, index.directory));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      if (files.some((file) => file.endsWith(".json")))
        throw new Error(`Unindexed memory in ${scope}`);
    } else {
      const expected = new Set([
        "index.json",
        ...index.entries.map((entry) => text(entry.path, "entry path")),
      ]);
      const files = await readdir(resolve(root, index.directory));
      if (files.some((file) => file.endsWith(".json") && !expected.has(file)))
        throw new Error(`Unindexed memory in ${scope}`);
      for (const entry of index.entries) await readMemory(root, scope, text(entry.id, "entry ID"));
    }
    results.push({ scope, present: index.present, entries: index.entries.length });
  }
  return { valid: true, stores: results, sourceVerification: "not-performed", networkRequests: 0 };
}
