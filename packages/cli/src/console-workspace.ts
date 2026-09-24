import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { record } from "./contracts.ts";
import { readRequired, readOptional, parseJson, containedPath } from "./filesystem.ts";
import { CliError } from "./errors.ts";
import type { RunPnpm } from "./console-process.ts";

export async function validateWorkspace(root: string): Promise<void> {
  const manifest = record(
    parseJson(await readRequired(root, "package.json"), "workspace"),
    "workspace",
  );
  if (manifest.name !== "mezo-dev-kit")
    throw new CliError("InvalidInput", "Choose the MDK repository root for --workspace.");
  await readRequired(root, "scripts/workspace/mdk-distribution.ts");
}

export async function assertApplicationTarget(project: string, workspace?: string): Promise<void> {
  const manifest = await readOptional(project, "package.json");
  if (manifest && record(parseJson(manifest, "application"), "application").name === "mezo-dev-kit")
    throw new CliError(
      "Conflict",
      "Select an external application. Consumer setup cannot run in the MDK repository.",
    );
  if (workspace) {
    const path = relative(await realpath(workspace), await realpath(project));
    if (
      path === "" ||
      (!path.startsWith(`../`) && !path.startsWith(`..\\`) && path !== ".." && !isAbsolute(path))
    )
      throw new CliError("Conflict", "Select an application outside the MDK repository.");
  }
}

/** Fresh outputs avoid reusing stale private snapshots or overwriting retained kits. */
export async function prepareWorkspace(
  root: string,
  run: RunPnpm,
  output?: string,
): Promise<{ sourceRoot: string; artifacts: string }> {
  await validateWorkspace(root);
  await run(root, ["build"]);
  await run(root, ["cli:bundle"]);
  let destination = output;
  if (!destination) {
    await containedPath(root, "local/cli-kits");
    await mkdir(join(root, "local/cli-kits"), { recursive: true });
    destination = await mkdtemp(join(root, "local/cli-kits/kit-"));
  }
  await run(root, ["cli:pack", resolve(destination)]);
  return {
    sourceRoot: join(root, "packages/cli/dist/assets"),
    artifacts: join(destination, "manifest.json"),
  };
}
