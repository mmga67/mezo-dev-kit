import { afterEach, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runConsole } from "../src/console.ts";
import { shouldOpenConsole } from "../src/entry.ts";
import { ConsoleCancelled } from "../src/console-process.ts";
import { CliError } from "../src/errors.ts";
import type { ConsoleUI } from "../src/terminal.ts";
import { fixtureBundle } from "./fixtures.ts";
import { bundleDigest, digest, jsonText, record } from "../src/contracts.ts";
import { runCommand } from "../src/command.ts";
import { readOptional } from "../src/filesystem.ts";
import { assertApplicationTarget } from "../src/console-workspace.ts";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});
async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mdk-console-test-"));
  temporary.push(root);
  const sourceRoot = join(root, "assets"),
    project = join(root, "existing"),
    artifacts = join(root, "manifest.json");
  const starter = {
    "package.template.json": jsonText({
      name: "synthetic-app",
      private: true,
      mdkStarter: "typescript",
      dependencies: {},
      devDependencies: {},
    }),
    "gitignore.template": "node_modules/\n",
    "dependency-pins.json": "{}",
    "src/index.ts": "// synthetic starter\n",
  };
  const base = fixtureBundle();
  const next = {
    ...base,
    domains: [...base.domains, { id: "foundation", packages: [], resources: [] }],
    starter: Object.entries(starter).map(([path, content]) => ({
      path,
      digest: digest(content),
      size: Buffer.byteLength(content),
    })),
  };
  const bundle = { ...next, id: bundleDigest(next) };
  await write(sourceRoot, "bundle.json", jsonText(bundle));
  await write(sourceRoot, "APP_AGENTS.md", "# Application\n");
  await write(sourceRoot, "references/synthetic.md", "guide");
  for (const [path, content] of Object.entries(starter))
    await write(sourceRoot, `starter/${path}`, content);
  await write(root, "synthetic.tgz", "packed");
  await write(
    root,
    "manifest.json",
    jsonText({
      formatVersion: 1,
      bundleId: bundle.id,
      packages: [
        {
          name: "@mezo-dev-kit/synthetic",
          version: "0.0.0-private",
          path: "synthetic.tgz",
          size: 6,
          digest: digest("packed"),
        },
      ],
    }),
  );
  await write(project, "package.json", jsonText({ private: true }));
  return { root, project, sourceRoot, artifacts, bundle };
}
function scripted(answers: string[], inputs: string[] = []) {
  const messages: string[] = [];
  const ui: ConsoleUI = {
    write(message) {
      messages.push(message);
    },
    async input() {
      const value = inputs.shift();
      if (value === undefined) throw new Error("Missing scripted input");
      return value;
    },
    async select(label, choices) {
      const value = answers.shift();
      if (value === "cancel") throw new ConsoleCancelled();
      if (!choices.some((item) => item.value === value))
        throw new Error(`Unexpected answer ${String(value)} for ${label}`);
      return value ?? "";
    },
  };
  return { ui, messages };
}

test.for([
  { args: [], tty: true, open: true },
  { args: [], tty: false, open: false },
  { args: ["--json"], tty: true, open: false },
  { args: ["doctor"], tty: true, open: false },
  { args: ["--no-input"], tty: true, open: false },
  { args: ["console"], tty: false, open: true },
])(
  "console dispatch respects explicit commands and automation: $args / $tty",
  ({ args, tty, open }) => {
    expect(shouldOpenConsole(args, tty)).toBe(open);
  },
);

test("opening or cancelling the repository menu does not build or initialize MDK", async () => {
  const { root } = await fixture();
  await write(root, "package.json", jsonText({ name: "mezo-dev-kit" }));
  await write(root, "scripts/workspace/mdk-distribution.ts", "// synthetic workspace\n");
  const run = vi.fn();
  await runConsole({ cwd: root, workspace: root }, scripted(["exit"]).ui, run);
  await expect(
    runConsole({ cwd: root, workspace: root }, scripted(["cancel"]).ui, run),
  ).rejects.toBeInstanceOf(ConsoleCancelled);
  expect(run).not.toHaveBeenCalled();
  expect(await readOptional(root, "mdk.config.json")).toBeNull();
  await expect(assertApplicationTarget(root)).rejects.toMatchObject({ code: "Conflict" });
  const nested = join(root, "nested");
  await mkdir(nested);
  await expect(assertApplicationTarget(nested, root)).rejects.toMatchObject({ code: "Conflict" });
});

