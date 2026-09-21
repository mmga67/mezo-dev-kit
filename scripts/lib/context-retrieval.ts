import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type * as Evm from "@mezo-dev-kit/evm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { object, objects, parseJson, text, type JsonObject } from "./json.ts";
import { contextDigest, readContextFile } from "./context-files.ts";
import {
  resolveKnowledgeResource,
  selectKnowledgeValue,
  type KnowledgeReference,
  type KnowledgeResource,
} from "./knowledge-reference.ts";
import { memoryIndex, readMemory } from "./memory-store.ts";

export interface ContextResource {
  readonly moduleId: string;
  readonly resource: KnowledgeResource;
  readonly path: string;
  readonly envelope: JsonObject;
}

interface ContextMetadata {
  reference: KnowledgeReference;
  path: string;
  sha256: string;
  role: unknown;
  moduleEnvelope: JsonObject;
  resourceEnvelope: JsonObject;
  selectedEnvelope: JsonObject;
  evidenceVerification: string;
}
interface ContextWindow {
  content: string;
  start: number;
  returnedLines: number;
  totalLines: number;
  complete: boolean;
  nextStart: number | null;
  hint?: string;
}
interface FindResult {
  query: string;
  results: ContextHit[];
  totalMatches: number;
  complete: boolean;
  nextOffset: number | null;
  coverage: {
    module: string;
    indexedResources: number;
    contentResources: number;
    otherResources: string;
    memory: {
      scope: string;
      present: boolean;
      indexed: number;
      entriesSearched: number;
      selection: string;
    }[];
    localMemory: string;
    docs: string;
    networkRequests: number;
  };
}
interface AbiMatch {
  signature: string;
  selector: string | null;
  topic: string | null;
  entry: JsonObject;
}

const envelopeKeys = [
  "status",
  "supportStatus",
  "reviewStatus",
  "verifiedAt",
  "reviewAfter",
  "scope",
  "limitations",
];
function envelope(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = object(value, "envelope");
  return Object.fromEntries(
    envelopeKeys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]),
  );
}

async function jsonFile(root: string, path: string): Promise<JsonObject> {
  const raw = await readContextFile(root, path);
  if (raw === undefined) throw new Error(`Missing context file: ${path}`);
  return object(parseJson(raw, path), path);
}

/** Resolve only the current root catalog. Unindexed files never silently enter the corpus. */
export async function contextCatalog(root: string, moduleId?: string): Promise<ContextResource[]> {
  const knowledgeRoot = resolve(root, "knowledge");
  const index = await jsonFile(knowledgeRoot, "index.json");
  if (index.knowledgeVersion !== "0.4" || index.moduleId !== "knowledge")
    throw new Error("Root knowledge identity mismatch");
  const resource = objects(index.resources, "root resources").find(
    (entry) => entry.id === "knowledge-module-catalog",
  );
  if (!resource) throw new Error("Missing knowledge-module-catalog");
  const catalog = await jsonFile(knowledgeRoot, text(resource.path, "catalog path"));
  const modules = objects(catalog.modules, "knowledge modules");
  const ids = modules.map((entry) => text(entry.moduleId, "module ID"));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate knowledge module ID");
  if (moduleId && !ids.includes(moduleId))
    throw new Error(`Unknown module: ${moduleId}; use catalog`);
  const result: ContextResource[] = [];
  for (const module of modules.filter((entry) => !moduleId || entry.moduleId === moduleId)) {
    const id = text(module.moduleId, "module ID");
    const modulePath = text(module.indexPath, "module index path");
    const indexPath = relative(root, resolve(knowledgeRoot, modulePath));
    const moduleIndex = await jsonFile(knowledgeRoot, modulePath);
    if (moduleIndex.moduleId !== id || moduleIndex.knowledgeVersion !== "0.4")
      throw new Error("Knowledge module identity mismatch");
    const resources = objects(moduleIndex.resources, "module resources");
    const seen = new Set<string>();
    for (const entry of resources) {
      const resourceId = text(entry.id, "resource ID");
      if (seen.has(resourceId)) throw new Error(`Duplicate resource: ${id}:${resourceId}`);
      seen.add(resourceId);
      const resource: KnowledgeResource = {
        ...entry,
        id: resourceId,
        path: text(entry.path, "resource path"),
      };
      const directory = resolve(root, dirname(indexPath));
      const localPath = relative(directory, resolve(directory, resource.path));
      if (
        !localPath ||
        isAbsolute(localPath) ||
        localPath === ".." ||
        localPath.startsWith(`..${sep}`)
      )
        throw new Error(`Resource path escapes module: ${id}:${resourceId}`);
      if (entry.recordIds !== undefined) {
        if (
          !Array.isArray(entry.recordIds) ||
          !entry.recordIds.every((item) => typeof item === "string")
        )
          throw new Error("Invalid record IDs");
        resource.recordIds = entry.recordIds;
      }
      if (entry.recordCollectionPointer !== undefined)
        resource.recordCollectionPointer = text(
          entry.recordCollectionPointer,
          "record collection pointer",
        );
      result.push({
        moduleId: id,
        resource,
        path: relative(root, resolve(root, dirname(indexPath), resource.path)),
        envelope: envelope(moduleIndex),
      });
    }
  }
  return result;
}

