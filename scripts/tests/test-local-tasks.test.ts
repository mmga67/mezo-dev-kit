import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { auditLocalTasks, createLocalTask, setupLocalTasks } from "../lib/tasks.ts";
import type { TaskState } from "../lib/tasks.ts";
const repository = join(dirname(fileURLToPath(import.meta.url)), "../.."),
  roots: string[] = [];
async function fixture(setup = true) {
  const root = await mkdtemp(join(tmpdir(), "mdk-local-tasks-"));
  roots.push(root);
  await mkdir(join(root, "docs/templates"), { recursive: true });
  await cp(join(repository, "docs/templates/TASK.md"), join(root, "docs/templates/TASK.md"));
  if (setup) await setupLocalTasks(root);
  return root;
}
async function task(
  root: string,
  id: number,
  state: TaskState = "backlog",
  parent: string | null = null,
) {
  const key = `TASK-${id.toString().padStart(3, "0")}`;
  const path = join(root, "tasks", state, `${key}-synthetic-outcome.md`);
  const content = (await readFile(join(root, "docs/templates/TASK.md"), "utf8"))
    .replace("TASK-XXX — Short title", `${key} — Synthetic outcome`)
    .replace("Parent: none", `Parent: ${parent ?? "none"}`)
    .replaceAll("- [ ]", "- [x]");
  await writeFile(path, content);
  return { path, content };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("fresh source checkouts do not require or create private task data", async () => {
  const root = await fixture(false),
    audit = await auditLocalTasks(root);
  expect(audit.present).toBe(false);
  expect(audit.diagnostics).toEqual([]);
  expect(await readdir(root)).toEqual(["docs"]);
});
test("malformed ignored task records fail even when Git-aware discovery omits them", async () => {
  const root = await fixture();
  await writeFile(join(root, ".gitignore"), "/tasks/\n");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await writeFile(join(root, "tasks", "2026-01-01-work.md"), "# Unnumbered work\n");
  const visible = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(visible).not.toContain("tasks/");
  const audit = await auditLocalTasks(root);
  expect(audit.diagnostics).toContainEqual(
    expect.objectContaining({ path: "tasks/2026-01-01-work.md" }),
  );
});
test("CLI checks fail on local drift and list still exposes applicable ignored instructions", async () => {
  const root = await fixture(false);
  const run = (command: string) =>
    spawnSync(process.execPath, [join(repository, "scripts/workspace/tasks.ts"), command], {
      cwd: root,
      encoding: "utf8",
    });
  expect(run("check").status).toBe(0);
  expect(await readdir(root)).toEqual(["docs"]);
  await setupLocalTasks(root);
  await writeFile(join(root, "tasks/AGENTS.md"), "Read the tracked task policy.\n");
  await writeFile(join(root, "tasks/ad-hoc.md"), "Unnumbered record\n");
  const check = run("check");
  expect(check.status).toBe(1);
  expect(check.stderr).toContain("tasks/ad-hoc.md");
  const list = run("list");
  expect(list.status).toBe(1);
  expect(list.stdout).toContain("tasks/AGENTS.md");
});
test("ignored nested instructions are surfaced independently of task discovery", async () => {
  const root = await fixture();
  await writeFile(join(root, "tasks/AGENTS.md"), "Apply the tracked task policy.\n");
  await writeFile(join(root, "tasks/active/AGENTS.md"), "Retain the current evidence pointer.\n");
  await task(root, 1, "active");
  const audit = await auditLocalTasks(root);
  expect(audit.instructions).toEqual(["tasks/AGENTS.md", "tasks/active/AGENTS.md"]);
  expect(audit.diagnostics).toEqual([]);
});
test("new tasks use the template and allocate above existing IDs without filling historical gaps", async () => {
  const root = await fixture();
  await task(root, 1, "done");
  await task(root, 9, "active");
  const created = await createLocalTask({ root, slug: "bounded-child", parent: "TASK-009" });
  expect(created).toBe("tasks/backlog/TASK-010-bounded-child.md");
  expect(await readFile(join(root, created), "utf8")).toContain("Parent: TASK-009");
  expect((await auditLocalTasks(root)).diagnostics).toEqual([]);
});
test("concurrent creators never allocate one ID to different tasks", async () => {
  const root = await fixture();
  const results = await Promise.allSettled(
    ["one", "two", "three"].map((slug) => createLocalTask({ root, slug })),
  );
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  const audit = await auditLocalTasks(root);
  expect(new Set(audit.tasks.map((t) => t.id)).size).toBe(audit.tasks.length);
  expect(audit.diagnostics).toEqual([]);
});
test("unknown or completed parents cannot create children and cleanup releases the allocation lock", async () => {
  const root = await fixture();
  await task(root, 1, "done");
  for (const parent of ["TASK-001", "TASK-099"])
    await expect(createLocalTask({ root, slug: "child", parent })).rejects.toThrow(
      "existing unfinished task",
    );
  expect((await auditLocalTasks(root)).tasks).toHaveLength(1);
  expect(await readdir(join(root, "tasks"))).not.toContain(".creation-lock");
});
test("duplicate IDs across folders and conflicting titles or status fields fail", async () => {
  const root = await fixture();
  await task(root, 1);
  const other = await task(root, 1, "active");
  await writeFile(
    other.path,
    other.content.replace("# TASK-001", "# TASK-002") + "\nStatus: done\n",
  );
  const messages = (await auditLocalTasks(root)).diagnostics.map((d) => d.message).join("\n");
  expect(messages).toContain("duplicate stable ID");
  expect(messages).toContain("title must start");
  expect(messages).toContain("folder owns task status");
});
test("missing template sections and broken local evidence links fail", async () => {
  const root = await fixture(),
    current = await task(root, 1);
  await writeFile(
    current.path,
    current.content.replace("## Verification", "## Miscellaneous") +
      "\n[Missing](../../absent.md)\n",
  );
  const messages = (await auditLocalTasks(root)).diagnostics.map((d) => d.message).join("\n");
  expect(messages).toContain("nonempty Verification");
  expect(messages).toContain("missing local link");
});
test("review and done cannot conceal unfinished deliverables or acceptance", async () => {
  const root = await fixture(),
    done = await task(root, 1, "done"),
    review = await task(root, 2, "review");
  await writeFile(done.path, done.content.replace("- [x] Observable", "- [ ] Observable"));
  await writeFile(review.path, review.content.replace("- [x] ...", "- [ ] ..."));
  const messages = (await auditLocalTasks(root)).diagnostics.map((d) => d.message).join("\n");
  expect(messages).toContain("unfinished acceptance");
  expect(messages).toContain("completed deliverables");
});
test("blocked tasks with no blocker fail", async () => {
  const root = await fixture(),
    current = await task(root, 1, "blocked");
  await writeFile(current.path, current.content.replace("- None / ...", "None."));
  expect((await auditLocalTasks(root)).diagnostics.map((d) => d.message)).toContain(
    "blocked task must name its unresolved condition and next action",
  );
});
test("missing parents, cycles and unfinished children under done parents fail", async () => {
  const root = await fixture();
  await task(root, 1, "active", "TASK-002");
  await task(root, 2, "active", "TASK-001");
  await task(root, 3, "active", "TASK-099");
  await task(root, 4, "done");
  await task(root, 5, "active", "TASK-004");
  const messages = (await auditLocalTasks(root)).diagnostics.map((d) => d.message).join("\n");
  expect(messages).toContain("parent cycle");
  expect(messages).toContain("missing parent TASK-099");
  expect(messages).toContain("done parent has an unfinished child");
});
test("malformed parent declarations cannot silently become independent tasks", async () => {
  const root = await fixture(),
    current = await task(root, 1);
  await writeFile(current.path, current.content.replace("Parent: none", "Parent: TASK-2"));
  expect((await auditLocalTasks(root)).diagnostics.map((d) => d.message)).toContain(
    "parent must be TASK-NNN or none",
  );
});
test("setup protects custom guidance and explicit refresh touches no task records", async () => {
  const root = await fixture(),
    current = await task(root, 1);
  await writeFile(join(root, "tasks/README.md"), "custom local instruction\n");
  await expect(setupLocalTasks(root)).rejects.toThrow("preserve customized");
  expect(await readFile(join(root, "tasks/README.md"), "utf8")).toBe("custom local instruction\n");
  await setupLocalTasks(root, true);
  expect(await readFile(current.path, "utf8")).toBe(current.content);
  expect((await auditLocalTasks(root)).diagnostics).toEqual([]);
});
test("symlinked roots and status directories are refused without following or overwriting them", async () => {
  const root = await fixture(false),
    outside = await fixture(false);
  await symlink(outside, join(root, "tasks"), "dir");
  await expect(setupLocalTasks(root)).rejects.toThrow("invalid task root");
  expect((await auditLocalTasks(root)).diagnostics).toHaveLength(1);
  await rm(join(root, "tasks"));
  await setupLocalTasks(root);
  await rm(join(root, "tasks/active"), { recursive: true });
  await symlink(outside, join(root, "tasks/active"), "dir");
  await expect(setupLocalTasks(root)).rejects.toThrow("invalid task status");
  expect((await auditLocalTasks(root)).diagnostics.some((d) => d.path === "tasks/active")).toBe(
    true,
  );
  expect(await readdir(outside)).toEqual(["docs"]);
});
