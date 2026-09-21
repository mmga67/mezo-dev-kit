import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { arrayValue, record, textValue } from "./contracts.ts";
import { CliError } from "./errors.ts";

/** Ask the pinned package manager to interpret its lock; do not implement a YAML parser. */
export async function lockedDependencyPins(
  sourceRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const { stdout } = await promisify(execFile)(
    "pnpm",
    ["list", "--recursive", "--depth", "Infinity", "--json", "--lockfile-only"],
    { cwd: sourceRoot, maxBuffer: 24 * 1024 * 1024, timeout: 30000 },
  );
  const roots: unknown = JSON.parse(stdout);
  const versions = new Map<string, Set<string>>();
  const selectors = new Map<string, string>();
  let count = 0;
  function walk(value: unknown, parent?: string): void {
    const item = record(value, "locked package");
    if (++count > 100000)
      throw new CliError("InvalidInput", "Dependency projection exceeds its bound");
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, value] of Object.entries(
        record(item[field] ?? {}, "locked dependencies"),
      )) {
        const dependency = record(value, "locked dependency");
        const version = textValue(dependency.version, "locked version");
        if (name.startsWith("@mezo-dev-kit/")) {
          walk(value);
          continue;
        }
        if (
          !/^(?:@[a-z0-9-]+\/)?[a-z0-9_.-]+$/.test(name) ||
          !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)
        )
          throw new CliError(
            "InvalidInput",
            "Only exact registry versions are qualified for starter tooling",
          );
        const found = versions.get(name) ?? new Set<string>();
        found.add(version);
        versions.set(name, found);
        if (parent) {
          const key = `${parent}>${name}`;
          if (selectors.has(key) && selectors.get(key) !== version)
            throw new CliError("Incompatible", "Ambiguous locked dependency projection");
          selectors.set(key, version);
        }
        walk(value, `${name}@${version}`);
      }
    }
  }
  for (const root of arrayValue(roots, "workspace dependency trees")) walk(root);
  for (const [name, found] of versions)
    if (found.size === 1) {
      const version = [...found][0];
      if (version) selectors.set(name, version);
    }
  return Object.fromEntries([...selectors].sort(([a], [b]) => a.localeCompare(b, "en")));
}
