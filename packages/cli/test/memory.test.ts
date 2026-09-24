import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { memoryCommand, parseMemoryEntry } from "../src/memory.ts";
import { jsonText } from "../src/contracts.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mdk-app-memory-"));
  roots.push(root);
  const entry = {
    schemaVersion: 1,
    id: "synthetic-finding",
    domain: "application/demo",
    status: "verified",
    title: "Synthetic fixture boundary",
    summary: "Use the fixture to inspect validation without network access.",
    sources: ["src/demo.ts"],
    related: [],
    updated: "2026-09-22",
  };
  const file = join(root, "input.json");
  await writeFile(file, jsonText(entry));
  return { root, file, entry };
}

test("memory preview is read-only; a saved entry is searchable, retrievable and locally ignored", async () => {
  const { root, file, entry } = await fixture();
  expect(await memoryCommand(root, "save", { scope: "local", file, dryRun: true })).toMatchObject({
    changed: true,
    dryRun: true,
  });
  expect(await readdir(root)).toEqual(["input.json"]);
  await memoryCommand(root, "save", { scope: "local", file });
  expect(await readFile(join(root, ".mdk/memory/.gitignore"), "utf8")).toBe("*\n");
  expect(
    await memoryCommand(root, "search", {
      scope: "local",
      query: "fixture validation",
      domain: "application",
    }),
  ).toMatchObject({ total: 1, entries: [{ id: entry.id }] });
  expect(await memoryCommand(root, "show", { scope: "local", id: entry.id })).toEqual({
    scope: "local",
    entry,
  });
  expect(await memoryCommand(root, "check", { scope: "local" })).toMatchObject({
    valid: true,
    entries: 1,
  });
  expect(await memoryCommand(root, "save", { scope: "local", file })).toMatchObject({
    changed: false,
  });
});

test("shared and local stores stay separate; deprecated entries remain readable but leave search", async () => {
  const { root, file, entry } = await fixture();
  await memoryCommand(root, "save", { scope: "shared", file });
  expect(await memoryCommand(root, "search", { scope: "local", query: "fixture" })).toMatchObject({
    total: 0,
  });
  await writeFile(file, jsonText({ ...entry, status: "deprecated" }));
  await memoryCommand(root, "save", { scope: "shared", file });
  expect(await memoryCommand(root, "search", { scope: "shared", query: "fixture" })).toMatchObject({
    total: 0,
  });
  expect(await memoryCommand(root, "show", { scope: "shared", id: entry.id })).toMatchObject({
    entry: { status: "deprecated" },
  });
});

test.for([
  { status: "verified", sources: [] },
  { status: "promoted", related: [] },
  { id: "../../escape" },
  { updated: "2026-02-30" },
  { summary: "x".repeat(801) },
  { sources: ["same", "same"] },
  { extra: "field" },
])("invalid entries fail without creating a memory store", async (change) => {
  const { root, file, entry } = await fixture();
  await writeFile(file, jsonText({ ...entry, ...change }));
  await expect(memoryCommand(root, "save", { scope: "local", file })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect(await readdir(root)).toEqual(["input.json"]);
});

test("unverified observations cannot enter shared memory", async () => {
  const { root, file, entry } = await fixture();
  await writeFile(file, jsonText({ ...entry, status: "discovered", sources: [] }));
  await expect(memoryCommand(root, "save", { scope: "shared", file })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  await memoryCommand(root, "save", { scope: "local", file });
  expect(await memoryCommand(root, "check", { scope: "local" })).toMatchObject({ entries: 1 });
});

test("malformed or symlinked entries are reported rather than omitted or followed", async () => {
  const { root, file, entry } = await fixture();
  await memoryCommand(root, "save", { scope: "local", file });
  const path = join(root, `.mdk/memory/${entry.id}.json`);
  await writeFile(path, "not JSON");
  await expect(
    memoryCommand(root, "search", { scope: "local", query: "fixture" }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await rm(path);
  await symlink(file, path);
  await expect(memoryCommand(root, "check", { scope: "local" })).rejects.toMatchObject({
    code: "Conflict",
  });
});

test("promoted entries retain their canonical destination", async () => {
  const { entry } = await fixture();
  expect(
    parseMemoryEntry({ ...entry, status: "promoted", related: ["docs/demo.md"] }),
  ).toMatchObject({ status: "promoted", related: ["docs/demo.md"] });
});

test("a schema-valid but oversized encoded entry cannot create an unreadable store", async () => {
  const { root, file, entry } = await fixture();
  await writeFile(
    file,
    jsonText({
      ...entry,
      sources: Array.from({ length: 100 }, (_, index) => `${index}-${"🧪".repeat(490)}`),
    }),
  );
  await expect(memoryCommand(root, "save", { scope: "local", file })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect(await readdir(root)).toEqual(["input.json"]);
});
