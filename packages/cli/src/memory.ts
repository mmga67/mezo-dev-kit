import { readdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { arrayValue, digest, jsonText, record, textValue } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";
import { atomicWrite, containedPath, parseJson, readOptional, readRequired } from "./filesystem.ts";

/** The provider-neutral entry shape is owned by agents/memory/schema/memory-entry.schema.json. */
export interface MemoryEntry {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly domain: string;
  readonly status: "discovered" | "verified" | "promoted" | "deprecated";
  readonly title: string;
  readonly summary: string;
  readonly sources: readonly string[];
  readonly related: readonly string[];
  readonly updated: string;
}
export type MemoryScope = "local" | "shared";
type MemoryResult =
  | {
      readonly scope: MemoryScope;
      readonly id: string;
      readonly path: string;
      readonly changed: boolean;
      readonly dryRun: boolean;
    }
  | { readonly scope: MemoryScope; readonly entry: MemoryEntry }
  | {
      readonly scope: MemoryScope;
      readonly entries: number;
      readonly valid: true;
      readonly note: string;
    }
  | {
      readonly scope: MemoryScope;
      readonly total: number;
      readonly entries: readonly Pick<
        MemoryEntry,
        "id" | "domain" | "title" | "status" | "updated"
      >[];
      readonly truncated: boolean;
    };

export function parseMemoryEntry(value: unknown): MemoryEntry {
  const item = record(value, "memory entry");
  const required = [
    "schemaVersion",
    "id",
    "domain",
    "status",
    "title",
    "summary",
    "sources",
    "related",
    "updated",
  ];
  if (
    item.schemaVersion !== 1 ||
    Object.keys(item).length !== required.length ||
    required.some((key) => !Object.hasOwn(item, key))
  )
    throw new CliError("InvalidInput", "Expected a v1 provider-neutral memory entry");
  function bounded(value: unknown, label: string, limit: number): string {
    const result = textValue(value, label);
    if ([...result].length > limit)
      throw new CliError("InvalidInput", `${label} exceeds ${limit} characters`);
    return result;
  }
  const id = bounded(item.id, "memory ID", 80);
  const domain = bounded(item.domain, "memory domain", 120);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(domain))
    throw new CliError("InvalidInput", "Invalid memory identity or domain");
  const status = item.status;
  if (
    status !== "discovered" &&
    status !== "verified" &&
    status !== "promoted" &&
    status !== "deprecated"
  )
    throw new CliError("InvalidInput", "Invalid memory lifecycle status");
  function pointers(value: unknown): readonly string[] {
    const items = arrayValue(value, "memory pointers").map((value) =>
      bounded(value, "source pointer", 500),
    );
    if (items.length > 100 || new Set(items).size !== items.length)
      throw new CliError("InvalidInput", "Memory pointers must be bounded and unique");
    return items;
  }
  const sources = pointers(item.sources),
    related = pointers(item.related);
  if (
    ((status === "verified" || status === "promoted") && !sources.length) ||
    (status === "promoted" && !related.length)
  )
    throw new CliError(
      "InvalidInput",
      "Verified memories need sources; promoted memories also need canonical destination pointers",
    );
  const updated = textValue(item.updated, "updated date");
  const date = new Date(`${updated}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(updated) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== updated
  )
    throw new CliError("InvalidInput", "Memory updated must be a real YYYY-MM-DD date");
  return {
    schemaVersion: 1,
    id,
    domain,
    status,
    title: bounded(item.title, "memory title", 120),
    summary: bounded(item.summary, "memory summary", 800),
    sources,
    related,
    updated,
  };
}

function directory(scope: MemoryScope): string {
  return scope === "local" ? ".mdk/memory" : "docs/mdk-memory";
}

async function entries(project: string, scope: MemoryScope): Promise<readonly MemoryEntry[]> {
  const root = directory(scope);
  const paths = await readdir(await containedPath(project, root)).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  if (paths.length > 2001)
    throw new CliError(
      "InvalidInput",
      "Memory store exceeds 2000 entries; curate it before retrieval",
    );
  const result: MemoryEntry[] = [];
  for (const path of paths.sort()) {
    if (path === ".gitignore") continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path))
      throw new CliError("InvalidInput", `Unexpected memory file: ${path}`);
    const bytes = await readRequired(project, `${root}/${path}`);
    if (bytes.length > 65536)
      throw new CliError("InvalidInput", `Memory entry exceeds the local file bound: ${path}`);
    const entry = parseMemoryEntry(parseJson(bytes, "memory entry"));
    if (path !== `${entry.id}.json`)
      throw new CliError("InvalidInput", `Memory file identity differs: ${path}`);
    result.push(entry);
  }
  return result;
}

/** App-owned entries are never managed or overwritten by guidance synchronization. */
export async function memoryCommand(
  project: string,
  action: string,
  options: {
    readonly scope: MemoryScope;
    readonly query?: string;
    readonly id?: string;
    readonly file?: string;
    readonly domain?: string;
    readonly dryRun?: boolean;
  },
): Promise<MemoryResult> {
  const all = await entries(project, options.scope);
  if (action === "save") {
    if (!options.file) throw new CliError("InvalidInput", "Use memory save --file <entry.json>");
    const entry = parseMemoryEntry(
      parseJson(await readRequired(dirname(options.file), basename(options.file)), "memory entry"),
    );
    if (options.scope === "shared" && entry.status === "discovered")
      throw new CliError(
        "InvalidInput",
        "Keep unverified observations local; shared memory requires reviewed, sourced context",
      );
    const path = `${directory(options.scope)}/${entry.id}.json`;
    const before = await readOptional(project, path);
    const bytes = Buffer.from(jsonText(entry));
    if (bytes.length > 65536 || (all.length >= 2000 && !before))
      throw new CliError(
        "InvalidInput",
        "Memory exceeds the entry or store bound; curate it before saving",
      );
    const changed = !before || digest(before) !== digest(bytes);
    if (!options.dryRun && changed) {
      if (options.scope === "local") {
        const ignore = await readOptional(project, ".mdk/memory/.gitignore");
        if (ignore && ignore.toString("utf8").trim() !== "*")
          throw new CliError(
            "Conflict",
            "Local memory ignore policy was customized; preserve a standalone '*' rule before saving",
          );
        if (!ignore) await atomicWrite(project, ".mdk/memory/.gitignore", Buffer.from("*\n"));
      }
      const now = await readOptional(project, path);
      if (before === null ? now !== null : now === null || digest(before) !== digest(now))
        throw new CliError("Conflict", "Memory changed during save; review it before retrying");
      await atomicWrite(project, path, bytes);
    }
    return { scope: options.scope, id: entry.id, path, changed, dryRun: options.dryRun === true };
  }
  if (action === "show") {
    const entry = all.find((item) => item.id === options.id);
    if (!entry) throw new CliError("Unavailable", "Memory ID was not found in the selected scope");
    return { scope: options.scope, entry };
  }
  if (action === "check")
    return {
      scope: options.scope,
      entries: all.length,
      valid: true,
      note: "Structure checked; source truth, freshness and privacy require review.",
    };
  const terms = (options.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = all.filter(
    (item) =>
      item.status !== "deprecated" &&
      (!options.domain ||
        item.domain === options.domain ||
        item.domain.startsWith(`${options.domain}/`)) &&
      terms.every((term) =>
        `${item.id} ${item.domain} ${item.title} ${item.summary}`.toLowerCase().includes(term),
      ),
  );
  return {
    scope: options.scope,
    total: matches.length,
    entries: matches
      .slice(0, 20)
      .map(({ id, domain, title, status, updated }) => ({ id, domain, title, status, updated })),
    truncated: matches.length > 20,
  };
}
