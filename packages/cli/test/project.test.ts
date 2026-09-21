import { afterEach, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { config, fixtureBundle } from "./fixtures.ts";
import { bundleDigest, digest, jsonText, parseLock } from "../src/contracts.ts";
import type { ReferenceBundle } from "../src/contracts.ts";
import { synchronizeProject } from "../src/setup.ts";
import { fetchReferences, obtainResource, resourceClosure } from "../src/references.ts";
import { applyChanges, recoverChanges } from "../src/transactions.ts";
import { readOptional } from "../src/filesystem.ts";
import { runCommand } from "../src/command.ts";
import { packageManifestDigest } from "../src/project.ts";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "mdk-cli-test-"));
  temporary.push(root);
  const project = join(root, "app"),
    source = join(root, "assets");
  await mkdir(project);
  await mkdir(source);
  const fixture = fixtureBundle();
  const resource = fixture.resources[0];
  if (!resource) throw new Error("Fixture missing");
  const extra = {
    ...resource,
    id: "guide:deeper",
    path: "references/deeper.md",
    digest: digest("deeper"),
    size: 6,
    requires: [],
  };
  const base = {
    ...fixture,
    resources: [...fixture.resources, extra],
    skills: [
      {
        name: "mdk-synthetic",
        domains: ["typescript"],
        files: [{ path: "SKILL.md", digest: digest("skill"), size: 5 }],
      },
    ],
  };
  const bundle: ReferenceBundle = { ...base, id: bundleDigest(base) };
  await write(project, "package.json", jsonText({ private: true }));
  await write(source, "bundle.json", jsonText(bundle));
  await write(source, "APP_AGENTS.md", "# Application\n");
  await write(source, "skills/mdk-synthetic/SKILL.md", "skill");
  await write(source, resource.path, "guide");
  await write(source, extra.path, "deeper");
  return { root, project, source, bundle, resource, extra };
}