async function loadResource(root: string, reference: KnowledgeReference) {
  const catalog = await contextCatalog(root, reference.moduleId);
  const selected = catalog.find((entry) => entry.resource.id === reference.resourceId);
  if (!selected)
    throw new Error(
      `Unknown resource: ${reference.resourceId}; use catalog --module ${reference.moduleId}`,
    );
  // Check the selected file before the shared resolver accesses it.
  const raw = await readContextFile(root, selected.path);
  if (raw === undefined) throw new Error("Missing indexed resource");
  const resolved = await resolveKnowledgeResource(root, reference);
  if (resolve(root, selected.path) !== resolved.path)
    throw new Error("Resource identity changed during lookup");
  const document: unknown =
    extname(selected.path) === ".json" ? parseJson(raw, selected.path) : raw;
  const value = selectKnowledgeValue(document, resolved.resource, reference);
  const metadata: ContextMetadata = {
    reference,
    path: selected.path,
    sha256: contextDigest(raw),
    role: selected.resource.role,
    moduleEnvelope: {
      ...selected.envelope,
      scope: undefined,
      scopeLocator: { path: relative(root, resolved.indexPath), pointer: "/scope" },
    },
    resourceEnvelope: envelope(document),
    selectedEnvelope: envelope(value),
    evidenceVerification: "not-performed",
  };
  return { metadata, document, value };
}

export interface WindowOptions {
  readonly start?: number;
  readonly lines?: number;
  readonly maxChars?: number;
}
export function contextWindow(value: unknown, options: WindowOptions = {}): ContextWindow {
  const start = options.start ?? 1;
  const lines = options.lines ?? 80;
  const maxChars = options.maxChars ?? 8000;
  if (
    ![start, lines, maxChars].every(Number.isSafeInteger) ||
    start < 1 ||
    lines < 1 ||
    lines > 300 ||
    maxChars < 100 ||
    maxChars > 30000
  )
    throw new Error("Use start >= 1, lines 1..300 and max-chars 100..30000");
  const source = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (source === undefined) throw new Error("Selected value is unavailable");
  const allLines = source.split("\n");
  if (start > allLines.length) throw new Error(`Start exceeds ${allLines.length} lines`);
  const selected: string[] = [];
  let chars = 0;
  for (const line of allLines.slice(start - 1, start - 1 + lines)) {
    if (chars + line.length + 1 > maxChars) break;
    selected.push(line);
    chars += line.length + 1;
  }
  const next = start + selected.length;
  return {
    content: selected.join("\n"),
    start,
    returnedLines: selected.length,
    totalLines: allLines.length,
    complete: start === 1 && next > allLines.length,
    nextStart: selected.length > 0 && next <= allLines.length ? next : null,
    ...(selected.length === 0
      ? {
          hint: "One line exceeds max-chars; select a JSON pointer, source file, or smaller field.",
        }
      : {}),
  };
}

export async function readContext(
  root: string,
  reference: KnowledgeReference,
  options: WindowOptions = {},
): Promise<ContextMetadata & ContextWindow> {
  const { value, metadata } = await loadResource(root, reference);
  return { ...metadata, ...contextWindow(value, options) };
}

export interface FindOptions {
  readonly query: string;
  readonly moduleId?: string;
  readonly memoryDomain?: string;
  readonly localMemory?: boolean;
  readonly includeDeprecated?: boolean;
  readonly offset?: number;
  readonly limit?: number;
}
interface ContextHit {
  id: string;
  path: string;
  kind: string;
  excerpt: string;
  score: number;
  reference?: KnowledgeReference;
  metadata: JsonObject;
}
function excerpt(source: string, terms: readonly string[]): string {
  const lower = source.toLowerCase();
  const first = Math.min(...terms.map((term) => lower.indexOf(term)).filter((at) => at >= 0));
  const start = Number.isFinite(first) ? Math.max(0, first - 70) : 0;
  return source.slice(start, start + 300).replace(/\s+/g, " ");
}

