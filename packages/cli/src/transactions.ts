import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import type { RecoveryJournal as Journal } from "./contracts.ts";
import { join } from "node:path";
import { digest, jsonText, record, arrayValue, safePath } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";
import { atomicWrite, containedPath, parseJson, readOptional, readRequired } from "./filesystem.ts";

export interface FileChange {
  readonly path: string;
  readonly before: Buffer | null;
  readonly after: Buffer | null;
}
const operation = ".mdk/operation";
const journalPath = `${operation}/journal.json`;

function allowed(path: string, before: string | Buffer | null): boolean {
  return (
    path === "mdk.lock.json" ||
    ((path === "AGENTS.md" || path === "mdk.config.json") && before === null) ||
    path.startsWith(".mdk/reference/") ||
    /^\.(?:agents|claude)\/skills\/mdk-[a-z0-9-]+\/.+/.test(path)
  );
}
function same(a: Buffer | null, b: Buffer | null): boolean {
  return a === null || b === null ? a === b : digest(a) === digest(b);
}
export function parseRecoveryJournal(value: unknown): Journal {
  const obj = record(value, "operation journal");
  if (
    Object.keys(obj).some((key) => !["formatVersion", "pid", "changes"].includes(key)) ||
    obj.formatVersion !== 1 ||
    typeof obj.pid !== "number" ||
    !Number.isSafeInteger(obj.pid) ||
    obj.pid < 0
  )
    throw new CliError("Integrity", "Invalid operation journal");
  const changes = arrayValue(obj.changes, "changes").map((value) => {
    const item = record(value, "change");
    if (Object.keys(item).some((key) => !["path", "before", "after"].includes(key)))
      throw new CliError("Integrity", "Unknown journal field");
    const path = safePath(item.path);
    function data(value: unknown): string | null {
      if (value === null) return null;
      if (
        typeof value !== "string" ||
        value.length > 32 * 1024 * 1024 ||
        Buffer.from(value, "base64").toString("base64") !== value
      )
        throw new CliError("Integrity", "Invalid journal content");
      return value;
    }
    const before = data(item.before),
      after = data(item.after);
    if (!allowed(path, before))
      throw new CliError("Integrity", "Journal claims an application-owned path");
    return { path, before, after };
  });
  if (new Set(changes.map((item) => item.path)).size !== changes.length)
    throw new CliError("Integrity", "Duplicate journal path");
  return { formatVersion: 1, pid: obj.pid, changes };
}
export async function assertNoOperation(project: string): Promise<void> {
  const path = await containedPath(project, journalPath);
  // The directory itself also blocks work if a process died before its journal was written.
  const { lstat } = await import("node:fs/promises");
  const info = await lstat(await containedPath(project, operation)).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (info)
    throw new CliError(
      "RecoveryRequired",
      `An operation is pending at ${path}; use mdk recover after its process exits`,
    );
}
export async function applyChanges(
  project: string,
  changes: readonly FileChange[],
  options: {
    readonly dryRun?: boolean;
    readonly precondition?: () => Promise<void>;
    readonly afterWrite?: (index: number) => Promise<void>;
  } = {},
): Promise<void> {
  for (const item of changes) {
    safePath(item.path);
    if (!allowed(item.path, item.before))
      throw new CliError("InvalidInput", "Change claims an application-owned path");
    if (!same(await readOptional(project, item.path), item.before))
      throw new CliError("Conflict", `File changed during planning: ${item.path}`);
  }
  await assertNoOperation(project);
  if (options.dryRun || !changes.length) return;
  let journal: Journal = {
    formatVersion: 1,
    pid: process.pid,
    changes: changes.map((item) => ({
      path: item.path,
      before: item.before?.toString("base64") ?? null,
      after: item.after?.toString("base64") ?? null,
    })),
  };
  const bytes = Buffer.from(jsonText(journal));
  if (bytes.length > 30 * 1024 * 1024)
    throw new CliError(
      "InvalidInput",
      "Update exceeds the journal size bound; reduce selected references",
    );
  const mdk = await containedPath(project, ".mdk");
  await mkdir(mdk, { recursive: true });
  const stage = await mkdtemp(join(mdk, ".pending-"));
  try {
    // Publish a populated directory atomically: a competing populated operation cannot be replaced.
    await atomicWrite(stage, "journal.json", bytes);
    await rename(stage, await containedPath(project, operation));
  } catch (cause) {
    throw new CliError(
      "RecoveryRequired",
      "Could not acquire the project operation; inspect mdk recover",
      { cause },
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  try {
    await options.precondition?.();
    for (const [index, item] of changes.entries()) {
      if (!same(await readOptional(project, item.path), item.before))
        throw new CliError("Conflict", `Concurrent change: ${item.path}`);
      if (item.after === null) await rm(await containedPath(project, item.path));
      else await atomicWrite(project, item.path, item.after);
      await options.afterWrite?.(index);
    }
    await rm(await containedPath(project, operation), { recursive: true });
  } catch (cause) {
    journal = { ...journal, pid: 0 };
    await atomicWrite(project, journalPath, Buffer.from(jsonText(journal)));
    throw new CliError(
      "RecoveryRequired",
      "Update interrupted; run mdk recover to restore previous managed files",
      { cause },
    );
  }
}

export async function recoverChanges(
  project: string,
  dryRun = false,
): Promise<{ readonly restored: readonly string[] }> {
  const journal = parseRecoveryJournal(
    parseJson(await readRequired(project, journalPath), "operation journal"),
  );
  if (journal.pid !== 0) {
    let active = true;
    try {
      process.kill(journal.pid, 0);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")
        active = false;
      else throw error;
    }
    if (active)
      throw new CliError(
        "Conflict",
        "The operation process is still active; do not recover it concurrently",
      );
  }
  const changes = journal.changes.map((item) => ({
    path: item.path,
    before: item.before === null ? null : Buffer.from(item.before, "base64"),
    after: item.after === null ? null : Buffer.from(item.after, "base64"),
  }));
  for (const item of changes) {
    const current = await readOptional(project, item.path);
    if (!same(current, item.before) && !same(current, item.after))
      throw new CliError("Conflict", `Recovery would overwrite a subsequent edit: ${item.path}`);
  }
  if (!dryRun) {
    for (const item of [...changes].reverse()) {
      const current = await readOptional(project, item.path);
      if (same(current, item.before)) continue;
      if (!same(current, item.after))
        throw new CliError("Conflict", `Concurrent recovery edit: ${item.path}`);
      if (item.before === null) await rm(await containedPath(project, item.path));
      else await atomicWrite(project, item.path, item.before);
    }
    await rm(await containedPath(project, operation), { recursive: true });
  }
  return { restored: changes.map((item) => item.path) };
}
