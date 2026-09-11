import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const TASK_STATES = ["backlog", "active", "blocked", "review", "done"] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const TASK_SECTIONS = [
  "Goal",
  "Scope",
  "Context / Sources",
  "Affected Domains",
  "Deliverables",
  "Acceptance Criteria",
  "Verification",
  "Dependencies / Blockers",
  "Progress",
  "Decisions",
  "Follow-ups",
] as const;
export interface LocalTask {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly state: TaskState;
  readonly parent: string | null;
  readonly text: string;
}
export interface TaskDiagnostic {
  readonly path: string;
  readonly message: string;
}
export interface TaskAudit {
  readonly present: boolean;
  readonly tasks: readonly LocalTask[];
  readonly diagnostics: readonly TaskDiagnostic[];
  readonly instructions: readonly string[];
}
const taskFile = /^(TASK-(\d{3,}))-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const templatePath = "docs/templates/TASK.md";
const localReadme =
  "# Local tasks\n\n" +
  "Rules: [Task management](../docs/guides/TASK_MANAGEMENT.md).\n" +
  "`TEMPLATE.md` is materialized from the tracked task template by `pnpm setup:tasks`.\n" +
  "Individual records stay local and ignored; instruction and lifecycle rules still apply.\n";
function missing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function stat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
function section(text: string, name: string): string | null {
  const headings = [...text.matchAll(/^## (.+)\r?$/gm)];
  const index = headings.findIndex((h) => h[1] === name);
  if (index < 0) return null;
  const heading = headings[index];
  if (!heading) return null;
  return text
    .slice(heading.index + heading[0].length, headings[index + 1]?.index ?? text.length)
    .trim();
}
async function materialized(root: string): Promise<Readonly<Record<string, string>>> {
  return {
    "README.md": localReadme,
    "TEMPLATE.md": await readFile(join(root, templatePath), "utf8"),
  };
}
/** Enumerate the local filesystem directly. Git ignore and tracked-file lists are irrelevant here. */
export async function auditLocalTasks(rootDirectory: string): Promise<TaskAudit> {
  const root = resolve(rootDirectory),
    directory = join(root, "tasks"),
    info = await stat(directory);
  const diagnostics: TaskDiagnostic[] = [],
    tasks: LocalTask[] = [],
    instructions: string[] = [];
  const issue = (path: string, message: string) =>
    diagnostics.push({ path: relative(root, path), message });
  if (info === null) return { present: false, tasks, diagnostics, instructions };
  if (!info.isDirectory() || info.isSymbolicLink()) {
    issue(directory, "task root must be a real directory, not a symlink");
    return { present: true, tasks, diagnostics, instructions };
  }
  const expected = await materialized(root);
  for (const [name, content] of Object.entries(expected)) {
    const file = join(directory, name),
      metadata = await stat(file);
    if (!metadata?.isFile() || metadata.isSymbolicLink() || metadata.size > 262144)
      issue(file, "missing or invalid local guidance; run pnpm setup:tasks");
    else if ((await readFile(file, "utf8")) !== content)
      issue(
        file,
        "local guidance differs from tracked owner; preserve edits and run pnpm setup:tasks --refresh",
      );
  }
  for (const name of TASK_STATES) {
    const folder = join(directory, name),
      metadata = await stat(folder);
    if (!metadata?.isDirectory() || metadata.isSymbolicLink())
      issue(folder, "missing or invalid status directory; run pnpm setup:tasks");
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const folder = join(directory, entry.name);
    if (Object.hasOwn(expected, entry.name)) continue;
    if (entry.name === "AGENTS.md") {
      if (entry.isFile() && !entry.isSymbolicLink()) instructions.push(relative(root, folder));
      else issue(folder, "local instructions must be a regular file");
      continue;
    }
    if (!TASK_STATES.some((state) => state === entry.name)) {
      issue(folder, "only guidance and status folders belong at tasks/ root");
      continue;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const state = TASK_STATES.find((s) => s === entry.name);
    if (!state) continue;
    for (const file of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, file.name),
        match = taskFile.exec(file.name);
      if (file.name === "AGENTS.md") {
        if (file.isFile() && !file.isSymbolicLink()) instructions.push(relative(root, path));
        else issue(path, "local instructions must be a regular file");
        continue;
      }
      if (!file.isFile() || file.isSymbolicLink() || !match) {
        issue(path, "expected a regular TASK-NNN-short-kebab-name.md file");
        continue;
      }
      const id = match[1],
        numeric = match[2],
        slug = match[3];
      if (
        !id ||
        !numeric ||
        !slug ||
        BigInt(numeric) === 0n ||
        numeric !== BigInt(numeric).toString().padStart(3, "0")
      ) {
        issue(path, "task ID must be positive and padded to at least three digits");
        continue;
      }
      if ((await lstat(path)).size > 262144) {
        issue(path, "task exceeds 256 KiB; retain detailed logs under local/");
        continue;
      }
      const text = await readFile(path, "utf8");
      if (!text.startsWith(`# ${id} — `))
        issue(path, "title must start with the filename's stable task ID");
      if (/^(?:[-*] )?(?:Status|Task status)\s*:/im.test(text))
        issue(path, "the folder owns task status; remove duplicate status fields");
      const headings = [...text.matchAll(/^## (.+)\r?$/gm)].map((h) => h[1]);
      for (const required of TASK_SECTIONS) {
        if (headings.filter((h) => h === required).length !== 1 || !section(text, required))
          issue(path, `expected one nonempty ${required} section`);
      }
      const criteria = section(text, "Acceptance Criteria") ?? "";
      if (!/^\s*- \[[ xX]\] /m.test(criteria))
        issue(path, "acceptance criteria need observable checkboxes");
      if (state === "done" && /^\s*- \[ \] /m.test(criteria))
        issue(path, "done task still has unfinished acceptance criteria");
      if (
        (state === "done" || state === "review") &&
        /^\s*- \[ \] /m.test(section(text, "Deliverables") ?? "")
      )
        issue(
          path,
          "review/done requires completed deliverables; retain implementation work as active or backlog",
        );
      if (
        state === "blocked" &&
        /^(?:[-*] )?(?:none|n\/a)[.!]?$/i.test(section(text, "Dependencies / Blockers") ?? "")
      )
        issue(path, "blocked task must name its unresolved condition and next action");
      const parents = [...text.matchAll(/^(?:Parent:|[-*] Parent program:)[ \t]*(.*)$/gm)].map(
        (p) => p[1]?.trim().replace(/\.$/, ""),
      );
      if (parents.length > 1) issue(path, "use one parent declaration");
      if (parents.some((parent) => !parent || !/^(?:TASK-\d{3,}|none)$/.test(parent)))
        issue(path, "parent must be TASK-NNN or none");
      const parent = parents[0] && parents[0] !== "none" ? parents[0] : null;
      tasks.push({ id, name: slug, path: relative(root, path), state, parent, text });
    }
  }
  const byId = new Map<string, LocalTask>();
  for (const task of tasks) {
    if (byId.has(task.id)) issue(join(root, task.path), `duplicate stable ID ${task.id}`);
    byId.set(task.id, task);
  }
  for (const task of tasks) {
    if (task.parent !== null && !byId.has(task.parent))
      issue(join(root, task.path), `missing parent ${task.parent}`);
    const visited = new Set<string>([task.id]);
    let current = task.parent;
    while (current !== null) {
      if (visited.has(current)) {
        issue(join(root, task.path), "parent cycle");
        break;
      }
      visited.add(current);
      current = byId.get(current)?.parent ?? null;
    }
    if (
      task.state === "done" &&
      tasks.some((child) => child.parent === task.id && child.state !== "done")
    )
      issue(join(root, task.path), "done parent has an unfinished child");
    // Resolve explicit local links; archived prose and bare historical source IDs are not promises of live paths.
    for (const link of task.text
      .replace(/```[\s\S]*?```/g, "")
      .matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const target = link[1]?.split("#")[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const absolute = resolve(root, task.path, "..", target);
      if ((await stat(absolute)) === null)
        issue(join(root, task.path), `missing local link ${target}`);
    }
  }
  tasks.sort((a, b) => (BigInt(a.id.slice(5)) < BigInt(b.id.slice(5)) ? -1 : 1));
  return { present: true, tasks, diagnostics, instructions: instructions.sort() };
}

/** Refresh only generic guidance. The caller must preserve customized guidance before requesting refresh. */
export async function setupLocalTasks(rootDirectory: string, refresh = false): Promise<void> {
  const root = resolve(rootDirectory),
    directory = join(root, "tasks"),
    info = await stat(directory);
  if (info !== null && (!info.isDirectory() || info.isSymbolicLink()))
    throw new Error("invalid task root");
  const files = await materialized(root);
  // Validate all existing targets before writing any of them.
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name),
      existing = await stat(path);
    if (existing !== null) {
      if (!existing.isFile() || existing.isSymbolicLink())
        throw new Error("invalid task guidance target");
      if (!refresh && (await readFile(path, "utf8")) !== content)
        throw new Error("preserve customized task guidance before --refresh");
    }
  }
  for (const state of TASK_STATES) {
    const info = await stat(join(directory, state));
    if (info !== null && (!info.isDirectory() || info.isSymbolicLink()))
      throw new Error("invalid task status directory");
  }
  await mkdir(directory, { recursive: true });
  for (const state of TASK_STATES) await mkdir(join(directory, state), { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(directory, name), content);
}

/** Allocate above every retained ID. Exclusive creation plus a local lock prevents concurrent reuse. */
export async function createLocalTask(input: {
  readonly root: string;
  readonly slug: string;
  readonly parent?: string;
}): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug))
    throw new Error("use a short kebab-case task name");
  await setupLocalTasks(input.root);
  const { open, unlink } = await import("node:fs/promises");
  const lockPath = join(input.root, "tasks", ".creation-lock");
  const lock = await open(lockPath, "wx");
  try {
    // The lock is a transient implementation detail, never a task; inspect the snapshot before allocation.
    const audit = await auditLocalTasks(input.root);
    const failures = audit.diagnostics.filter((d) => d.path !== "tasks/.creation-lock");
    if (failures.length)
      throw new Error("repair local task validation failures before creating another task");
    if (
      input.parent !== undefined &&
      !audit.tasks.some((t) => t.id === input.parent && t.state !== "done")
    )
      throw new Error("parent must name an existing unfinished task");
    const number =
      audit.tasks.reduce((max, task) => {
        const n = BigInt(task.id.slice(5));
        return n > max ? n : max;
      }, 0n) + 1n;
    const id = `TASK-${number.toString().padStart(3, "0")}`;
    const template = await readFile(join(input.root, templatePath), "utf8");
    const content = template
      .replace("TASK-XXX — Short title", `${id} — ${input.slug.replaceAll("-", " ")}`)
      .replace("Parent: none", `Parent: ${input.parent ?? "none"}`);
    const path = join(input.root, "tasks", "backlog", `${id}-${input.slug}.md`);
    await writeFile(path, content, { flag: "wx" });
    return relative(input.root, path);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
