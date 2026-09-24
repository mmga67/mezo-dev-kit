import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { arrayValue, jsonText, record, textValue } from "./contracts.ts";
import type { ProjectConfig, ReferenceBundle } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";
import { fileInventory, parseJson, readRequired } from "./filesystem.ts";

export interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly root: string;
}

export function packageManifestDigest(value: unknown): string {
  const manifest = record(value, "package manifest");
  const dependencies = Object.keys(record(manifest.dependencies ?? {}, "dependencies")).sort();
  return createHash("sha256")
    .update(
      jsonText({
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        exports: manifest.exports,
        dependencies,
      }),
    )
    .digest("hex");
}

async function findPackage(name: string, from: string, targetRoot: string): Promise<string | null> {
  let candidateRoot = from;
  for (let depth = 0; depth < 24; depth++) {
    const candidate = resolve(candidateRoot, "node_modules", name);
    const info = await lstat(resolve(candidate, "package.json")).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (info?.isFile()) return realpath(candidate);
    if (candidateRoot === targetRoot || dirname(candidateRoot) === candidateRoot) break;
    candidateRoot = dirname(candidateRoot);
  }
  return null;
}

export async function inspectPackages(
  projectRoot: string,
  bundle: ReferenceBundle,
  config: ProjectConfig,
  options: { readonly allowMissing?: boolean } = {},
): Promise<readonly InstalledPackage[]> {
  const root = resolve(projectRoot);
  const manifest = record(
    parseJson(await readRequired(root, "package.json"), "project package.json"),
    "project manifest",
  );
  const pending: { name: string; from: string }[] = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const name of Object.keys(record(manifest[field] ?? {}, field)))
      if (name.startsWith("@mezo-dev-kit/") && name !== "@mezo-dev-kit/cli")
        pending.push({ name, from: root });
  }
  const installed: InstalledPackage[] = [];
  const visited = new Set<string>();
  while (pending.length) {
    const item = pending.shift();
    if (!item) break;
    if (!/^@mezo-dev-kit\/[a-z0-9-]+$/.test(item.name))
      throw new CliError("InvalidInput", "Invalid MDK dependency name");
    const expected = bundle.packages.find((candidate) => candidate.name === item.name);
    if (!expected) throw new CliError("Incompatible", `No matching guidance for ${item.name}`);
    const directory = await findPackage(item.name, item.from, root);
    if (!directory) {
      if (options.allowMissing) continue;
      throw new CliError(
        "Incompatible",
        `Install the qualified artifact for ${item.name} in this project`,
      );
    }
    if (visited.has(directory)) continue;
    visited.add(directory);
    if (visited.size > 128)
      throw new CliError("InvalidInput", "MDK dependency graph exceeds the supported bound");
    const source = record(
      parseJson(await readRequired(directory, "package.json"), "installed package.json"),
      "installed package manifest",
    );
    if (
      source.name !== expected.name ||
      source.version !== expected.version ||
      packageManifestDigest(source) !== expected.manifestDigest
    )
      throw new CliError(
        "Incompatible",
        `Package metadata differs from the qualified artifact: ${item.name}`,
      );
    if (jsonText(await fileInventory(directory, "dist")) !== jsonText(expected.files))
      throw new CliError(
        "Incompatible",
        `Built files differ from the qualified artifact: ${item.name}`,
      );
    installed.push({ name: expected.name, version: expected.version, root: directory });
    for (const name of Object.keys(record(source.dependencies ?? {}, "dependencies")))
      if (name.startsWith("@mezo-dev-kit/")) pending.push({ name, from: directory });
  }
  for (const selected of config.domains) {
    const domain = bundle.domains.find((item) => item.id === selected);
    if (!domain) throw new CliError("InvalidInput", `Unknown domain: ${selected}`);
    for (const name of domain.packages)
      if (!options.allowMissing && !installed.some((item) => item.name === name))
        throw new CliError(
          "Incompatible",
          `Domain ${selected} requires ${name}; install the qualified artifact first`,
        );
  }
  return installed;
}

/** Read only package metadata; never execute application configuration. */
export async function artifactDependencies(path: string): Promise<readonly string[]> {
  const manifest = record(parseJson(await readFile(path), "package manifest"), "package manifest");
  return arrayValue(
    Object.keys(record(manifest.dependencies ?? {}, "dependencies")),
    "dependencies",
  ).map((name) => textValue(name, "dependency"));
}
