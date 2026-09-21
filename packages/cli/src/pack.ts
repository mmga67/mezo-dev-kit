import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  arrayValue,
  digest,
  jsonText,
  parseArtifactSet,
  record,
  safePath,
  textValue,
} from "./contracts.ts";
import type { ArtifactSet } from "./contracts.ts";
import { CliError } from "./errors.ts";
import { containedPath, fileInventory, parseJson, readRequired } from "./filesystem.ts";
import { loadBundle } from "./references.ts";

/** Pack prebuilt private packages with pnpm; never install or publish. */
export async function packPrivateArtifacts(
  sourceRoot: string,
  outputRoot: string,
): Promise<ArtifactSet> {
  await mkdir(outputRoot, { recursive: true });
  await containedPath(outputRoot, "manifest.json");
  if ((await readdir(outputRoot)).length)
    throw new CliError("Conflict", "Artifact output must be empty");
  const bundle = await loadBundle(resolve(sourceRoot, "packages/cli/dist/assets"));
  const packages: ArtifactSet["packages"][number][] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(await containedPath(sourceRoot, directory), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || ["node_modules", "dist"].includes(entry.name)) continue;
      const child = `${directory}/${entry.name}`;
      const entries = await readdir(await containedPath(sourceRoot, child));
      if (!entries.includes("package.json")) {
        await visit(child);
        continue;
      }
      const manifest = record(
        parseJson(await readRequired(sourceRoot, `${child}/package.json`), "package manifest"),
        "package manifest",
      );
      const name = textValue(manifest.name, "package name"),
        version = textValue(manifest.version, "version");
      if (
        name !== "@mezo-dev-kit/cli" &&
        !bundle.packages.some((item) => item.name === name && item.version === version)
      )
        throw new CliError("Incompatible", "Package is outside this bundle");
      const before = new Set(await readdir(outputRoot));
      const packed = await promisify(execFile)(
        "pnpm",
        ["pack", "--json", "--pack-destination", outputRoot],
        {
          cwd: resolve(sourceRoot, child),
          timeout: 60000,
          maxBuffer: 1024 * 1024,
        },
      );
      const report = record(parseJson(Buffer.from(packed.stdout), "pack report"), "pack report");
      if (report.name !== name || report.version !== version)
        throw new CliError("Incompatible", "Packed package identity differs from its source");
      const listed = arrayValue(report.files, "packed files").map((value) =>
        safePath(record(value, "packed file").path),
      );
      const expected = [
        "package.json",
        "LICENSE",
        "README.md",
        "REFERENCE.md",
        ...(await fileInventory(resolve(sourceRoot, child), "dist")).map((item) => item.path),
      ];
      if (name === "@mezo-dev-kit/cli")
        expected.push(
          ...(await fileInventory(resolve(sourceRoot, child), "schema")).map((item) => item.path),
        );
      if (
        new Set(listed).size !== listed.length ||
        listed.length !== expected.length ||
        listed.some((path) => !expected.includes(path))
      )
        throw new CliError(
          "Integrity",
          `Packed contents differ from the declared runtime/docs boundary: ${name}`,
        );
      const added = (await readdir(outputRoot)).filter(
        (path) => !before.has(path) && path.endsWith(".tgz"),
      );
      if (added.length !== 1 || !added[0])
        throw new CliError("Integrity", "Pack did not produce exactly one artifact");
      const path = added[0],
        bytes = await readRequired(outputRoot, path);
      packages.push({ name, version, path, digest: digest(bytes), size: bytes.length });
    }
  }
  await visit("packages");
  const result = parseArtifactSet({
    formatVersion: 1,
    bundleId: bundle.id,
    packages: packages.sort((a, b) => a.name.localeCompare(b.name, "en")),
  });
  await writeFile(resolve(outputRoot, "manifest.json"), jsonText(result), { flag: "wx" });
  return result;
}
