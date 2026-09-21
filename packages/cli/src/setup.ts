import { digest, jsonText, parseConfig, parseLock } from "./contracts.ts";
import type { GuidanceLock, ProjectConfig, ReferenceBundle } from "./contracts.ts";
import { CliError } from "./errors.ts";
import { parseJson, readOptional, readRequired } from "./filesystem.ts";
import { inspectPackages } from "./project.ts";
import { installedBundle, obtainResource, resourceClosure, verifyResource } from "./references.ts";
import type { RetrievalOptions } from "./references.ts";
import { applyChanges, assertNoOperation } from "./transactions.ts";
import type { FileChange } from "./transactions.ts";

export interface SetupOptions extends RetrievalOptions {
  readonly initialize?: boolean;
  readonly locked?: boolean;
  readonly check?: boolean;
  readonly config?: ProjectConfig;
}
export interface SetupResult {
  readonly changed: readonly string[];
  readonly compatible: true;
  readonly instructions: "created" | "preserved" | "absent";
  readonly routing: string | null;
  readonly dryRun: boolean;
}

export async function synchronizeProject(
  project: string,
  sourceRoot: string,
  bundle: ReferenceBundle,
  options: SetupOptions = {},
): Promise<SetupResult> {
  await assertNoOperation(project);
  const configBytes = await readOptional(project, "mdk.config.json");
  const lockBytes = await readOptional(project, "mdk.lock.json");
  const previous = lockBytes ? parseLock(parseJson(lockBytes, "guidance lock")) : null;
  if (!options.initialize && (!configBytes || !previous))
    throw new CliError("Unavailable", "Initialize the project before synchronizing guidance");
  const config = configBytes
    ? parseConfig(parseJson(configBytes, "project config"))
    : (options.config ?? {
        formatVersion: 1,
        domains: ["typescript"],
        skillsDirectory: ".agents/skills",
        references: { mode: "selected" },
      });
  if (options.config && configBytes && jsonText(options.config) !== jsonText(config))
    throw new CliError(
      "Conflict",
      "Existing mdk.config.json is application-owned; edit it explicitly before sync",
    );
  if (
    options.locked &&
    (previous?.bundleId !== bundle.id || jsonText(previous.config) !== jsonText(config))
  )
    throw new CliError(
      "Incompatible",
      "Locked restore requires the recorded bundle and configuration; install its matching CLI/artifact",
    );
  await inspectPackages(project, bundle, config);
  const previousIndex =
    previous && (await readOptional(project, ".mdk/reference/bundle.json"))
      ? await installedBundle(project)
      : null;
  if (previous && previous.bundleId !== bundle.id && !previousIndex)
    throw new CliError(
      "Unavailable",
      "Restore the previous locked index before upgrading guidance",
    );
  const cachedResources =
    previousIndex?.resources ?? (previous?.bundleId === bundle.id ? bundle.resources : []);
  const desired = new Map<string, Buffer>();
  desired.set(".mdk/reference/bundle.json", Buffer.from(jsonText(bundle)));
  for (const skill of bundle.skills.filter((item) =>
    item.domains.some((domain) => config.domains.includes(domain)),
  )) {
    for (const file of skill.files) {
      const bytes = await readRequired(sourceRoot, `skills/${skill.name}/${file.path}`);
      verifyResource(bytes, file);
      desired.set(`${config.skillsDirectory}/${skill.name}/${file.path}`, bytes);
    }
  }
  const ids =
    config.references.mode === "all"
      ? bundle.resources.map((item) => item.id)
      : bundle.domains
          .filter((item) => config.domains.includes(item.id))
          .flatMap((item) => item.resources);
  for (const resource of resourceClosure(bundle, ids)) {
    const path = `.mdk/reference/${resource.path}`;
    const existing = await readOptional(project, path);
    if (existing && digest(existing) === resource.digest) desired.set(path, existing);
    else {
      // Previews/checks use local artifact bytes and never fetch remote resources.
      if (options.dryRun || options.check) {
        const source = await readOptional(sourceRoot, resource.path);
        if (source) {
          verifyResource(source, resource);
          desired.set(path, source);
        } else
          throw new CliError(
            "Unavailable",
            `Preview requires the local artifact for ${resource.id}; no network request was made`,
          );
      } else desired.set(path, await obtainResource(sourceRoot, bundle, resource, options));
    }
  }
  const next: GuidanceLock = {
    formatVersion: 1,
    bundleId: bundle.id,
    config,
    files: [...desired]
      .map(([path, bytes]) => ({ path, digest: digest(bytes), size: bytes.length }))
      .sort((a, b) => a.path.localeCompare(b.path, "en")),
  };
  const changes: FileChange[] = [];
  const owned = new Map(previous?.files.map((item) => [item.path, item]) ?? []);
  for (const [path, after] of desired) {
    const before = await readOptional(project, path);
    const prior = owned.get(path);
    if (before && prior && digest(before) !== prior.digest)
      throw new CliError("Conflict", `Managed file has local edits: ${path}`);
    if (before && !prior) {
      // Verified resource cache entries are identified by the installed index, not a name prefix.
      const cached = cachedResources.some(
        (item) => path === `.mdk/reference/${item.path}` && digest(before) === item.digest,
      );
      if (!cached) throw new CliError("Conflict", `Unowned file already exists: ${path}`);
    }
    if (!before || digest(before) !== digest(after)) changes.push({ path, before, after });
  }
  for (const item of previous?.files ?? []) {
    if (desired.has(item.path)) continue;
    const before = await readOptional(project, item.path);
    if (before && digest(before) !== item.digest)
      throw new CliError("Conflict", `Removed managed file has local edits: ${item.path}`);
    if (before) changes.push({ path: item.path, before, after: null });
  }
  // Retire obsolete on-demand cache entries only with proof from the old locked index.
  for (const item of cachedResources) {
    const path = `.mdk/reference/${item.path}`;
    if (
      desired.has(path) ||
      owned.has(path) ||
      bundle.resources.some(
        (resource) => resource.path === item.path && resource.digest === item.digest,
      )
    )
      continue;
    const before = await readOptional(project, path);
    if (before && digest(before) !== item.digest)
      throw new CliError("Conflict", `Obsolete cached resource has local edits: ${path}`);
    if (before) changes.push({ path, before, after: null });
  }
  const instructions = await readOptional(project, "AGENTS.md");
  if (!instructions && options.initialize) {
    const template = await readRequired(sourceRoot, bundle.template.path);
    verifyResource(template, bundle.template);
    const rendered = template
      .toString("utf8")
      .replaceAll(".agents/skills/", `${config.skillsDirectory}/`);
    changes.push({ path: "AGENTS.md", before: null, after: Buffer.from(rendered) });
  }
  if (!configBytes)
    changes.push({ path: "mdk.config.json", before: null, after: Buffer.from(jsonText(config)) });
  const nextLock = Buffer.from(jsonText(next));
  if (!lockBytes || digest(lockBytes) !== digest(nextLock))
    changes.push({ path: "mdk.lock.json", before: lockBytes, after: nextLock });
  if (options.check && changes.length)
    throw new CliError(
      "Conflict",
      `Guidance drift: ${changes.map((item) => item.path).join(", ")}`,
    );
  await applyChanges(project, changes, {
    dryRun: options.dryRun === true || options.check === true,
    precondition: async () => {
      const currentConfig = await readOptional(project, "mdk.config.json");
      if (configBytes && (!currentConfig || digest(configBytes) !== digest(currentConfig)))
        throw new CliError("Conflict", "Configuration changed during update");
      await inspectPackages(project, bundle, config);
    },
  });
  return {
    changed: changes.map((item) => item.path),
    compatible: true,
    instructions: instructions ? "preserved" : options.initialize ? "created" : "absent",
    routing: instructions
      ? "In application AGENTS.md, route MDK work to the consumer skills selected by mdk.config.json. Use pnpm exec mdk docs search, show and explicit fetch for matching references."
      : null,
    dryRun: options.dryRun === true || options.check === true,
  };
}
