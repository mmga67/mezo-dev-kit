import { basename, dirname, resolve } from "node:path";
import { digest, jsonText, parseArtifactSet, parseConfig, record, textValue } from "./contracts.ts";
import type { CapabilitySet, ProjectConfig, ReferenceBundle } from "./contracts.ts";
import { CliError } from "./errors.ts";
import { atomicWrite, parseJson, readOptional, readRequired } from "./filesystem.ts";
import { inspectPackages } from "./project.ts";
import { verifyResource } from "./references.ts";
import { synchronizeProject } from "./setup.ts";
import { assertNoOperation } from "./transactions.ts";
import { readPnpm, runPnpmCommand } from "./console-process.ts";
import type { ReadPnpm, RunPnpm } from "./console-process.ts";

export function selectionDomains(
  bundle: ReferenceBundle,
  id: string,
  skill = false,
): readonly string[] {
  const selected = skill
    ? bundle.skills.find((item) => item.name === id)
    : bundle.sets?.find((item) => item.id === id);
  if (!selected)
    throw new CliError(
      "InvalidInput",
      `Unknown ${skill ? "skill" : "set"}: ${id}. Use mdk ${skill ? "skills" : "sets"} to list this bundle's choices.`,
    );
  return selected.domains;
}

interface CapabilityCatalog {
  readonly sets: readonly (CapabilitySet & {
    readonly selected: boolean;
    readonly packages: readonly string[];
    readonly skills: readonly string[];
  })[];
  readonly skills: readonly {
    readonly name: string;
    readonly domains: readonly string[];
    readonly selected: boolean;
  }[];
}
interface AdditionResult {
  readonly selection: string;
  readonly kind: string;
  readonly domains: readonly string[];
  readonly packages: readonly string[];
  readonly skills: readonly string[];
  readonly changed: readonly string[];
  readonly dryRun: boolean;
  readonly complete: boolean;
}

export function capabilityCatalog(
  bundle: ReferenceBundle,
  config: ProjectConfig | null,
): CapabilityCatalog {
  return {
    sets: (bundle.sets ?? []).map((item) => ({
      ...item,
      selected: item.domains.every((id) => config?.domains.includes(id)),
      ...selectionContents(bundle, item.domains),
    })),
    skills: bundle.skills.map((item) => ({
      name: item.name,
      domains: item.domains,
      selected: item.domains.some((id) => config?.domains.includes(id)),
    })),
  };
}

function selectionContents(bundle: ReferenceBundle, domains: readonly string[]) {
  return {
    packages: [
      ...new Set(
        bundle.domains.filter((item) => domains.includes(item.id)).flatMap((item) => item.packages),
      ),
    ].sort(),
    skills: bundle.skills
      .filter((item) => item.domains.some((id) => domains.includes(id)))
      .map((item) => item.name),
  };
}