test("cancelling creation leaves the target and package manager untouched", async () => {
  const { root, sourceRoot, artifacts } = await fixture();
  const target = join(root, "new-app");
  const run = vi.fn();
  await runConsole(
    { cwd: root, sourceRoot, artifacts },
    scripted(["create", "back", "exit"], [target]).ui,
    run,
  );
  expect(run).not.toHaveBeenCalled();
  await expect(readFile(join(target, "package.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("creation retries only the failed install stage and completes real guidance initialization", async () => {
  const { root, sourceRoot, artifacts } = await fixture();
  const target = join(root, "new-app");
  const run = vi
    .fn()
    .mockRejectedValueOnce(new CliError("Unavailable", "Synthetic install failure"))
    .mockResolvedValue(undefined);
  const { ui, messages } = scripted(["create", "continue", "retry", "exit"], [target]);
  await runConsole({ cwd: root, sourceRoot, artifacts, offline: true }, ui, run);
  expect(run.mock.calls).toEqual([
    [target, ["install", "--offline"]],
    [target, ["install", "--offline"]],
    [target, ["check"]],
  ]);
  expect(await readOptional(target, "mdk.lock.json")).not.toBeNull();
  expect(messages.some((message) => message.includes("Your project is ready"))).toBe(true);
  expect((await runCommand(["doctor"], { cwd: target, sourceRoot })).exitCode).toBe(0);
});

test("an install failure retains a resumable project and never reports success", async () => {
  const { root, sourceRoot, artifacts } = await fixture();
  const target = join(root, "new-app");
  const run = vi.fn().mockRejectedValue(new CliError("Unavailable", "Synthetic failure"));
  const { ui, messages } = scripted(["create", "continue", "back", "exit"], [target]);
  await runConsole({ cwd: root, sourceRoot, artifacts }, ui, run);
  expect(await readOptional(target, "package.json")).not.toBeNull();
  expect(await readOptional(target, "mdk.lock.json")).toBeNull();
  expect(messages.some((message) => message.includes("Your project is ready"))).toBe(false);
  const resumed = vi.fn().mockResolvedValue(undefined);
  await runConsole(
    { cwd: target, sourceRoot },
    scripted(["finish", "continue", "exit"]).ui,
    resumed,
  );
  expect((await runCommand(["doctor"], { cwd: target, sourceRoot })).exitCode).toBe(0);
});

test("guidance selection preserves existing instructions and the all-reference preference", async () => {
  const { project, sourceRoot } = await fixture();
  await write(project, "AGENTS.md", "Application-owned instructions\n");
  await write(
    project,
    "mdk.config.json",
    jsonText({
      formatVersion: 1,
      domains: ["typescript"],
      skillsDirectory: ".agents/skills",
      references: { mode: "all" },
    }),
  );
  await runCommand(["init"], { cwd: project, sourceRoot });
  const run = vi.fn();
  await runConsole(
    { cwd: project, sourceRoot },
    scripted(["guidance", "foundation", "continue", "exit"], ["foundation"]).ui,
    run,
  );
  expect(JSON.parse(await readFile(join(project, "mdk.config.json"), "utf8"))).toMatchObject({
    domains: ["typescript", "foundation"],
    references: { mode: "all" },
  });
  expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
    "Application-owned instructions\n",
  );
  expect((await runCommand(["doctor"], { cwd: project, sourceRoot })).exitCode).toBe(0);
  expect(run).not.toHaveBeenCalled();
});

test("occupied targets fail before preparation or installation", async () => {
  const { root, project, sourceRoot, artifacts } = await fixture();
  const run = vi.fn();
  await runConsole(
    { cwd: root, sourceRoot, artifacts },
    scripted(["create", "exit"], [project]).ui,
    run,
  );
  expect(run).not.toHaveBeenCalled();
  expect(await readFile(join(project, "package.json"), "utf8")).toBe(jsonText({ private: true }));
});

test.for(["back", "continue"])(
  "capability menu previews a skill-only set and respects %s",
  async (confirmation) => {
    const { project, sourceRoot, bundle } = await fixture();
    const next = {
      ...bundle,
      domains: [...bundle.domains, { id: "memory", packages: [], resources: [] }],
      sets: [
        {
          id: "memory",
          title: "Project memory",
          description: "Retain useful context",
          domains: ["memory"],
        },
      ],
      skills: [
        {
          name: "mdk-memory-application",
          domains: ["memory"],
          files: [{ path: "SKILL.md", digest: digest("memory"), size: 6 }],
        },
      ],
    };
    await write(sourceRoot, "bundle.json", jsonText({ ...next, id: bundleDigest(next) }));
    await write(sourceRoot, "skills/mdk-memory-application/SKILL.md", "memory");
    await write(project, "AGENTS.md", "Application-owned instructions\n");
    await runCommand(["init"], { cwd: project, sourceRoot });
    const before = await readFile(join(project, "mdk.config.json"));
    const run = vi.fn();
    const { ui, messages } = scripted(["capabilities", "sets", "memory", confirmation, "exit"]);
    await runConsole({ cwd: project, sourceRoot }, ui, run);
    expect(run).not.toHaveBeenCalled();
    expect(messages.some((message) => message.includes("Plan: memory"))).toBe(true);
    if (confirmation === "back") {
      expect(await readFile(join(project, "mdk.config.json"))).toEqual(before);
      expect(
        await readOptional(project, ".agents/skills/mdk-memory-application/SKILL.md"),
      ).toBeNull();
    } else {
      expect(
        await readFile(join(project, ".agents/skills/mdk-memory-application/SKILL.md"), "utf8"),
      ).toBe("memory");
      expect((await runCommand(["doctor"], { cwd: project, sourceRoot })).exitCode).toBe(0);
      const repeated = scripted(["capabilities", "sets", "memory", "exit"]);
      await runConsole({ cwd: project, sourceRoot }, repeated.ui, run);
      expect(repeated.messages).toContain("This selection needs no changes.");
    }
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      "Application-owned instructions\n",
    );
  },
);

test("a corrupted artifact cannot create an application or start installation", async () => {
  const { root, sourceRoot, artifacts } = await fixture();
  await write(root, "synthetic.tgz", "changed");
  const target = join(root, "new-app");
  const run = vi.fn();
  const { ui, messages } = scripted(["create", "continue", "exit"], [target]);
  await runConsole({ cwd: root, sourceRoot, artifacts }, ui, run);
  expect(run).not.toHaveBeenCalled();
  await expect(readFile(join(target, "package.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(messages.some((message) => message.includes("trusted, matching artifact"))).toBe(true);
});

test("a pending journal routes directly to recovery without other operations", async () => {
  const { project, sourceRoot } = await fixture();
  await write(project, ".mdk/operation/journal.json", "{}");
  const run = vi.fn();
  const ui: ConsoleUI = {
    ...scripted([]).ui,
    async select(label, choices) {
      expect(label).toContain("Interrupted guidance operation");
      expect(choices.map((item) => item.value)).toEqual(["recover", "exit"]);
      return "exit";
    },
  };
  await runConsole({ cwd: project, sourceRoot }, ui, run);
  expect(run).not.toHaveBeenCalled();
  expect(await readFile(join(project, ".mdk/operation/journal.json"), "utf8")).toBe("{}");
});

test("noninteractive console exits promptly with structured invalid-input diagnostics", async () => {
  const bin = new URL("../src/bin.ts", import.meta.url);
  const { fileURLToPath } = await import("node:url");
  const failure: unknown = await promisify(execFile)(
    process.execPath,
    [fileURLToPath(bin), "console", "--json"],
    {
      timeout: 5000,
    },
  ).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 2 });
  expect(record(failure, "child failure").stderr).toContain('"code": "InvalidInput"');
  const help = await promisify(execFile)(process.execPath, [fileURLToPath(bin)], { timeout: 5000 });
  expect(help.stdout).toContain("mdk init");
});
