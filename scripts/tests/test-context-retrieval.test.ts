import { afterEach, expect, test, vi } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  contextAbi,
  contextLinks,
  contextSource,
  contextWindow,
  findContext,
  readContext,
} from "../lib/context-retrieval.ts";
import { checkMemory, memoryIndex, readMemory } from "../lib/memory-store.ts";
import { readContextFile } from "../lib/context-files.ts";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function put(root: string, path: string, value: unknown) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), JSON.stringify(value));
}
const reference = {
  moduleId: "widgets",
  resourceId: "widget-observations",
  recordId: "small-widget",
};
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "mdk-context-"));
  roots.push(root);
  await put(root, "knowledge/index.json", {
    knowledgeVersion: "0.4",
    moduleId: "knowledge",
    resources: [{ id: "knowledge-module-catalog", path: "records/modules.json" }],
  });
  await put(root, "knowledge/records/modules.json", {
    modules: [{ moduleId: "widgets", indexPath: "widgets/index.json" }],
  });
  await put(root, "knowledge/widgets/index.json", {
    knowledgeVersion: "0.4",
    moduleId: "widgets",
    status: "verified",
    supportStatus: "none",
    resources: [
      {
        id: "widget-observations",
        path: "records/observations.json",
        role: "canonical-record",
        recordIds: ["small-widget", "large-widget"],
        recordCollectionPointer: "/items",
      },
      { id: "widget-source", path: "artifacts/source.json", role: "artifact" },
      { id: "widget-abi", path: "artifacts/abi.json", role: "artifact" },
    ],
  });
  await put(root, "knowledge/widgets/records/observations.json", {
    scope: { network: "synthetic" },
    status: "verified",
    items: [
      {
        id: "small-widget",
        detail: "yellow rotary assembly",
        optional: null,
        evidence: { moduleId: "widgets", resourceId: "widget-source" },
      },
      { id: "large-widget", detail: "yellow fixed assembly" },
    ],
  });
  await put(root, "knowledge/widgets/artifacts/source.json", {
    file_path: "Widget.sol",
    source_code: "line one\nline two",
    additional_sources: [
      { file_path: "lib/Detail.sol", source_code: "hiddenSourceNeedle\nlast line" },
    ],
  });
  await put(root, "knowledge/widgets/artifacts/abi.json", [
    {
      type: "function",
      name: "transfer",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "transfer",
      inputs: [{ name: "id", type: "uint256" }],
      outputs: [],
      stateMutability: "view",
    },
    { type: "error", name: "WidgetMissing", inputs: [] },
  ]);
  await cp(resolve(repository, "agents/memory/schema"), resolve(root, "agents/memory/schema"), {
    recursive: true,
  });
  return root;
}
async function memory(root: string, scope: "shared" | "local", status = "verified") {
  const directory = scope === "shared" ? "agents/memory/seed" : ".mdk/memory";
  const metadata = {
    id: "widget-routing",
    domain: "widgets",
    status,
    title: "Widget evidence routing",
    path: "widget-routing.json",
  };
  await put(root, `${directory}/index.json`, {
    schemaVersion: 1,
    kind: "memory-index",
    scope,
    entries: [metadata],
  });
  const entry = {
    schemaVersion: 1,
    id: metadata.id,
    domain: metadata.domain,
    status,
    title: metadata.title,
    summary: "Use the indexed owner for rotary assembly behavior; recheck after source changes.",
    sources: ["knowledge/widgets/index.json"],
    related: ["knowledge/widgets/index.json"],
    updated: "2026-09-15",
  };
  await put(root, `${directory}/widget-routing.json`, entry);
  return { directory, entry };
}

test("find searches record values, exposes coverage and pagination, and observes edited files without a stale index", async () => {
  const root = await fixture();
  const fetch = vi.fn(() => {
    throw new Error("Network forbidden");
  });
  vi.stubGlobal("fetch", fetch);
  const found = await findContext(root, { query: "yellow", limit: 1 });
  expect(found.totalMatches).toBe(2);
  expect(found.complete).toBe(false);
  expect(found.nextOffset).toBe(1);
  expect(found.results[0]?.reference?.recordId).toBeDefined();
  const next = await findContext(root, { query: "yellow", offset: 1, limit: 1 });
  expect(next.nextOffset).toBeNull();
  expect(next.results[0]?.id).not.toBe(found.results[0]?.id);
  expect((await findContext(root, { query: "hiddenSourceNeedle" })).totalMatches).toBe(0);
  expect(found.coverage.otherResources).toContain("metadata only");
  const before = await readContext(root, reference);
  await put(root, "knowledge/widgets/records/observations.json", {
    items: [{ id: "small-widget", detail: "new phrase" }, { id: "large-widget" }],
  });
  expect((await findContext(root, { query: "new phrase" })).totalMatches).toBe(1);
  expect((await readContext(root, reference)).sha256).not.toBe(before.sha256);
  expect(fetch).not.toHaveBeenCalled();
});

