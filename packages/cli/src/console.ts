import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./command.ts";
import type { CommandContext } from "./command.ts";
import { arrayValue, record, textValue, parseConfig, jsonText } from "./contracts.ts";
import { readOptional, readRequired, parseJson, atomicWrite, containedPath } from "./filesystem.ts";
import { CliError, isMissing } from "./errors.ts";
import { loadBundle } from "./references.ts";
import { inspectPackages } from "./project.ts";
import { ConsoleCancelled } from "./console-process.ts";
import type { RunPnpm } from "./console-process.ts";
import type { ConsoleUI } from "./terminal.ts";
import {
  assertApplicationTarget,
  prepareWorkspace,
  validateWorkspace,
} from "./console-workspace.ts";
import { formatResult, formatError } from "./output.ts";

export interface ConsoleOptions extends CommandContext {
  readonly workspace?: string;
  readonly artifacts?: string;
  readonly offline?: boolean;
}

/** Guided local workflows share command validation, compatibility and recovery owners. */
export async function runConsole(
  options: ConsoleOptions,
  ui: ConsoleUI,
  run: RunPnpm,
): Promise<void> {
  let sourceRoot = options.sourceRoot ?? fileURLToPath(new URL("./assets/", import.meta.url));
  let artifacts = options.artifacts;
  let project = resolve(options.cwd);
  const workspace = options.workspace ? resolve(options.workspace) : undefined;
  const offlineArgs = options.offline ? ["--offline"] : [];
  const choice = (value: string, label: string) => ({ value, label });
  const back = choice("back", "Back");
  const command = async (args: readonly string[]) =>
    await runCommand([...args, ...offlineArgs], {
      ...options,
      cwd: project,
      sourceRoot,
      runPnpm: run,
    });
  const show = async (args: readonly string[]): Promise<boolean> => {
    const result = await command(args);
    ui.write(formatResult(args, result));
    return result.exitCode === 0;
  };
  const confirm = async (label: string): Promise<boolean> =>
    (await ui.select(label, [choice("continue", "Continue"), back])) === "continue";
  async function changed(args: readonly string[]): Promise<void> {
    if ((await show([...args, "--dry-run"])) && (await confirm("Apply these changes?")))
      await show(args);
  }
  async function step(label: string, operation: () => Promise<void>): Promise<boolean> {
    while (true) {
      ui.write(`\n${label}…`);
      try {
        await operation();
        ui.write(`✓ ${label}`);
        return true;
      } catch (error) {
        if (error instanceof ConsoleCancelled) throw error;
        ui.write(formatError(error));
        // A person explicitly requests retry; completed stages are never replayed here.
        if (
          !(error instanceof CliError) ||
          error.code !== "Unavailable" ||
          (await ui.select("Completed work has been kept.", [
            choice("retry", "Retry this step"),
            choice("back", "Return to menu"),
          ])) !== "retry"
        )
          return false;
      }
    }
  }
  async function finishStarter(confirmSetup = true): Promise<void> {
    ui.write(
      `\nSet up ${project}\nInstall dependencies, prepare guidance, and run this project's checks.`,
    );
    if (confirmSetup && !(await confirm("Finish setup?"))) return;
    if (
      !(await step("Install dependencies", async () => {
        await run(project, ["install", ...offlineArgs]);
      }))
    )
      return;
    if (
      !(await step("Prepare guidance", async () => {
        const initialized = await readOptional(project, "mdk.lock.json");
        const bundle = await loadBundle(sourceRoot);
        const result = await command(
          initialized
            ? ["sync", "--locked"]
            : bundle.sets?.some((item) => item.id === "base")
              ? ["init", "--set", "base"]
              : ["init", "--domains", "typescript,foundation"],
        );
        if (result.exitCode !== 0)
          throw new CliError(
            "Conflict",
            "Guidance checks failed; use Check setup to inspect the project.",
          );
      }))
    )
      return;
    if (
      !(await step("Run project checks", async () => {
        await run(project, ["check"]);
      }))
    )
      return;
    if (!(await show(["doctor"]))) return;
    ui.write(
      `\nYour project is ready: ${project}\nOpen this folder in your editor. Next time, run pnpm mdk here.`,
    );
  }
  async function create(): Promise<void> {
    const target = resolve(
      project,
      await ui.input("Project directory", workspace ? "../my-mezo-app" : "my-mezo-app"),
    );
    await assertApplicationTarget(dirname(target), workspace);
    await containedPath(dirname(target), basename(target));
    const info = await lstat(target).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (info && (!info.isDirectory() || (await readdir(target)).length))
      throw new CliError("Conflict", "Choose a new or empty project directory.");
    ui.write(
      `\nCreate ${target}\nTypeScript starter · local demo · AI guidance\n${workspace ? "Prepare private artifacts from this checkout, then create the project." : "Use the supplied private artifact set."}\nInstall dependencies, initialize guidance, and run project checks.`,
    );
    if (!(await confirm("Create this project?"))) return;
    if (workspace) {
      if (
        !(await step("Prepare private artifacts", async () => {
          const prepared = await prepareWorkspace(workspace, run);
          sourceRoot = prepared.sourceRoot;
          artifacts = prepared.artifacts;
        }))
      )
        return;
    } else artifacts ??= resolve(project, await ui.input("Private artifact manifest path"));
    if (!artifacts)
      throw new CliError("Unavailable", "A matching private artifact manifest is required.");
    const args = ["create", target, "--template", "typescript", "--artifacts", artifacts];
    await command([...args, "--dry-run"]);
    await command(args);
    project = target;
    ui.write(`✓ Project created: ${project}`);
    await finishStarter(false);
  }
  async function initialize(): Promise<void> {
    await assertApplicationTarget(project, workspace);
    if (workspace) {
      if (!(await confirm("Prepare matching MDK references from this checkout?"))) return;
      if (
        !(await step("Prepare private artifacts", async () => {
          const prepared = await prepareWorkspace(workspace, run);
          sourceRoot = prepared.sourceRoot;
          artifacts = prepared.artifacts;
        }))
      )
        return;
    }
    const selection = await ui.select("Choose guidance", [
      choice("base", "App essentials (install foundation packages, skills and memory)"),
      choice("typescript", "TypeScript guidance (no SDK installation needed)"),
      choice(
        "typescript,foundation",
        "TypeScript + MDK foundations (matching SDKs must already be installed)",
      ),
      back,
    ]);
    if (selection === "back") return;
    if (selection === "base") {
      await addSelection("base", false);
      return;
    }
    await changed(["init", "--domains", selection]);
    ui.write(
      "Existing application instructions and dependency configuration remain application-owned. Use the CLI setup guide if matching SDK artifacts still need installation.",
    );
  }
  async function browse(): Promise<void> {
    const query = await ui.input("Search documentation");
    if (!query) return;
    const result = record((await command(["docs", "search", query])).data, "search result");
    const resources = arrayValue(result.resources, "resources").map((item) =>
      record(item, "resource"),
    );
    if (!resources.length) {
      ui.write("No matching references. Try a shorter topic or package name.");
      return;
    }
    let offset = 0;
    while (true) {
      const page = resources.slice(offset, offset + 6);
      const selected = await ui.select(
        `References ${offset + 1}–${offset + page.length} of ${resources.length}`,
        [
          ...page.map((item) =>
            choice(
              textValue(item.id, "reference ID"),
              `${textValue(item.title, "title")} (${textValue(item.availability, "availability")})`,
            ),
          ),
          ...(offset + 6 < resources.length ? [choice("next", "Next results")] : []),
          ...(offset > 0 ? [choice("previous", "Previous results")] : []),
          back,
        ],
      );
      if (selected === "back") return;
      if (selected === "next") {
        offset += 6;
        continue;
      }
      if (selected === "previous") {
        offset -= 6;
        continue;
      }
      const resource = page.find((item) => item.id === selected);
      if (resource?.availability !== "cached") {
        if (
          !(await confirm(
            "Fetch this pinned reference and its supporting documents, then open it?",
          ))
        )
          continue;
        if (!(await show(["docs", "fetch", selected]))) return;
      }
      await show(["docs", "show", selected]);
    }
  }
  async function guidance(): Promise<void> {
    const current = parseConfig(
      parseJson(await readRequired(project, "mdk.config.json"), "configuration"),
    );
    const bundle = await loadBundle(sourceRoot);
    const query = await ui.input("Find guidance to add (topic or package)");
    const matches = bundle.domains.filter(
      (item) => item.id.includes(query.toLowerCase()) && !current.domains.includes(item.id),
    );
    if (!matches.length) {
      ui.write("No additional matching guidance. Existing selection is unchanged.");
      return;
    }
    const selected = await ui.select(
      "Add guidance (matching SDK packages must already be installed)",
      [...matches.slice(0, 8).map((item) => choice(item.id, item.id)), back],
    );
    if (selected === "back") return;
    const next = parseConfig({ ...current, domains: [...current.domains, selected] });
    await inspectPackages(project, bundle, next);
    if (!(await confirm(`Add ${selected} to mdk.config.json and synchronize guidance?`))) return;
    const observed = parseConfig(
      parseJson(await readRequired(project, "mdk.config.json"), "configuration"),
    );
    if (jsonText(observed) !== jsonText(current))
      throw new CliError(
        "Conflict",
        "Configuration changed while choosing guidance. Review it and retry.",
      );
    await atomicWrite(project, "mdk.config.json", Buffer.from(jsonText(next)));
    ui.write(
      "Selection saved. If synchronization reports a conflict, resolve it and choose Update guidance; the saved selection is retained.",
    );
    await show(["sync"]);
  }
  async function addSelection(id: string, skill: boolean): Promise<void> {
    const retained = await readOptional(project, ".mdk/artifacts/manifest.json");
    const args = [
      "add",
      ...(skill ? ["--skill", id] : [id]),
      ...(!retained && artifacts ? ["--artifacts", artifacts] : []),
    ];
    const preview = await command([...args, "--dry-run"]);
    ui.write(formatResult(args, preview));
    if (preview.exitCode !== 0) return;
    const planned = record(preview.data, "addition preview");
    if (
      !arrayValue(planned.packages, "packages").length &&
      !arrayValue(planned.changed, "changes").length
    ) {
      ui.write("This selection needs no changes.");
      return;
    }
    if (await confirm("Add these packages and skills?"))
      await step("Add capability", async () => {
        await show(args);
      });
  }
  async function capabilities(): Promise<void> {
    const kind = await ui.select("What would you like to add?", [
      choice("sets", "Capability set (packages, skills and references)"),
      choice("skills", "Individual skill"),
      back,
    ]);
    if (kind === "back") return;
    const data = record((await command([kind])).data, "capability catalog");
    const items = arrayValue(data[kind], "catalog entries").map((item) => record(item, "entry"));
    if (!items.length) {
      ui.write(
        "This older bundle has no capability sets. Install a matching current CLI/artifact set to use them.",
      );
      return;
    }
    let offset = 0;
    while (true) {
      const page = items.slice(offset, offset + 6);
      const selected = await ui.select(
        kind === "sets" ? "Choose a capability set" : "Choose a skill",
        [
          ...page.map((item) =>
            choice(
              textValue(item.id ?? item.name, "selection"),
              `${String(item.title ?? item.name)}${item.selected ? " (selected)" : ""}`,
            ),
          ),
          ...(offset + 6 < items.length ? [choice("next", "Next choices")] : []),
          ...(offset > 0 ? [choice("previous", "Previous choices")] : []),
          back,
        ],
      );
      if (selected === "back") return;
      if (selected === "next") {
        offset += 6;
        continue;
      }
      if (selected === "previous") {
        offset -= 6;
        continue;
      }
      const item = page.find((item) => (item.id ?? item.name) === selected);
      if (typeof item?.description === "string") ui.write(item.description);
      await addSelection(selected, kind === "skills");
      return;
    }
  }

  ui.write("\nWelcome to MDK\nChoose with the keyboard. Ctrl+C exits; completed work is kept.");
  if (workspace) {
    await validateWorkspace(workspace);
    project = workspace;
  }
  while (true) {
    try {
      const atWorkspace =
        workspace !== undefined && (await realpath(project)) === (await realpath(workspace));
      const atKit =
        artifacts !== undefined &&
        resolve(project) === dirname(resolve(artifacts)) &&
        (await readOptional(project, "console/private-bin.js")) !== null;
      const atLauncher = atWorkspace || atKit;
      if (!atWorkspace) await assertApplicationTarget(project, workspace);
      if (!atWorkspace && (await readOptional(project, ".mdk/operation/journal.json"))) {
        const action = await ui.select(`Interrupted guidance operation in ${project}`, [
          choice("recover", "Review recovery"),
          choice("exit", "Exit"),
        ]);
        if (action === "exit") return;
        await changed(["recover"]);
        continue;
      }
      const initialized = !atLauncher && (await readOptional(project, "mdk.lock.json")) !== null;
      const packageBytes = !atLauncher ? await readOptional(project, "package.json") : null;
      const starter =
        packageBytes !== null &&
        record(parseJson(packageBytes, "application"), "application").mdkStarter === "typescript";
      const action = await ui.select(
        atLauncher ? "What would you like to do?" : `Project: ${project}`,
        [
          ...(initialized
            ? [
                choice("doctor", "Check setup"),
                ...(starter
                  ? [
                      choice("demo", "Run the local demo"),
                      choice("finish", "Finish or recheck project setup"),
                    ]
                  : []),
                choice("docs", "Browse documentation"),
                choice("capabilities", "Add capabilities or skills"),
                choice("memory", "Search project memory"),
                choice("guidance", "Add reference domains (advanced)"),
                choice("sync", "Update guidance"),
                choice("prompt", "Show a starter prompt for my AI assistant"),
              ]
            : [
                choice("create", "Create a project"),
                ...(!atLauncher
                  ? [
                      choice(
                        starter ? "finish" : "init",
                        starter ? "Finish project setup" : "Set up guidance here",
                      ),
                    ]
                  : []),
              ]),
          choice("existing", "Choose an existing project"),
          ...(atWorkspace ? [choice("kit", "Prepare a portable private kit")] : []),
          choice("exit", "Exit"),
        ],
      );
      if (action === "exit") return;
      if (action === "create") await create();
      else if (action === "existing") {
        const target = resolve(project, await ui.input("Application directory"));
        await assertApplicationTarget(target, workspace);
        await readRequired(target, "package.json");
        project = target;
        // Managing an existing project uses that project's installed CLI assets when available.
        const local = join(project, "node_modules/@mezo-dev-kit/cli/dist/assets");
        const localInfo = await lstat(local).catch((error: unknown) => {
          if (isMissing(error)) return null;
          throw error;
        });
        sourceRoot = options.sourceRoot ?? fileURLToPath(new URL("./assets/", import.meta.url));
        if (localInfo) {
          await loadBundle(local);
          sourceRoot = local;
        }
      } else if (action === "kit" && workspace) {
        const output = resolve(
          workspace,
          await ui.input("New kit directory", "../mdk-private-kit"),
        );
        ui.write(`Build and pack MDK into ${output}. The destination must be new or empty.`);
        if (await confirm("Prepare the kit?")) {
          const prepared = await prepareWorkspace(workspace, run, output);
          artifacts = prepared.artifacts;
          sourceRoot = prepared.sourceRoot;
          ui.write(
            `Kit ready: ${output}\nShare this entire directory. With Node 24+ and the pinned pnpm installed, run node start.ts inside it.`,
          );
        }
      } else if (action === "init") await initialize();
      else if (action === "finish") await finishStarter();
      else if (action === "doctor") await show(["doctor"]);
      else if (action === "sync") await changed(["sync"]);
      else if (action === "docs") await browse();
      else if (action === "guidance") await guidance();
      else if (action === "capabilities") await capabilities();
      else if (action === "memory") {
        const scope = await ui.select("Memory scope", [
          choice("local", "Local project memory"),
          choice("shared", "Shared project memory"),
          back,
        ]);
        if (scope !== "back") {
          const query = await ui.input("Search memory");
          if (query) {
            const result = record(
              (await command(["memory", "search", query, "--scope", scope])).data,
              "memory results",
            );
            const entries = arrayValue(result.entries, "memories").map((value) =>
              record(value, "memory"),
            );
            if (!entries.length) ui.write("No matching project memories.");
            else {
              const id = await ui.select("Open a memory", [
                ...entries.map((entry) =>
                  choice(textValue(entry.id, "memory ID"), textValue(entry.title, "memory title")),
                ),
                back,
              ]);
              if (id !== "back") await show(["memory", "show", id, "--scope", scope]);
            }
          }
        }
      } else if (action === "demo") {
        ui.write(
          "Running this project's pnpm start. The unmodified starter uses local fixture data.",
        );
        await run(project, ["start"]);
      } else if (action === "prompt")
        ui.write(
          "Copy into your AI assistant:\n\nFollow this project's AGENTS.md and selected MDK consumer skills. Inspect src/ and the installed public SDK references using pnpm exec mdk docs search --json. Help me extend the local demo, explain the changes, and run the project checks. Keep sample data clearly labeled; ask me what I want to build first.",
        );
    } catch (error) {
      if (error instanceof ConsoleCancelled) throw error;
      ui.write(formatError(error));
      if ((await ui.select("Next step", [back, choice("exit", "Exit")])) === "exit") return;
    }
  }
}
