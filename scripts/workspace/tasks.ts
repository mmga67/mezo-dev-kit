import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditLocalTasks, createLocalTask, setupLocalTasks, TASK_STATES } from "../lib/tasks.ts";

export async function runTasks(args: readonly string[], root = process.cwd()): Promise<void> {
  const [command, ...rest] = args;
  if (
    command === "setup" &&
    (rest.length === 0 || (rest.length === 1 && rest[0] === "--refresh"))
  ) {
    await setupLocalTasks(root, rest[0] === "--refresh");
    process.stdout.write("Local task guidance ready. Individual records remain ignored.\n");
  } else if (
    command === "new" &&
    (rest.length === 1 || (rest.length === 3 && rest[1] === "--parent"))
  ) {
    const slug = rest[0];
    if (!slug) throw new Error("missing task name");
    const path = await createLocalTask({ root, slug, ...(rest[2] ? { parent: rest[2] } : {}) });
    process.stdout.write(`${path}\n`);
  } else if ((command === "check" || command === "list") && rest.length === 0) {
    const result = await auditLocalTasks(root);
    if (!result.present) {
      process.stdout.write(
        "Local task tree absent; no private records required in this checkout.\n",
      );
      return;
    }
    if (command === "list")
      for (const path of result.instructions)
        process.stdout.write(`Local instructions (read when applicable): ${path}\n`);
    for (const diagnostic of result.diagnostics)
      process.stderr.write(`${diagnostic.path}: ${diagnostic.message}\n`);
    if (result.diagnostics.length)
      throw new Error(`local task validation failed (${result.diagnostics.length} issues)`);
    if (command === "list") {
      for (const task of result.tasks) process.stdout.write(`${task.state}\t${task.path}\n`);
    }
    process.stdout.write(
      `Local tasks valid: ${result.tasks.length}; ${TASK_STATES.map((state) => `${state}=${result.tasks.filter((t) => t.state === state).length}`).join(", ")}. Structural checks do not establish human acceptance or live evidence.\n`,
    );
  } else
    throw new Error(
      "usage: tasks.ts setup [--refresh] | check | list | new <kebab-name> [--parent TASK-NNN]",
    );
}
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runTasks(process.argv.slice(2));
