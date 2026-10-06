import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { record, textValue, jsonText, arrayValue, safePath } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";
import { fileInventory, parseJson } from "./filesystem.ts";

/** Build a real, hoisted staging tree for npm bundled dependencies without changing pnpm's
 * isolated workspace installation. Only already installed production dependencies are used. */
export async function stageCliRuntime(sourceRoot: string, target: string): Promise<void> {
  const selected = new Map<string, string>();
  const hoisted = new Map<string, string>();
  async function installed(name: string, from: string): Promise<string> {
    if (!/^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/.test(name))
      throw new CliError("Integrity", "Invalid dependency name");
    let directory = from;
    for (;;) {
      try {
        return await realpath(join(directory, "node_modules", name));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      const parent = dirname(directory);
      if (parent === directory)
        throw new CliError("Unavailable", `Installed runtime dependency missing: ${name}`);
      directory = parent;
    }
  }
  async function copy(source: string, destination: string, cli = false): Promise<void> {
    const manifest = record(
      parseJson(await readFile(join(source, "package.json")), "runtime package"),
      "runtime package",
    );
    const name = textValue(manifest.name, "runtime name"),
      version = textValue(manifest.version, "runtime version");
    const prior = selected.get(destination);
    if (prior) {
      if (prior !== version)
        throw new CliError("Incompatible", `Multiple runtime versions cannot be bundled: ${name}`);
      return;
    }
    selected.set(destination, version);
    await mkdir(destination, { recursive: true });
    if (name.startsWith("@mezo-dev-kit/")) {
      for (const value of arrayValue(manifest.files, "package files")) {
        const file = safePath(value);
        const from = file === "LICENSE" ? join(sourceRoot, "LICENSE") : join(source, file);
        await cp(from, join(destination, file), {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      }
    } else {
      // These bytes are the installed, locked third-party artifact, including its license.
      // Exclude dependency links; every production edge is resolved and copied explicitly.
      await cp(source, destination, {
        recursive: true,
        filter: (path) => basename(path) !== "node_modules",
        dereference: false,
      });
    }
    const dependencies =
      manifest.dependencies === undefined
        ? {}
        : record(manifest.dependencies, "runtime dependencies");
    if (
      manifest.optionalDependencies !== undefined &&
      Object.keys(record(manifest.optionalDependencies, "optional dependencies")).length
    )
      throw new CliError(
        "Incompatible",
        "Runtime bundling requires an explicit optional-dependency policy",
      );
    const rewritten: Record<string, string> = {};
    for (const dependency of Object.keys(dependencies).sort()) {
      const dependencyRoot = await installed(dependency, source);
      const dependencyManifest = record(
        parseJson(await readFile(join(dependencyRoot, "package.json")), "dependency manifest"),
        "dependency manifest",
      );
      rewritten[dependency] = textValue(dependencyManifest.version, "dependency version");
      const first = hoisted.get(dependency);
      if (first === undefined) hoisted.set(dependency, rewritten[dependency]);
      const parent = first === undefined || first === rewritten[dependency] ? target : destination;
      await copy(dependencyRoot, resolve(parent, "node_modules", dependency));
    }
    if (Object.keys(rewritten).length) manifest.dependencies = rewritten;
    if (cli) manifest.bundleDependencies = Object.keys(rewritten);
    await writeFile(join(destination, "package.json"), jsonText(manifest));
  }
  await copy(resolve(sourceRoot, "packages/cli"), target, true);
}

/** pnpm 11's packlist builds an empty dependency graph, so bundleDependencies alone
 * omits node_modules even from a real hoisted tree. Append the already validated
 * closure to pnpm's archive and verify the actual final archive inventory. */
export async function appendCliRuntime(
  stagedCli: string,
  archive: string,
  expectedRoot: readonly string[],
): Promise<void> {
  const dependencies = (await fileInventory(stagedCli, "node_modules")).map((file) => file.path);
  const scratch = join(dirname(stagedCli), "archive");
  await mkdir(join(scratch, "package"), { recursive: true });
  await cp(join(stagedCli, "node_modules"), join(scratch, "package/node_modules"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const tarPath = join(scratch, "cli.tar");
  await writeFile(tarPath, gunzipSync(await readFile(archive)));
  const run = promisify(execFile);
  await run("tar", ["-rf", tarPath, "-C", scratch, "package/node_modules"], {
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  const inventory = await run("tar", ["-tf", tarPath], {
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const actual = inventory.stdout
    .split("\n")
    .filter((file) => file.length > 0 && !file.endsWith("/"))
    .map((file) => {
      if (!file.startsWith("package/"))
        throw new CliError("Integrity", "Archive entry outside package root");
      return safePath(file.slice("package/".length));
    });
  const expected = [...expectedRoot, ...dependencies];
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((file) => !expected.includes(file))
  )
    throw new CliError("Integrity", "Bundled archive differs from the exact runtime inventory");
  await writeFile(archive, gzipSync(await readFile(tarPath), { level: 9 }));
}