test("record and field selection uses the declared collection, keeps null distinct from missing and follows exact references", async () => {
  const root = await fixture();
  const result = await readContext(root, { ...reference, pointer: "/optional" });
  expect(result.content).toBe("null");
  expect(result.complete).toBe(true);
  expect(result.resourceEnvelope.scope).toEqual({ network: "synthetic" });
  await expect(readContext(root, { ...reference, pointer: "/missing" })).rejects.toThrow(
    "has no 'missing'",
  );
  await expect(readContext(root, { ...reference, recordId: "guessed-widget" })).rejects.toThrow(
    "not declared",
  );
  expect((await contextLinks(root, reference)).links).toEqual([
    { moduleId: "widgets", resourceId: "widget-source" },
  ]);
});

test("read windows provide continuation and never silently truncate a long line", () => {
  const first = contextWindow("one\ntwo\nthree", { lines: 2 });
  expect(first.content).toBe("one\ntwo");
  expect(first.nextStart).toBe(3);
  expect(first.complete).toBe(false);
  expect(contextWindow("x".repeat(9000)).hint).toContain("JSON pointer");
  expect(contextWindow("x".repeat(9000)).content).toBe("");
  expect(() => contextWindow("one", { start: 2 })).toThrow("exceeds");
});

test("source inspection lists retained paths, selects one file and rejects invented paths", async () => {
  const root = await fixture();
  const source = { moduleId: "widgets", resourceId: "widget-source" };
  const listing = await contextSource(root, source, undefined, {});
  expect("files" in listing && listing.files.map((entry) => entry.path)).toEqual([
    "Widget.sol",
    "lib/Detail.sol",
  ]);
  const selected = await contextSource(root, source, "lib/Detail.sol", { lines: 1 });
  expect("content" in selected && selected.content).toBe("hiddenSourceNeedle");
  expect(selected.evidenceVerification).toBe("not-performed");
  await expect(contextSource(root, source, "../guessed.sol", {})).rejects.toThrow("not retained");
});

test("ABI inspection preserves overloads and computes selector candidates without an RPC getter guess", async () => {
  const root = await fixture();
  const abi = { moduleId: "widgets", resourceId: "widget-abi" };
  expect((await contextAbi(root, abi, "transfer")).matches).toHaveLength(2);
  const matched = await contextAbi(root, abi, undefined, "0xa9059cbb");
  expect(matched.matches[0]?.signature).toBe("transfer(address,uint256)");
  expect((await contextAbi(root, abi, "guessedGetter")).matches).toEqual([]);
  await expect(contextAbi(root, abi, undefined, "0x01")).rejects.toThrow("four bytes");
});

test("memory remains optional, locally scoped and subordinate to canonical evidence", async () => {
  const root = await fixture();
  expect((await memoryIndex(root, "local")).present).toBe(false);
  await memory(root, "shared", "promoted");
  await memory(root, "local", "discovered");
  const found = await findContext(root, { query: "rotary", memoryDomain: "widgets" });
  expect(found.results.filter((entry) => entry.kind === "memory").map((entry) => entry.id)).toEqual(
    ["memory:shared:widget-routing"],
  );
  expect(found.results.find((entry) => entry.kind === "memory")?.metadata.authority).toBe(
    "supporting-context",
  );
  const local = await findContext(root, {
    query: "rotary",
    memoryDomain: "widgets",
    localMemory: true,
  });
  expect(local.results.filter((entry) => entry.kind === "memory")).toHaveLength(2);
  expect((await checkMemory(root, ["shared", "local"])).valid).toBe(true);
  await memory(root, "shared", "deprecated");
  expect(
    (await findContext(root, { query: "rotary", memoryDomain: "widgets" })).results.some(
      (entry) => entry.kind === "memory",
    ),
  ).toBe(false);
  expect(
    (
      await findContext(root, { query: "rotary", memoryDomain: "widgets", includeDeprecated: true })
    ).results.some((entry) => entry.kind === "memory"),
  ).toBe(true);
});

test("memory checks reject schema violations, index drift, unindexed entries and shared discoveries", async () => {
  const root = await fixture();
  const stored = await memory(root, "shared");
  await put(root, `${stored.directory}/widget-routing.json`, {
    ...stored.entry,
    updated: "2026-02-30",
  });
  await expect(checkMemory(root, ["shared"])).rejects.toThrow("invalid date");
  await put(root, `${stored.directory}/widget-routing.json`, {
    ...stored.entry,
    summary: "x".repeat(801),
  });
  await expect(checkMemory(root, ["shared"])).rejects.toThrow("too long");
  await put(root, `${stored.directory}/widget-routing.json`, {
    ...stored.entry,
    title: "Other title",
  });
  await expect(readMemory(root, "shared", "widget-routing")).rejects.toThrow(
    "index/entry mismatch",
  );
  await put(root, `${stored.directory}/widget-routing.json`, stored.entry);
  await put(root, `${stored.directory}/orphan.json`, stored.entry);
  await expect(checkMemory(root, ["shared"])).rejects.toThrow("Unindexed");
  await rm(resolve(root, `${stored.directory}/orphan.json`));
  await memory(root, "shared", "discovered");
  await expect(checkMemory(root, ["shared"])).rejects.toThrow("must remain local");
});