test("preview does not create files; init preserves application instructions; repeated sync is empty", async () => {
  const { project, source, bundle } = await setup();
  await write(project, "AGENTS.md", "Human-owned instructions");
  const preview = await synchronizeProject(project, source, bundle, {
    initialize: true,
    dryRun: true,
  });
  expect(preview.changed).toContain("mdk.lock.json");
  expect(await readOptional(project, "mdk.lock.json")).toBeNull();
  await synchronizeProject(project, source, bundle, { initialize: true });
  expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe("Human-owned instructions");
  expect(
    (await synchronizeProject(project, source, bundle, { locked: true, check: true })).changed,
  ).toEqual([]);
  expect(await readOptional(project, ".mdk/reference/references/deeper.md")).toBeNull();
  expect(
    (await runCommand(["docs", "search", "deeper"], { cwd: project, sourceRoot: source })).data,
  ).toMatchObject({ resources: [{ availability: "indexed" }] });
});
test("unknown files and modified managed skills are conflicts", async () => {
  const { project, source, bundle } = await setup();
  await write(project, ".agents/skills/mdk-synthetic/SKILL.md", "user file");
  await expect(
    synchronizeProject(project, source, bundle, { initialize: true }),
  ).rejects.toMatchObject({ code: "Conflict" });
  await rm(join(project, ".agents"), { recursive: true });
  await synchronizeProject(project, source, bundle, { initialize: true });
  await write(project, ".agents/skills/mdk-synthetic/SKILL.md", "edited");
  await expect(synchronizeProject(project, source, bundle)).rejects.toMatchObject({
    code: "Conflict",
  });
  expect(await readFile(join(project, ".agents/skills/mdk-synthetic/SKILL.md"), "utf8")).toBe(
    "edited",
  );
});
test("locked restoration repairs missing files, refuses changed selection, and updates discovery root safely", async () => {
  const { project, source, bundle } = await setup();
  await synchronizeProject(project, source, bundle, { initialize: true });
  await rm(join(project, ".agents/skills/mdk-synthetic/SKILL.md"));
  await expect(synchronizeProject(project, source, bundle, { check: true })).rejects.toMatchObject({
    code: "Conflict",
  });
  await synchronizeProject(project, source, bundle, { locked: true, offline: true });
  await write(
    project,
    "mdk.config.json",
    jsonText({ ...config, skillsDirectory: ".claude/skills" }),
  );
  await expect(synchronizeProject(project, source, bundle, { locked: true })).rejects.toMatchObject(
    { code: "Incompatible" },
  );
  await synchronizeProject(project, source, bundle);
  expect(await readOptional(project, ".agents/skills/mdk-synthetic/SKILL.md")).toBeNull();
  expect(await readFile(join(project, ".claude/skills/mdk-synthetic/SKILL.md"), "utf8")).toBe(
    "skill",
  );
});
test("project paths reject symlinked discovery roots before writing", async () => {
  const { project, source, bundle, root } = await setup();
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(project, ".agents"));
  await expect(
    synchronizeProject(project, source, bundle, { initialize: true }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(await readOptional(outside, "skills/mdk-synthetic/SKILL.md")).toBeNull();
});
test("private versions require the actual target package bytes", async () => {
  const { project, source, bundle } = await setup();
  const manifest = {
    name: "@mezo-dev-kit/synthetic",
    version: "0.0.0-private",
    type: "module",
    exports: { ".": "./dist/index.js" },
  };
  const packageRoot = "node_modules/@mezo-dev-kit/synthetic";
  await write(
    project,
    "package.json",
    jsonText({ dependencies: { [manifest.name]: manifest.version } }),
  );
  await write(project, `${packageRoot}/package.json`, jsonText(manifest));
  await write(project, `${packageRoot}/dist/index.js`, "first");
  const base = {
    ...bundle,
    packages: bundle.packages.map((item) => ({
      ...item,
      manifestDigest: packageManifestDigest(manifest),
    })),
  };
  const compatible = { ...base, id: bundleDigest(base) };
  await synchronizeProject(project, source, compatible, { initialize: true });
  await write(project, `${packageRoot}/dist/index.js`, "other");
  await expect(synchronizeProject(project, source, compatible)).rejects.toMatchObject({
    code: "Incompatible",
  });
  const doctor = await runCommand(["doctor", "--json"], { cwd: project, sourceRoot: source });
  expect(doctor.exitCode).toBe(1);
  expect(doctor.data).toMatchObject({ issues: [{ code: "Incompatible" }] });
});
test("interrupted updates restore prior files and never overwrite subsequent edits", async () => {
  const { project } = await setup();
  await write(project, "mdk.lock.json", "old");
  const changes = [
    { path: "mdk.lock.json", before: Buffer.from("old"), after: Buffer.from("new") },
    { path: ".mdk/reference/new.md", before: null, after: Buffer.from("new") },
  ];
  await expect(
    applyChanges(project, changes, {
      afterWrite: async () => {
        throw new Error("synthetic interruption");
      },
    }),
  ).rejects.toMatchObject({ code: "RecoveryRequired" });
  await expect(applyChanges(project, [])).rejects.toMatchObject({ code: "RecoveryRequired" });
  await write(project, "mdk.lock.json", "human edit");
  await expect(recoverChanges(project)).rejects.toMatchObject({ code: "Conflict" });
  await write(project, "mdk.lock.json", "new");
  await recoverChanges(project, true);
  expect(await readFile(join(project, "mdk.lock.json"), "utf8")).toBe("new");
  await recoverChanges(project);
  expect(await readFile(join(project, "mdk.lock.json"), "utf8")).toBe("old");
  expect(await readOptional(project, ".mdk/reference/new.md")).toBeNull();
});
test("concurrent operations and active-process recovery are refused", async () => {
  const { project } = await setup();
  await applyChanges(
    project,
    [{ path: "mdk.lock.json", before: null, after: Buffer.from("lock") }],
    {
      afterWrite: async () => {
        await expect(recoverChanges(project)).rejects.toMatchObject({ code: "Conflict" });
        await expect(applyChanges(project, [])).rejects.toMatchObject({ code: "RecoveryRequired" });
      },
    },
  );
});
test("fetch-all reports partial coverage, resumes offline and preserves the installed lock", async () => {
  const { project, source, bundle, extra } = await setup();
  await synchronizeProject(project, source, bundle, { initialize: true });
  const lock = await readFile(join(project, "mdk.lock.json"));
  await rm(join(source, extra.path));
  const fetch = vi.fn<typeof globalThis.fetch>();
  const partial = await fetchReferences(
    project,
    source,
    bundle,
    bundle.resources.map((item) => item.id),
    { offline: true, fetch },
  );
  expect(partial.complete).toBe(false);
  expect(partial.missing).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
  await write(source, extra.path, "deeper");
  const result = await fetchReferences(
    project,
    source,
    bundle,
    bundle.resources.map((item) => item.id),
    { offline: true, fetch },
  );
  expect(result.complete).toBe(true);
  expect(await readFile(join(project, "mdk.lock.json"))).toEqual(lock);
  expect(parseLock(JSON.parse(lock.toString()) as unknown).bundleId).toBe(bundle.id);
  await write(project, `.mdk/reference/${extra.path}`, "edited");
  expect((await fetchReferences(project, source, bundle, [extra.id])).missing[0]?.code).toBe(
    "Integrity",
  );
});
test("remote retrieval verifies digests and bounds, disallows redirects, and redacts failures", async () => {
  const { source, bundle, extra } = await setup();
  await rm(join(source, extra.path));
  const remote = { ...bundle, remoteBase: "https://example.invalid/pinned/" };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("deeper"));
  expect(await obtainResource(source, remote, extra, { fetch })).toEqual(Buffer.from("deeper"));
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
  fetch.mockResolvedValue(new Response("longer than declared"));
  await expect(obtainResource(source, remote, extra, { fetch })).rejects.toMatchObject({
    code: "Integrity",
  });
  fetch.mockResolvedValue(new Response("wrong!"));
  await expect(obtainResource(source, remote, extra, { fetch })).rejects.toMatchObject({
    code: "Integrity",
  });
  fetch.mockRejectedValue(new Error("secret URL credentials"));
  await expect(obtainResource(source, remote, extra, { fetch })).rejects.toThrow(
    "Pinned reference download failed or was cancelled",
  );
});
test("dependency closure handles cycles and explains exclusions", async () => {
  const { bundle, resource, extra } = await setup();
  const cyclic = {
    ...bundle,
    resources: [
      { ...resource, requires: [extra.id] },
      { ...extra, requires: [resource.id] },
    ],
    exclusions: [
      {
        id: "source:excluded",
        sourcePath: "evidence/raw.json",
        reason: "Raw evidence outside consumer scope",
      },
    ],
  };
  expect(resourceClosure(cyclic, [resource.id])).toHaveLength(2);
  expect(() => resourceClosure(cyclic, ["source:excluded"])).toThrow("outside consumer scope");
});