export async function findContext(root: string, options: FindOptions): Promise<FindResult> {
  const terms = options.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length || options.query.length > 300)
    throw new Error("Provide a nonempty query of at most 300 characters");
  const offset = options.offset ?? 0,
    limit = options.limit ?? 8;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 30
  )
    throw new Error("Use offset >= 0 and limit 1..30");
  const hits: ContextHit[] = [];
  const catalog = await contextCatalog(root, options.moduleId);
  let contentResources = 0;
  const add = (hit: Omit<ContextHit, "score" | "excerpt">, source: string, label: string) => {
    const haystack = `${label} ${source}`.toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return;
    const score = terms.reduce(
      (sum, term) => sum + (label.toLowerCase().includes(term) ? 10 : 1),
      0,
    );
    hits.push({ ...hit, score, excerpt: excerpt(source, terms) });
  };
  for (const item of catalog) {
    const base = { moduleId: item.moduleId, resourceId: item.resource.id };
    const id = `${item.moduleId}:${item.resource.id}`;
    const kind = typeof item.resource.kind === "string" ? item.resource.kind : "";
    const label = `${id} ${item.path} ${kind} ${(item.resource.recordIds ?? []).join(" ")}`;
    if (!["canonical-record", "source-catalog"].includes(String(item.resource.role))) {
      add(
        {
          id,
          path: item.path,
          kind: "knowledge-metadata",
          reference: base,
          metadata: { role: item.resource.role, contentSearched: false },
        },
        "",
        label,
      );
      continue;
    }
    const raw = await readContextFile(root, item.path);
    if (raw === undefined) throw new Error(`Missing indexed resource: ${id}`);
    const document: unknown = extname(item.path) === ".json" ? parseJson(raw, item.path) : raw;
    contentResources++;
    const recordIds = item.resource.recordIds ?? [];
    const selections: KnowledgeReference[] = recordIds.length
      ? recordIds.map((recordId) => ({ ...base, recordId }))
      : [base];
    // Search the envelope separately so collection-level facts remain discoverable.
    if (recordIds.length)
      add(
        {
          id,
          path: item.path,
          kind: "knowledge",
          reference: base,
          metadata: { ...envelope(document), sha256: contextDigest(raw) },
        },
        JSON.stringify(envelope(document)),
        `${id} ${item.path}`,
      );
    for (const reference of selections) {
      const value = selectKnowledgeValue(document, item.resource, reference);
      const recordId = reference.recordId ? `${id}#${reference.recordId}` : id;
      add(
        {
          id: recordId,
          path: item.path,
          kind: "knowledge",
          reference,
          metadata: {
            role: item.resource.role,
            ...envelope(document),
            ...envelope(value),
            sha256: contextDigest(raw),
          },
        },
        JSON.stringify(value),
        `${recordId} ${item.path}`,
      );
    }
  }
  const memoryCoverage = [];
  for (const scope of options.localMemory
    ? (["shared", "local"] as const)
    : (["shared"] as const)) {
    const index = await memoryIndex(root, scope);
    let selected = 0;
    for (const entry of index.entries) {
      if (!options.includeDeprecated && entry.status === "deprecated") continue;
      const domain = text(entry.domain, "memory domain");
      if (
        options.memoryDomain &&
        domain !== options.memoryDomain &&
        !domain.startsWith(`${options.memoryDomain}/`)
      )
        continue;
      const memoryId = text(entry.id, "memory ID");
      const label = `${memoryId} ${domain} ${text(entry.title, "memory title")}`;
      if (!options.memoryDomain && !terms.some((term) => label.toLowerCase().includes(term)))
        continue;
      const memory = await readMemory(root, scope, text(entry.id, "memory ID"));
      selected++;
      add(
        {
          id: `memory:${scope}:${memoryId}`,
          path: memory.path,
          kind: "memory",
          metadata: {
            ...memory.entry,
            summary: undefined,
            sources: undefined,
            related: undefined,
            authority: memory.authority,
            sha256: memory.sha256,
          },
        },
        JSON.stringify(memory.entry),
        label,
      );
    }
    memoryCoverage.push({
      scope,
      present: index.present,
      indexed: index.entries.length,
      entriesSearched: selected,
      selection: options.memoryDomain ?? "query-matched index metadata",
    });
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const found = hits.slice(offset, offset + limit);
  return {
    query: options.query,
    results: found,
    totalMatches: hits.length,
    complete: offset === 0 && hits.length <= limit,
    nextOffset: offset + found.length < hits.length ? offset + found.length : null,
    coverage: {
      module: options.moduleId ?? "all indexed modules",
      indexedResources: catalog.length,
      contentResources,
      otherResources: "metadata only; use read/source/abi",
      memory: memoryCoverage,
      localMemory: options.localMemory ? "included" : "not searched",
      docs: "not searched; use file listing and read-file",
      networkRequests: 0,
    },
  };
}