test("context reads reject symlinks and traversal without returning external contents", async () => {
  const root = await fixture();
  await symlink(
    resolve(root, "knowledge/widgets/records/observations.json"),
    resolve(root, "linked.json"),
  );
  await expect(readContextFile(root, "linked.json")).rejects.toThrow("symlink");
  await expect(readContextFile(root, "../outside.json")).rejects.toThrow("inside");
  await mkdir(resolve(root, ".mdk"));
  await symlink(resolve(root, "knowledge"), resolve(root, ".mdk/memory"));
  await expect(memoryIndex(root, "local")).rejects.toThrow("symlink");
});

test("search rejects broken catalog identities, escaped resource paths and missing indexed files", async () => {
  const root = await fixture();
  const path = "knowledge/widgets/index.json";
  const index: unknown = JSON.parse(await readFile(resolve(root, path), "utf8"));
  if (typeof index !== "object" || index === null || !("resources" in index))
    throw new Error("Fixture index missing");
  await put(root, path, {
    ...index,
    resources: [{ id: "escape", path: "../index.json", role: "canonical-record" }],
  });
  await expect(findContext(root, { query: "widget" })).rejects.toThrow("escapes module");
  await put(root, path, index);
  await rm(resolve(root, "knowledge/widgets/records/observations.json"));
  await expect(findContext(root, { query: "widget" })).rejects.toThrow("ENOENT");
  await put(root, "knowledge/records/modules.json", {
    modules: [
      { moduleId: "widgets", indexPath: "widgets/index.json" },
      { moduleId: "widgets", indexPath: "widgets/index.json" },
    ],
  });
  await expect(findContext(root, { query: "widget" })).rejects.toThrow(
    "Duplicate knowledge module",
  );
});

test("memory schema changes cannot silently bypass validation", async () => {
  const root = await fixture();
  await memory(root, "shared");
  const path = "agents/memory/schema/memory-entry.schema.json";
  const schema: unknown = JSON.parse(await readFile(resolve(root, path), "utf8"));
  if (typeof schema !== "object" || schema === null) throw new Error("Fixture schema missing");
  await put(root, path, { ...schema, unsupportedConstraint: true });
  await expect(checkMemory(root, ["shared"])).rejects.toThrow("Unsupported memory schema keyword");
});

test("the contributor command runs from a fresh fixture and reports usable structured results", async () => {
  const root = await fixture();
  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [resolve(repository, "scripts/agents/retrieve-context.ts"), ...args, "--root", root],
      { encoding: "utf8" },
    );
  const result: unknown = JSON.parse(
    run(
      "read",
      "--module",
      "widgets",
      "--resource",
      "widget-observations",
      "--record",
      "small-widget",
      "--pointer",
      "/detail",
    ),
  );
  expect(result).toMatchObject({ ok: true, data: { content: "yellow rotary assembly" } });
  expect(() => run("find", "--query", "yellow", "--file", "guess")).toThrow();
  const oversized = spawnSync(
    process.execPath,
    [
      resolve(repository, "scripts/agents/retrieve-context.ts"),
      "read",
      "--module",
      "widgets",
      "--resource",
      "widget-observations",
      "--root",
      root,
      "--max-output-chars",
      "2000",
    ],
    { encoding: "utf8" },
  );
  // Enlarge one selected value, then verify the final boundary returns complete
  // error JSON instead of a truncated JSON success object.
  await put(root, "knowledge/widgets/records/observations.json", {
    items: [{ id: "small-widget", detail: "x".repeat(3000) }, { id: "large-widget" }],
  });
  const bounded = spawnSync(
    process.execPath,
    [
      resolve(repository, "scripts/agents/retrieve-context.ts"),
      "read",
      "--module",
      "widgets",
      "--resource",
      "widget-observations",
      "--root",
      root,
      "--max-output-chars",
      "2000",
    ],
    { encoding: "utf8" },
  );
  expect(oversized.status).toBe(0);
  expect(bounded.status).toBe(1);
  expect(JSON.parse(bounded.stdout) as unknown).toMatchObject({
    ok: false,
    code: "OutputTooLarge",
  });
  expect(
    await readFile(resolve(root, "knowledge/widgets/records/observations.json"), "utf8"),
  ).toContain("x".repeat(3000));
});
