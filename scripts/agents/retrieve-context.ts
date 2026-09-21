import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  contextAbi,
  contextCatalog,
  contextLinks,
  contextSource,
  contextWindow,
  findContext,
  readContext,
} from "../lib/context-retrieval.ts";
import { contextDigest, readContextFile } from "../lib/context-files.ts";
import { checkMemory, readMemory } from "../lib/memory-store.ts";
import type { KnowledgeReference } from "../lib/knowledge-reference.ts";

const help = `Offline contributor context (run from the repository root):
  pnpm context catalog [--module ID] [--limit N] [--offset N]
  pnpm context find --query TEXT [--module ID] [--memory-domain DOMAIN] [--local-memory]
  pnpm context read --module ID --resource ID [--record ID] [--pointer /field]
  pnpm context links --module ID --resource ID [--record ID]
  pnpm context source --module ID --resource ID [--file EXACT_SOURCE_PATH]
  pnpm context abi --module contracts --resource ID [--name NAME | --selector 0x12345678]
  pnpm context read-file --path RELATIVE_PATH [--start N] [--lines N]
  pnpm context memory-read --scope shared|local --id ID
  pnpm context memory-check [--local-memory]
Find: --limit 1..30 (default 8), --offset N, --include-deprecated.
Read windows: --start N (default 1), --lines 1..300 (default 80), --max-chars 100..30000 (default 8000).
All: --root PATH, --max-output-chars 2000..60000 (default 24000), --help.
No network, writes, provider indexes, or automatic freshness/identity verification.
Knowledge search covers canonical records and source catalogs; other indexed resources are metadata-only.
Memory summaries are searched only within --memory-domain or query-matched index metadata.
Use read-file for discovered docs/package references. Local memory requires explicit selection.`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean" },
      root: { type: "string" },
      module: { type: "string" },
      resource: { type: "string" },
      record: { type: "string" },
      pointer: { type: "string" },
      query: { type: "string" },
      "memory-domain": { type: "string" },
      "local-memory": { type: "boolean" },
      "include-deprecated": { type: "boolean" },
      scope: { type: "string" },
      id: { type: "string" },
      path: { type: "string" },
      file: { type: "string" },
      name: { type: "string" },
      selector: { type: "string" },
      start: { type: "string" },
      lines: { type: "string" },
      "max-chars": { type: "string" },
      "max-output-chars": { type: "string" },
      limit: { type: "string" },
      offset: { type: "string" },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(`${help}\n`);
  } else {
    const [command] = positionals;
    if (positionals.length !== 1 || !command) throw new Error("Provide one command; use --help");
    const root = resolve(values.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
    const number = (value: string | undefined, fallback: number): number => {
      if (value === undefined) return fallback;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error("Numeric options must be nonnegative safe integers");
      return Number(value);
    };
    const window = {
      start: number(values.start, 1),
      lines: number(values.lines, 80),
      maxChars: number(values["max-chars"], 8000),
    };
    const reference = (): KnowledgeReference => {
      if (!values.module || !values.resource)
        throw new Error("Provide --module and --resource from catalog/find results");
      return {
        moduleId: values.module,
        resourceId: values.resource,
        ...(values.record === undefined ? {} : { recordId: values.record }),
        ...(values.pointer === undefined ? {} : { pointer: values.pointer }),
      };
    };
    const allowed: Record<string, readonly string[]> = {
      catalog: ["module", "limit", "offset"],
      find: [
        "query",
        "module",
        "memory-domain",
        "local-memory",
        "include-deprecated",
        "offset",
        "limit",
      ],
      read: ["module", "resource", "record", "pointer", "start", "lines", "max-chars"],
      links: ["module", "resource", "record", "pointer"],
      source: ["module", "resource", "record", "pointer", "file", "start", "lines", "max-chars"],
      abi: ["module", "resource", "record", "pointer", "name", "selector"],
      "read-file": ["path", "start", "lines", "max-chars"],
      "memory-read": ["scope", "id", "start", "lines", "max-chars"],
      "memory-check": ["local-memory"],
    };
    const permitted = allowed[command];
    if (!permitted) throw new Error("Unknown command; use --help");
    for (const key of Object.keys(values))
      if (!["root", "max-output-chars", ...permitted].includes(key))
        throw new Error(`--${key} does not apply to ${command}`);
    let result: unknown;
    switch (command) {
      case "catalog": {
        const catalog = await contextCatalog(root, values.module);
        const entries = values.module
          ? catalog.map((entry) => ({
              moduleId: entry.moduleId,
              resourceId: entry.resource.id,
              role: entry.resource.role,
              path: entry.path,
              recordCount: entry.resource.recordIds?.length ?? 0,
              recordCollectionPointer: entry.resource.recordCollectionPointer,
            }))
          : [...new Set(catalog.map((entry) => entry.moduleId))].map((moduleId) => ({
              moduleId,
              resources: catalog.filter((entry) => entry.moduleId === moduleId).length,
            }));
        const offset = number(values.offset, 0),
          limit = number(values.limit, 20);
        if (limit < 1 || limit > 30) throw new Error("Use limit 1..30");
        result = {
          entries: entries.slice(offset, offset + limit),
          total: entries.length,
          complete: offset === 0 && entries.length <= limit,
          nextOffset: offset + limit < entries.length ? offset + limit : null,
        };
        break;
      }
      case "find":
        if (!values.query) throw new Error("Provide --query; use catalog to discover identifiers");
        result = await findContext(root, {
          query: values.query,
          ...(values.module ? { moduleId: values.module } : {}),
          ...(values["memory-domain"] ? { memoryDomain: values["memory-domain"] } : {}),
          localMemory: values["local-memory"] === true,
          includeDeprecated: values["include-deprecated"] === true,
          offset: number(values.offset, 0),
          limit: number(values.limit, 8),
        });
        break;
      case "read":
        result = await readContext(root, reference(), window);
        break;
      case "links":
        result = await contextLinks(root, reference());
        break;
      case "source":
        result = await contextSource(root, reference(), values.file, window);
        break;
      case "abi":
        result = await contextAbi(root, reference(), values.name, values.selector);
        break;
      case "read-file": {
        if (!values.path) throw new Error("Provide a previously discovered --path");
        if (
          !/^(?:docs|packages|scripts|agents|knowledge)\//.test(values.path) &&
          !/^[A-Z_]+\.md$/.test(values.path)
        )
          throw new Error(
            "read-file accepts contributor source/docs only; use memory-read for indexed memory",
          );
        if (
          values.path.split(/[\\/]/).some((part) => part === ".." || part.startsWith(".")) ||
          values.path.startsWith("docs/reviews/")
        )
          throw new Error("Private/traversal paths are outside read-file scope");
        const raw = await readContextFile(root, values.path);
        if (raw === undefined) throw new Error("Missing context file");
        result = {
          path: values.path,
          sha256: contextDigest(raw),
          authority: "file-owner",
          ...contextWindow(raw, window),
        };
        break;
      }
      case "memory-read": {
        if ((values.scope !== "shared" && values.scope !== "local") || !values.id)
          throw new Error("Provide --scope shared|local and an indexed --id");
        const { entry, ...metadata } = await readMemory(root, values.scope, values.id);
        result = { ...metadata, ...contextWindow(entry, window) };
        break;
      }
      case "memory-check":
        result = await checkMemory(root, values["local-memory"] ? ["shared", "local"] : ["shared"]);
        break;
    }
    const maxOutput = number(values["max-output-chars"], 24000);
    if (maxOutput < 2000 || maxOutput > 60000)
      throw new Error("max-output-chars must be 2000..60000");
    const output = JSON.stringify({ ok: true, data: result }, null, 2);
    if (output.length > maxOutput) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, code: "OutputTooLarge", totalChars: output.length, maxOutputChars: maxOutput, hint: "Narrow --module, --record, --pointer, --name, --selector, --limit or --lines. No partial JSON was emitted." })}\n`,
      );
      process.exitCode = 1;
    } else process.stdout.write(`${output}\n`);
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Context retrieval failed" })}\n`,
  );
  process.exitCode = 1;
}