export async function contextLinks(
  root: string,
  reference: KnowledgeReference,
): Promise<{
  reference: KnowledgeReference;
  links: KnowledgeReference[];
  coverage: string;
  networkRequests: number;
}> {
  const loaded = await loadResource(root, reference);
  const links = new Map<string, KnowledgeReference>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const item = object(value, "reference candidate");
    if (typeof item.moduleId === "string" && typeof item.resourceId === "string") {
      const target: KnowledgeReference = { moduleId: item.moduleId, resourceId: item.resourceId };
      if (typeof item.recordId === "string") target.recordId = item.recordId;
      if (typeof item.pointer === "string") target.pointer = item.pointer;
      links.set(JSON.stringify(target), target);
    }
    for (const entry of Object.values(item)) walk(entry);
  };
  walk(loaded.value);
  return {
    reference,
    links: [...links.values()],
    coverage:
      "direct logical references only; string evidence locators remain in the selected record",
    networkRequests: 0,
  };
}

export async function contextSource(
  root: string,
  reference: KnowledgeReference,
  file: string | undefined,
  options: WindowOptions,
): Promise<
  ContextMetadata &
    ({ files: { path: string; lines: number }[] } | (ContextWindow & { file: string }))
> {
  const { value, metadata } = await loadResource(root, reference);
  const bundle = object(value, "source bundle");
  const mainPath = text(bundle.file_path ?? bundle.filePath, "main source path");
  const sources = [
    { path: mainPath, content: text(bundle.source_code ?? bundle.sourceCode, "main source") },
    ...objects(
      bundle.additional_sources ?? bundle.additionalSources ?? [],
      "additional sources",
    ).map((entry) => ({
      path: text(entry.file_path, "source path"),
      content: text(entry.source_code, "source content"),
    })),
  ];
  if (new Set(sources.map((entry) => entry.path)).size !== sources.length)
    throw new Error("Duplicate source paths");
  if (!file)
    return {
      ...metadata,
      files: sources.map((entry) => ({
        path: entry.path,
        lines: entry.content.split("\n").length,
      })),
    };
  const selected = sources.find((entry) => entry.path === file);
  if (!selected)
    throw new Error("Source file not retained; run source without --file to list exact paths");
  return { ...metadata, file, ...contextWindow(selected.content, options) };
}

/** Inspect full canonical ABI entries. A selector match is a candidate, never proof of deployment identity. */
export async function contextAbi(
  root: string,
  reference: KnowledgeReference,
  name?: string,
  selector?: string,
): Promise<ContextMetadata & { matches: AbiMatch[]; interpretation: string }> {
  const { value, metadata } = await loadResource(root, reference);
  const abi = Array.isArray(value)
    ? objects(value, "ABI")
    : objects(object(value, "ABI artifact").abi, "ABI");
  // Honor this checkout's declared ESM public export, without a root dependency,
  // guessed dist path, deep import, or pnpm transitive-layout assumption.
  const packageRoot = fileURLToPath(new URL("../../packages/evm/", import.meta.url));
  const manifest = await jsonFile(packageRoot, "package.json");
  if (manifest.name !== "@mezo-dev-kit/evm") throw new Error("EVM package identity mismatch");
  const entry = text(
    object(object(manifest.exports, "package exports")["."], "public entry").import,
    "ESM entry",
  );
  const built = await readContextFile(packageRoot, entry, true);
  if (built === undefined)
    throw new Error("EVM public build is unavailable; run pnpm --filter @mezo-dev-kit/evm build");
  const loaded: unknown = await import(pathToFileURL(resolve(packageRoot, entry)).href);
  const exports = object(loaded, "EVM public exports");
  if (typeof exports.keccak256 !== "function" || typeof exports.parseHexData !== "function")
    throw new Error("EVM public build is unavailable; run pnpm --filter @mezo-dev-kit/evm build");
  const { keccak256, parseHexData } = exports as Pick<typeof Evm, "keccak256" | "parseHexData">;
  if (selector && parseHexData(selector).length !== 10)
    throw new Error("Selector must contain four bytes");
  const parameter = (value: JsonObject): string => {
    const type = text(value.type, "ABI input type");
    if (!type.startsWith("tuple")) return type;
    return `(${objects(value.components, "tuple components").map(parameter).join(",")})${type.slice(5)}`;
  };
  const entries = abi
    .filter((entry) => ["function", "event", "error"].includes(String(entry.type)))
    .map((entry) => {
      const signature = `${text(entry.name, "ABI name")}(${objects(entry.inputs, "ABI inputs").map(parameter).join(",")})`;
      const hash = keccak256(parseHexData(`0x${Buffer.from(signature).toString("hex")}`));
      return {
        signature,
        selector: entry.type === "event" ? null : hash.slice(0, 10),
        topic: entry.type === "event" ? hash : null,
        entry,
      };
    })
    .filter(
      (entry) =>
        (!name || entry.entry.name === name) &&
        (!selector || entry.selector === selector.toLowerCase()),
    );
  return {
    ...metadata,
    matches: entries,
    interpretation:
      "ABI candidates only; resolve the implementation at the requested coordinate before applying them",
  };
}
