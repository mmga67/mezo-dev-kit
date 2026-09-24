import { afterEach, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { bundleDigest, digest, jsonText, parseBundle } from "../src/contracts.ts";
import { addCapability } from "../src/capabilities.ts";
import { packageManifestDigest } from "../src/project.ts";
import { synchronizeProject } from "../src/setup.ts";
import { readOptional } from "../src/filesystem.ts";
import { runCommand } from "../src/command.ts";
import { CliError } from "../src/errors.ts";
import { config, fixtureBundle } from "./fixtures.ts";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mdk-capabilities-"));
  temporary.push(root);
  const project = join(root, "app"),
    source = join(root, "assets"),
    artifacts = join(root, "artifacts");
  const pkg = {
    name: "@mezo-dev-kit/synthetic",
    version: "0.0.0-private",
    type: "module",
    exports: { ".": "./dist/index.js" },
  };
  const template = jsonText({ packageManager: "pnpm@11.0.8" });
  const base = fixtureBundle();
  const raw = {
    ...base,
    packages: base.packages.map((item) => ({
      ...item,
      manifestDigest: packageManifestDigest(pkg),
    })),
    domains: [
      ...base.domains,
      { id: "synthetic", packages: [pkg.name], resources: [] },
      { id: "memory", packages: [], resources: [] },
    ],
    sets: [
      {
        id: "synthetic",
        title: "Synthetic capability",
        description: "Test installed entrypoints.",
        domains: ["typescript", "synthetic"],
      },
      { id: "memory", title: "Memory", description: "Local app memory.", domains: ["memory"] },
    ],
    skills: [
      {
        name: "mdk-memory-application",
        domains: ["memory"],
        files: [{ path: "SKILL.md", digest: digest("memory"), size: 6 }],
      },
    ],
    starter: [
      {
        path: "package.template.json",
        digest: digest(template),
        size: Buffer.byteLength(template),
      },
    ],
  };
  const bundle = parseBundle({ ...raw, id: bundleDigest(raw) });
  await write(
    project,
    "package.json",
    jsonText({
      name: "example-app",
      private: true,
      packageManager: "pnpm@11.0.8",
      dependencies: { existing: "1.0.0" },
    }),
  );
  await write(project, "AGENTS.md", "Application-owned instructions\n");
  await write(source, "bundle.json", jsonText(bundle));
  await write(source, "APP_AGENTS.md", "# Application\n");
  await write(source, "references/synthetic.md", "guide");
  await write(source, "skills/mdk-memory-application/SKILL.md", "memory");
  await write(source, "starter/package.template.json", template);
  await write(artifacts, "synthetic.tgz", "packed");
  const artifactPath = join(artifacts, "manifest.json");
  await write(
    artifacts,
    "manifest.json",
    jsonText({
      formatVersion: 1,
      bundleId: bundle.id,
      packages: [
        {
          name: pkg.name,
          version: pkg.version,
          path: "synthetic.tgz",
          digest: digest("packed"),
          size: 6,
        },
      ],
    }),
  );
  await synchronizeProject(project, source, bundle, { initialize: true, config });
  let overrides: unknown = { "unrelated-package": "1.0.0" };
  const read = vi.fn(async (_cwd: string, args: readonly string[]) =>
    args[0] === "--version" ? "11.0.8\n" : jsonText(overrides),
  );
  const install = async () => {
    await write(project, "node_modules/@mezo-dev-kit/synthetic/package.json", jsonText(pkg));
    await write(project, "node_modules/@mezo-dev-kit/synthetic/dist/index.js", "first");
    await write(
      project,
      "package.json",
      jsonText({
        name: "example-app",
        private: true,
        packageManager: "pnpm@11.0.8",
        dependencies: {
          existing: "1.0.0",
          [pkg.name]: `file:./.mdk/artifacts/${digest(pkg.name)}.tgz`,
        },
      }),
    );
  };
  const run = vi.fn(async (_cwd: string, args: readonly string[]) => {
    if (args[0] === "config") overrides = JSON.parse(args.at(-1) ?? "{}");
    else await install();
  });
  return { project, source, artifacts, artifactPath, bundle, pkg, read, run, install };
}

test("a set preview validates artifacts without changing project files or running mutations", async () => {
  const f = await fixture();
  const before = await readFile(join(f.project, "mdk.config.json"));
  const result = await addCapability(f.project, f.source, f.bundle, "synthetic", {
    dryRun: true,
    artifacts: f.artifactPath,
    read: f.read,
    run: f.run,
  });
  expect(result).toMatchObject({ complete: false, dryRun: true, packages: [f.pkg.name] });
  expect(f.run).not.toHaveBeenCalled();
  expect(await readFile(join(f.project, "mdk.config.json"))).toEqual(before);
  expect(await readOptional(f.project, ".mdk/artifacts/manifest.json")).toBeNull();
  expect(await readOptional(f.project, "pnpm-workspace.yaml")).toBeNull();
});