/** Private-artifact additions never choose upgrades or mutate a parent workspace. */
export async function addCapability(
  project: string,
  sourceRoot: string,
  bundle: ReferenceBundle,
  id: string,
  options: {
    readonly skill?: boolean;
    readonly dryRun?: boolean;
    readonly offline?: boolean;
    readonly artifacts?: string;
    readonly run?: RunPnpm;
    readonly read?: ReadPnpm;
  } = {},
): Promise<AdditionResult> {
  await assertNoOperation(project);
  const selected = selectionDomains(bundle, id, options.skill);
  const manifestBytes = await readRequired(project, "package.json");
  const manifest = record(parseJson(manifestBytes, "application package.json"), "application");
  if (manifest.name === "mezo-dev-kit")
    throw new CliError(
      "Conflict",
      "Select an external application before adding consumer capabilities.",
    );
  const configBytes = await readOptional(project, "mdk.config.json");
  const current = configBytes ? parseConfig(parseJson(configBytes, "configuration")) : null;
  const config: ProjectConfig = parseConfig({
    ...(current ?? {
      formatVersion: 1,
      skillsDirectory: ".agents/skills",
      references: { mode: "selected" },
    }),
    domains: [...new Set([...(current?.domains ?? []), ...selected])],
  });
  const installed = await inspectPackages(project, bundle, config, { allowMissing: true });
  const contents = selectionContents(bundle, config.domains);
  const dependencies = record(manifest.dependencies ?? {}, "application dependencies");
  const adding = contents.packages.filter(
    (name) => !Object.hasOwn(dependencies, name) || !installed.some((item) => item.name === name),
  );
  const preview = await synchronizeProject(project, sourceRoot, bundle, {
    initialize: true,
    dryRun: true,
    previewConfig: config,
    offline: true,
  });
  const files = new Map<string, Buffer>();
  const pins: Record<string, string> = {};
  let overrides: Record<string, unknown> = {};
  const settingsBytes = await readOptional(project, "pnpm-workspace.yaml");
  if (adding.length) {
    // Existing multi-package workspaces need an explicitly scoped integration, not implicit root edits.
    for (
      let parent = dirname(resolve(project));
      parent !== dirname(parent);
      parent = dirname(parent)
    )
      if (await readOptional(parent, "pnpm-workspace.yaml"))
        throw new CliError(
          "Conflict",
          "Automatic package addition requires an independent project outside a parent pnpm workspace.",
        );
    const read = options.read ?? readPnpm;
    const templateFile = bundle.starter.find((item) => item.path === "package.template.json");
    if (!templateFile)
      throw new CliError("Unavailable", "This bundle lacks a qualified private-install toolchain");
    const templateBytes = await readRequired(sourceRoot, "starter/package.template.json");
    verifyResource(templateBytes, templateFile);
    const template = record(parseJson(templateBytes, "starter package manifest"), "starter");
    const packageManager = textValue(template.packageManager, "pinned package manager");
    if (
      !/^pnpm@\d+\.\d+\.\d+$/.test(packageManager) ||
      (manifest.packageManager !== undefined && manifest.packageManager !== packageManager)
    )
      throw new CliError(
        "Incompatible",
        `Use ${packageManager} for private capability installation; package-manager migration is application-owned.`,
      );
    if ((await read(project, ["--version"])).trim() !== packageManager.slice(5))
      throw new CliError("Incompatible", `Capability installation requires ${packageManager}.`);
    const raw = (
      await read(project, ["config", "get", "overrides", "--json", "--location", "project"])
    ).trim();
    overrides =
      raw === "undefined" || raw === "null" || raw === ""
        ? {}
        : record(parseJson(Buffer.from(raw), "pnpm overrides"), "overrides");
    const path = options.artifacts ?? resolve(project, ".mdk/artifacts/manifest.json");
    const artifacts = parseArtifactSet(
      parseJson(await readRequired(dirname(path), basename(path)), "artifact manifest"),
    );
    if (artifacts.bundleId !== bundle.id)
      throw new CliError(
        "Incompatible",
        "Use the artifact manifest matching this CLI's reference bundle.",
      );
    for (const expected of bundle.packages) {
      const artifact = artifacts.packages.find(
        (item) => item.name === expected.name && item.version === expected.version,
      );
      if (!artifact) throw new CliError("Incompatible", `Artifact set is missing ${expected.name}`);
      const bytes = await readRequired(dirname(path), artifact.path);
      verifyResource(bytes, artifact);
      const target = `.mdk/artifacts/${digest(artifact.name)}.tgz`;
      const existing = await readOptional(project, target);
      if (existing && digest(existing) !== artifact.digest)
        throw new CliError(
          "Conflict",
          `Existing artifact differs: ${artifact.name}. SDK upgrades require an explicitly matched artifact set.`,
        );
      if (!existing) files.set(target, bytes);
      pins[artifact.name] = `file:./${target}`;
    }
    // Reject existing MDK override policy instead of silently taking ownership of it.
    for (const [name, value] of Object.entries(overrides)) {
      if (name === "@mezo-dev-kit/cli") continue;
      if (name.includes("@mezo-dev-kit/") && (!Object.hasOwn(pins, name) || value !== pins[name]))
        throw new CliError(
          "Conflict",
          `Existing MDK override differs: ${name}. Reconcile it with the selected private artifacts first.`,
        );
    }
    const retained = Buffer.from(
      jsonText({
        ...artifacts,
        packages: artifacts.packages
          .filter((item) => bundle.packages.some((pkg) => pkg.name === item.name))
          .map((item) => ({ ...item, path: `${digest(item.name)}.tgz` })),
      }),
    );
    if (!(await readOptional(project, ".mdk/artifacts/manifest.json")))
      files.set(".mdk/artifacts/manifest.json", retained);
  }
  const changedConfig = !configBytes || jsonText(current) !== jsonText(config);
  const result = {
    selection: id,
    kind: options.skill ? "skill" : "set",
    domains: config.domains,
    packages: adding,
    skills: selectionContents(bundle, selected).skills,
    changed: [
      ...new Set([
        ...files.keys(),
        ...(adding.length ? ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"] : []),
        ...(changedConfig ? ["mdk.config.json"] : []),
        ...preview.changed,
      ]),
    ],
    dryRun: options.dryRun === true,
    complete: false,
  };
  if (options.dryRun) return result;
  // Recheck files used for the review before the package manager can mutate them.
  for (const [path, before] of [
    ["package.json", manifestBytes],
    ["mdk.config.json", configBytes],
    ["pnpm-workspace.yaml", settingsBytes],
  ] as const) {
    const now = await readOptional(project, path);
    if (before === null ? now !== null : now === null || digest(before) !== digest(now))
      throw new CliError("Conflict", `File changed during addition: ${path}`);
  }
  for (const [path, bytes] of files) {
    if (await readOptional(project, path))
      throw new CliError("Conflict", `File appeared during addition: ${path}`);
    await atomicWrite(project, path, bytes);
  }
  if (adding.length) {
    const run = options.run ?? runPnpmCommand;
    // Force pnpm's project location to this directory, including projects with an .npmrc.
    if (!settingsBytes) await atomicWrite(project, "pnpm-workspace.yaml", Buffer.from("{}\n"));
    await run(project, [
      "config",
      "set",
      "--location",
      "project",
      "--json",
      "overrides",
      JSON.stringify({ ...overrides, ...pins }),
    ]);
    await run(project, [
      "add",
      "--save-prod",
      "--ignore-workspace-root-check",
      "--ignore-scripts",
      ...(options.offline ? ["--offline"] : []),
      ...adding.map((name) => `${name}@${pins[name]}`),
    ]);
  }
  await inspectPackages(project, bundle, config);
  const observed = await readOptional(project, "mdk.config.json");
  if (
    configBytes === null
      ? observed !== null
      : observed === null || digest(observed) !== digest(configBytes)
  )
    throw new CliError(
      "Conflict",
      "Configuration changed during installation; dependencies are retained. Review the selection and retry.",
    );
  // An explicit add owns this one application-config change; sync retains its normal ownership rules.
  if (changedConfig) await atomicWrite(project, "mdk.config.json", Buffer.from(jsonText(config)));
  const synchronized = await synchronizeProject(project, sourceRoot, bundle, {
    initialize: true,
    offline: options.offline === true,
  });
  return {
    ...result,
    changed: [...new Set([...result.changed, ...synchronized.changed])],
    complete: true,
  };
}
