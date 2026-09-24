import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, jsonText, parseConfig, parseLock } from "./contracts.ts";
import { CliError } from "./errors.ts";
import { parseJson, readOptional, readRequired } from "./filesystem.ts";
import { inspectPackages } from "./project.ts";
import { fetchReferences, installedBundle, loadBundle, showReference } from "./references.ts";
import { synchronizeProject } from "./setup.ts";
import { assertNoOperation, recoverChanges } from "./transactions.ts";
import { createProject } from "./create.ts";
import { addCapability, capabilityCatalog, selectionDomains } from "./capabilities.ts";
import type { ReadPnpm, RunPnpm } from "./console-process.ts";
import { memoryCommand } from "./memory.ts";

export interface CommandContext {
  readonly cwd: string;
  readonly sourceRoot?: string;
  readonly now?: Date;
  readonly fetch?: typeof globalThis.fetch;
  readonly runPnpm?: RunPnpm;
  readonly readPnpm?: ReadPnpm;
}
export interface CommandResult {
  readonly exitCode: number;
  readonly data: unknown;
}
const help = `MDK standalone project utility (private source alpha)

mdk                         Open the guided console in an interactive terminal
mdk console                 Explicit console (--plain for numbered prompts)
mdk init [--domains typescript,foundation] [--skills-dir .agents/skills]
mdk init --set base          Initialize guidance for already installed packages
mdk sets | skills           List this bundle's capability sets or portable skills
mdk add <set>               Install matching packages, skills and references
mdk add --skill <name>       Add one skill and its required domains
mdk create <directory> --template typescript --artifacts <manifest.json>
mdk sync [--locked] [--check]
mdk doctor
mdk docs search <query>
mdk docs show <reference-id>
mdk docs fetch <reference-id> | --all
mdk recover
mdk memory search <query> | show <id> | check
mdk memory save --file <entry.json> [--scope local|shared]

Common: --project <directory>, --bundle <asset-directory>, --json, --offline
Mutations: --dry-run. No global installation or signer is required.
`;