test("adding a package preserves unrelated dependencies, overrides and instructions and is repeatable", async () => {
  const f = await fixture();
  const options = { artifacts: f.artifactPath, read: f.read, run: f.run, offline: true };
  expect((await addCapability(f.project, f.source, f.bundle, "synthetic", options)).complete).toBe(
    true,
  );
  expect(f.run).toHaveBeenCalledTimes(2);
  const configCall = f.run.mock.calls[0]?.[1].at(-1);
  expect(JSON.parse(configCall ?? "{}")).toMatchObject({
    "unrelated-package": "1.0.0",
    [f.pkg.name]: `file:./.mdk/artifacts/${digest(f.pkg.name)}.tgz`,
  });
  expect(f.run.mock.calls[1]?.[1]).toContain("--offline");
  expect(f.run.mock.calls[1]?.[1]).toContain("--ignore-scripts");
  expect(await readFile(join(f.project, "AGENTS.md"), "utf8")).toBe(
    "Application-owned instructions\n",
  );
  expect(JSON.parse(await readFile(join(f.project, "package.json"), "utf8"))).toMatchObject({
    dependencies: { existing: "1.0.0" },
  });
  f.run.mockClear();
  f.read.mockClear();
  expect(
    (await addCapability(f.project, f.source, f.bundle, "synthetic", { run: f.run, read: f.read }))
      .changed,
  ).toEqual([]);
  expect(f.run).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});

test("a failed installation leaves selection uncommitted and retry finishes the same addition", async () => {
  const f = await fixture();
  const before = await readFile(join(f.project, "mdk.config.json"));
  const fail = vi.fn(async (_cwd: string, args: readonly string[]) => {
    if (args[0] === "add") {
      await write(
        f.project,
        "package.json",
        jsonText({
          name: "example-app",
          packageManager: "pnpm@11.0.8",
          dependencies: { [f.pkg.name]: `file:./.mdk/artifacts/${digest(f.pkg.name)}.tgz` },
        }),
      );
      throw new CliError("Unavailable", "Synthetic install failure");
    }
  });
  await expect(
    addCapability(f.project, f.source, f.bundle, "synthetic", {
      artifacts: f.artifactPath,
      read: f.read,
      run: fail,
    }),
  ).rejects.toMatchObject({ code: "Unavailable" });
  expect(await readFile(join(f.project, "mdk.config.json"))).toEqual(before);
  expect(
    (await addCapability(f.project, f.source, f.bundle, "synthetic", { read: f.read, run: f.run }))
      .complete,
  ).toBe(true);
});

test("individual skill addition preserves custom skills, memory and reference preferences without pnpm", async () => {
  const f = await fixture();
  await write(f.project, "mdk.config.json", jsonText({ ...config, references: { mode: "all" } }));
  await write(f.project, ".agents/skills/my-app/SKILL.md", "Custom procedure");
  await write(f.project, "docs/mdk-memory/owned.json", "Application memory");
  const context = { cwd: f.project, sourceRoot: f.source, runPnpm: f.run, readPnpm: f.read };
  expect(
    (await runCommand(["add", "--skill", "mdk-memory-application"], context)).data,
  ).toMatchObject({ complete: true });
  expect(f.run).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  expect(await readFile(join(f.project, ".agents/skills/my-app/SKILL.md"), "utf8")).toBe(
    "Custom procedure",
  );
  expect(await readFile(join(f.project, "docs/mdk-memory/owned.json"), "utf8")).toBe(
    "Application memory",
  );
  expect(JSON.parse(await readFile(join(f.project, "mdk.config.json"), "utf8"))).toMatchObject({
    references: { mode: "all" },
  });
  expect((await runCommand(["skills"], context)).data).toMatchObject({
    skills: [{ name: "mdk-memory-application", selected: true }],
  });
});

test("corrupt artifacts fail before dependency or guidance mutation", async () => {
  const f = await fixture();
  await write(f.artifacts, "synthetic.tgz", "edited");
  await expect(
    addCapability(f.project, f.source, f.bundle, "synthetic", {
      artifacts: f.artifactPath,
      read: f.read,
      run: f.run,
    }),
  ).rejects.toMatchObject({ code: "Integrity" });
  expect(f.run).not.toHaveBeenCalled();
  expect(await readOptional(f.project, ".mdk/artifacts/manifest.json")).toBeNull();
});

test("modified managed files and conflicting overrides fail before installation", async () => {
  const f = await fixture();
  await write(f.project, ".mdk/reference/references/synthetic.md", "User edit");
  await expect(
    addCapability(f.project, f.source, f.bundle, "synthetic", {
      artifacts: f.artifactPath,
      read: f.read,
      run: f.run,
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(f.run).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  await write(f.project, ".mdk/reference/references/synthetic.md", "guide");
  f.read.mockImplementation(async (_cwd, args) =>
    args[0] === "--version" ? "11.0.8" : jsonText({ [f.pkg.name]: "different-version" }),
  );
  await expect(
    addCapability(f.project, f.source, f.bundle, "synthetic", {
      artifacts: f.artifactPath,
      read: f.read,
      run: f.run,
    }),
  ).rejects.toMatchObject({ code: "Conflict" });
  expect(f.run).not.toHaveBeenCalled();
});

test("a changed installed SDK is rejected instead of automatically upgraded", async () => {
  const f = await fixture();
  await f.install();
  await write(f.project, "node_modules/@mezo-dev-kit/synthetic/dist/index.js", "changed");
  await expect(
    addCapability(f.project, f.source, f.bundle, "synthetic", {
      artifacts: f.artifactPath,
      read: f.read,
      run: f.run,
    }),
  ).rejects.toMatchObject({ code: "Incompatible" });
  expect(f.run).not.toHaveBeenCalled();
});