test("bundle upgrades retire verified stale cache entries and fetch their new versions", async () => {
  const { project, source, bundle, extra } = await setup();
  await synchronizeProject(project, source, bundle, { initialize: true });
  await fetchReferences(project, source, bundle, [extra.id], { offline: true });
  const changed = { ...extra, digest: digest("updated"), sourceDigest: digest("updated"), size: 7 };
  const base = {
    ...bundle,
    resources: bundle.resources.map((item) => (item.id === extra.id ? changed : item)),
  };
  const next = { ...base, id: bundleDigest(base) };
  await write(source, extra.path, "updated");
  const cache = `.mdk/reference/${extra.path}`;
  await write(project, cache, "personal notes");
  await expect(synchronizeProject(project, source, next)).rejects.toMatchObject({
    code: "Conflict",
  });
  await write(project, cache, "deeper");
  expect((await synchronizeProject(project, source, next, { dryRun: true })).changed).toContain(
    cache,
  );
  expect((await readOptional(project, cache))?.toString()).toBe("deeper");
  await synchronizeProject(project, source, next);
  expect(await readOptional(project, cache)).toBeNull();
  expect(
    (await fetchReferences(project, source, next, [extra.id], { offline: true })).complete,
  ).toBe(true);
  expect((await readOptional(project, cache))?.toString()).toBe("updated");
  expect((await runCommand(["doctor", "--offline"], { cwd: project })).exitCode).toBe(0);
});

test("an upgrade can promote a verified cached reference into the selected set", async () => {
  const { project, source, bundle, extra } = await setup();
  await synchronizeProject(project, source, bundle, { initialize: true });
  await fetchReferences(project, source, bundle, [extra.id], { offline: true });
  const base = {
    ...bundle,
    domains: bundle.domains.map((item) => ({ ...item, resources: [...item.resources, extra.id] })),
  };
  const next = { ...base, id: bundleDigest(base) };
  await synchronizeProject(project, source, next);
  await synchronizeProject(project, source, next, { locked: true, check: true });
  expect((await readOptional(project, `.mdk/reference/${extra.path}`))?.toString()).toBe("deeper");
});