export async function runCommand(
  args: readonly string[],
  context: CommandContext,
): Promise<CommandResult> {
  let parsed: ReturnType<typeof parseCliArguments>;
  try {
    parsed = parseCliArguments(args);
  } catch {
    throw new CliError("InvalidInput", "Invalid command arguments; run mdk --help");
  }
  const { values, positionals } = parsed;
  if (values.help || !positionals.length) return { exitCode: 0, data: help };
  const [command, subcommand, ...rest] = positionals;
  const allowed: Record<string, readonly string[]> = {
    init: ["domains", "set", "skills-dir", "dry-run"],
    sets: [],
    skills: [],
    add: ["skill", "artifacts", "dry-run"],
    sync: ["locked", "check", "dry-run"],
    doctor: [],
    create: ["template", "artifacts", "dry-run"],
    recover: ["dry-run"],
    "docs search": [],
    "docs show": [],
    "docs fetch": ["all", "dry-run"],
    "memory search": ["scope", "domain"],
    "memory show": ["scope"],
    "memory check": ["scope"],
    "memory save": ["scope", "file", "dry-run"],
  };
  const key =
    command === "docs" || command === "memory" ? `${command} ${subcommand}` : (command ?? "");
  const selected = allowed[key];
  if (!selected) throw new CliError("InvalidInput", "Unknown command; run mdk --help");
  for (const name of Object.keys(values))
    if (!["project", "bundle", "offline", "json", "no-input", ...selected].includes(name))
      throw new CliError("InvalidInput", `Option --${name} does not apply to ${key}`);
  const project = resolve(context.cwd, values.project ?? ".");
  const sourceRoot = resolve(
    context.cwd,
    values.bundle ?? context.sourceRoot ?? fileURLToPath(new URL("./assets/", import.meta.url)),
  );
  const retrieval = {
    offline: values.offline === true,
    dryRun: values["dry-run"] === true,
    ...(context.fetch ? { fetch: context.fetch } : {}),
  };
  if (command === "recover") {
    if (subcommand) throw new CliError("InvalidInput", "recover takes no positional argument");
    return { exitCode: 0, data: await recoverChanges(project, retrieval.dryRun) };
  }
  if (command === "create") {
    if (!subcommand || rest.length || values.template !== "typescript" || !values.artifacts)
      throw new CliError(
        "InvalidInput",
        "Use create <directory> --template typescript --artifacts <manifest.json> for the private pilot",
      );
    return {
      exitCode: 0,
      data: await createProject(
        resolve(project, subcommand),
        sourceRoot,
        resolve(context.cwd, values.artifacts),
        retrieval.dryRun,
      ),
    };
  }
  if (command === "sets" || command === "skills" || command === "add") {
    const bundle = await loadBundle(sourceRoot);
    if (command === "add") {
      if (rest.length || Boolean(subcommand) === Boolean(values.skill))
        throw new CliError("InvalidInput", "Use add <set> or add --skill <name>");
      return {
        exitCode: 0,
        data: await addCapability(project, sourceRoot, bundle, subcommand ?? values.skill ?? "", {
          ...retrieval,
          skill: values.skill !== undefined,
          ...(values.artifacts ? { artifacts: resolve(context.cwd, values.artifacts) } : {}),
          ...(context.runPnpm ? { run: context.runPnpm } : {}),
          ...(context.readPnpm ? { read: context.readPnpm } : {}),
        }),
      };
    }
    if (subcommand) throw new CliError("InvalidInput", `${command} takes no positional arguments`);
    const bytes = await readOptional(project, "mdk.config.json");
    const catalog = capabilityCatalog(
      bundle,
      bytes ? parseConfig(parseJson(bytes, "configuration")) : null,
    );
    return { exitCode: 0, data: { [command]: catalog[command] } };
  }
  if (command === "init" || command === "sync") {
    if (subcommand) throw new CliError("InvalidInput", `${command} takes no positional arguments`);
    const bundle = await loadBundle(sourceRoot);
    if (values.set && values.domains)
      throw new CliError("InvalidInput", "Choose --set or --domains, not both");
    const config =
      values.domains || values.set || values["skills-dir"]
        ? parseConfig({
            formatVersion: 1,
            domains: values.set
              ? selectionDomains(bundle, values.set)
              : (values.domains?.split(",") ?? ["typescript"]),
            skillsDirectory: values["skills-dir"] ?? ".agents/skills",
            references: { mode: "selected" },
          })
        : undefined;
    return {
      exitCode: 0,
      data: await synchronizeProject(project, sourceRoot, bundle, {
        ...retrieval,
        initialize: command === "init",
        locked: values.locked === true,
        check: values.check === true,
        ...(config ? { config } : {}),
      }),
    };
  }
  await assertNoOperation(project);
  const bundle = await installedBundle(project);
  if (command === "memory") {
    const config = parseConfig(
      parseJson(await readRequired(project, "mdk.config.json"), "configuration"),
    );
    if (!config.domains.includes("memory"))
      throw new CliError("Unavailable", "Add project memory first: mdk add memory");
    const scope = values.scope ?? "local";
    if (scope !== "local" && scope !== "shared")
      throw new CliError("InvalidInput", "Memory scope must be local or shared");
    if (subcommand === "search" || subcommand === "show" ? rest.length !== 1 : rest.length !== 0)
      throw new CliError(
        "InvalidInput",
        "Use one quoted query/ID for memory search/show; save/check take no positional value",
      );
    if (subcommand === "save" && !values.file)
      throw new CliError("InvalidInput", "Use memory save --file <entry.json>");
    return {
      exitCode: 0,
      data: await memoryCommand(project, subcommand ?? "", {
        scope,
        dryRun: retrieval.dryRun,
        ...(rest[0] ? { query: rest[0], id: rest[0] } : {}),
        ...(values.file ? { file: resolve(context.cwd, values.file) } : {}),
        ...(values.domain ? { domain: values.domain } : {}),
      }),
    };
  }
  if (command === "doctor") {
    if (subcommand) throw new CliError("InvalidInput", "doctor takes no positional arguments");
    const issues: { code: string; message: string }[] = [];
    const warnings: { id: string; reviewAfter: string }[] = [];
    const config = parseConfig(
      parseJson(await readRequired(project, "mdk.config.json"), "project configuration"),
    );
    const lock = parseLock(
      parseJson(await readRequired(project, "mdk.lock.json"), "guidance lock"),
    );
    if (jsonText(config) !== jsonText(lock.config))
      issues.push({
        code: "ConfigurationChanged",
        message: "Run sync after reviewing configuration changes",
      });
    try {
      await inspectPackages(project, bundle, config);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      issues.push({ code: error.code, message: error.message });
    }
    for (const file of lock.files) {
      const bytes = await readOptional(project, file.path);
      if (!bytes || digest(bytes) !== file.digest)
        issues.push({ code: "GuidanceDrift", message: file.path });
    }
    let cached = 0;
    const now = context.now ?? new Date();
    for (const resource of bundle.resources) {
      const bytes = await readOptional(project, `.mdk/reference/${resource.path}`);
      if (bytes) {
        if (digest(bytes) === resource.digest) cached++;
        else issues.push({ code: "ReferenceIntegrity", message: resource.id });
        if (resource.reviewAfter && Date.parse(resource.reviewAfter) <= now.getTime())
          warnings.push({ id: resource.id, reviewAfter: resource.reviewAfter });
      }
    }
    return {
      exitCode: issues.length ? 1 : 0,
      data: {
        bundle: bundle.id,
        source: bundle.source,
        issues,
        warnings,
        cached,
        total: bundle.resources.length,
        excluded: bundle.exclusions.length,
        note: "Recorded evidence only; no live RPC or protocol verification was performed.",
      },
    };
  }
  const id = rest[0];
  if (subcommand === "fetch") {
    if (rest.length > 1 || Boolean(id) === (values.all === true))
      throw new CliError("InvalidInput", "Provide one reference ID or --all");
    const result = await fetchReferences(
      project,
      sourceRoot,
      bundle,
      values.all ? bundle.resources.map((item) => item.id) : [id ?? ""],
      retrieval,
    );
    return { exitCode: result.missing.length ? 1 : 0, data: result };
  }
  if (!id || rest.length !== 1)
    throw new CliError("InvalidInput", "Provide one quoted search query or reference ID");
  if (subcommand === "show") return { exitCode: 0, data: await showReference(project, bundle, id) };
  const terms = id.toLowerCase().split(/\s+/).filter(Boolean);
  const found = [];
  for (const resource of bundle.resources)
    if (
      terms.every((term) =>
        `${resource.id} ${resource.title} ${resource.sourcePath} ${resource.recordIds.join(" ")} ${resource.searchTerms.join(" ")} ${resource.domains.join(" ")}`
          .toLowerCase()
          .includes(term),
      )
    ) {
      const bytes = await readOptional(project, `.mdk/reference/${resource.path}`);
      found.push({
        ...resource,
        availability: bytes
          ? digest(bytes) === resource.digest
            ? "cached"
            : "corrupt"
          : "indexed",
        localPath: resolve(project, ".mdk/reference", resource.path),
      });
    }
  return {
    exitCode: 0,
    data: {
      resources: found,
      excluded: bundle.exclusions.filter((item) =>
        terms.every((term) => `${item.id} ${item.sourcePath}`.toLowerCase().includes(term)),
      ),
    },
  };
}
function parseCliArguments(args: readonly string[]) {
  return parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean" },
      json: { type: "boolean" },
      "no-input": { type: "boolean" },
      offline: { type: "boolean" },
      "dry-run": { type: "boolean" },
      locked: { type: "boolean" },
      check: { type: "boolean" },
      all: { type: "boolean" },
      project: { type: "string" },
      bundle: { type: "string" },
      domains: { type: "string" },
      set: { type: "string" },
      skill: { type: "string" },
      scope: { type: "string" },
      domain: { type: "string" },
      file: { type: "string" },
      "skills-dir": { type: "string" },
      template: { type: "string" },
      artifacts: { type: "string" },
    },
  });
}
