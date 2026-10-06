import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { object, objects, parseJson, text } from "../lib/json.ts";

export interface PromotionChange {
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}
export interface PromotionInput {
  readonly path: string;
  readonly sha256: string;
}
export const promotionDigest = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const operation = "local/evidence-promotion-operation";

/** Reject symlink traversal, including ignored ancestors, before reading or writing. */
export async function promotionPath(root: string, path: string): Promise<string> {
  if (
    !/^[a-zA-Z0-9._/-]+$/.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Invalid promotion path");
  let current = resolve(root);
  if ((await lstat(current)).isSymbolicLink()) throw new Error("Symlinked workspace");
  for (const part of path.split("/")) {
    current = join(current, part);
    const info = await lstat(current).catch((error: unknown) => {
      if (missing(error)) return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error(`Symlinked promotion path: ${path}`);
  }
  return current;
}
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
export async function promotionRead(root: string, path: string): Promise<string | null> {
  return readFile(await promotionPath(root, path), "utf8").catch((error: unknown) => {
    if (missing(error)) return null;
    throw error;
  });
}
export async function promotionReadBytes(root: string, path: string): Promise<Buffer | null> {
  return readFile(await promotionPath(root, path)).catch((error: unknown) => {
    if (missing(error)) return null;
    throw error;
  });
}
async function atomic(root: string, path: string, content: string): Promise<void> {
  const target = await promotionPath(root, path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await promotionPath(root, path);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
export function assertPromotionChange(change: PromotionChange): void {
  const canonical = [
    "knowledge/contracts/index.json",
    "knowledge/contracts/records/deployments.json",
    "knowledge/prices/index.json",
    "knowledge/prices/sources/catalog.json",
    "knowledge/prices/records/sources-feeds.json",
  ];
  const generated =
    /^packages\/(?:[a-z-]+\/)*src\/[a-z-]+\.generated\.ts$/.test(change.path) ||
    /^knowledge\/(contracts|prices)\/generated\/reference\.md$/.test(change.path);
  const immutable =
    /^knowledge\/contracts\/(artifacts\/oracle-captures\/mezo-mainnet|evidence\/oracle-contracts-mezo-mainnet)-\d{4}-\d{2}-\d{2}-[a-f0-9]{24}\.json$/.test(
      change.path,
    ) ||
    /^knowledge\/prices\/evidence\/fixed-block-observations-mezo-mainnet-\d{4}-\d{2}-\d{2}-[a-f0-9]{24}\.json$/.test(
      change.path,
    );
  if (!(canonical.includes(change.path) || generated || (immutable && change.before === null)))
    throw new Error(`Path is outside this promotion recipe or overwrites history: ${change.path}`);
}
/** Field-level JSON pointers, with explicit absent values; text projections are reviewed by digest. */
export function promotionDiff(before: unknown, after: unknown, pointer = ""): readonly unknown[] {
  if (isDeepStrictEqual(before, after)) return [];
  if (
    before !== null &&
    after !== null &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const a = objectView(before),
      b = objectView(after);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .sort()
      .flatMap((key) =>
        promotionDiff(
          a[key],
          b[key],
          `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
  }
  return [
    {
      pointer,
      before: { present: before !== undefined, value: before ?? null },
      after: { present: after !== undefined, value: after ?? null },
    },
  ];
}
function objectView(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}
export async function verifyPromotionInputs(
  root: string,
  inputs: readonly PromotionInput[],
): Promise<void> {
  for (const input of inputs) {
    const current = await promotionReadBytes(root, input.path);
    if (current === null || promotionDigest(current) !== input.sha256)
      throw new Error(`Concurrent input change: ${input.path}`);
  }
}

/** Recoverable multi-file commit. Atomic per-file replacement is not a filesystem-wide transaction. */
export async function applyPromotionFiles(
  root: string,
  changes: readonly PromotionChange[],
  inputs: readonly PromotionInput[],
  afterWrite?: (index: number) => Promise<void>,
): Promise<void> {
  if (new Set(changes.map((c) => c.path)).size !== changes.length)
    throw new Error("Duplicate change");
  for (const change of changes) {
    assertPromotionChange(change);
    if ((await promotionRead(root, change.path)) !== change.before)
      throw new Error(`Concurrent edit: ${change.path}`);
  }
  await verifyPromotionInputs(root, inputs);
  const pending = await promotionPath(root, operation);
  await mkdir(dirname(pending), { recursive: true });
  // Exclusive directory ownership also blocks a process interrupted before journal publication.
  await mkdir(pending);
  const journal = { formatVersion: 1, pid: process.pid, changes };
  await atomic(root, `${operation}/journal.json`, JSON.stringify(journal));
  try {
    // Stage all bytes before the first canonical write; recovery never depends on a capture file.
    for (const [index, change] of changes.entries())
      await atomic(root, `${operation}/${index}.json`, change.after);
    await verifyPromotionInputs(root, inputs);
    for (const [index, change] of changes.entries()) {
      if ((await promotionRead(root, change.path)) !== change.before)
        throw new Error(`Concurrent edit: ${change.path}`);
      const staged = await promotionRead(root, `${operation}/${index}.json`);
      if (staged !== change.after) throw new Error("Staged content changed");
      await atomic(root, change.path, staged);
      await afterWrite?.(index);
    }
    // Source inputs can change while multiple replacements are in progress. Retain the
    // journal if either a written target or an unchanged dependency no longer matches.
    const written = new Map(changes.map((change) => [change.path, change.after]));
    for (const input of inputs) {
      const current = await promotionReadBytes(root, input.path);
      const expected = written.get(input.path);
      if (
        current === null ||
        promotionDigest(current) !==
          (expected === undefined ? input.sha256 : promotionDigest(expected))
      )
        throw new Error(`Concurrent input change during apply: ${input.path}`);
    }
    for (const change of changes) {
      if ((await promotionRead(root, change.path)) !== change.after)
        throw new Error(`Concurrent target change: ${change.path}`);
    }
    await rm(pending, { recursive: true });
  } catch (cause) {
    await atomic(root, `${operation}/journal.json`, JSON.stringify({ ...journal, pid: 0 }));
    throw new Error("Promotion interrupted; inspect and recover before retrying", { cause });
  }
}

/** Restore previous canonical bytes while retaining newly captured historical evidence. */
export async function recoverPromotionFiles(root: string): Promise<void> {
  const lock = await promotionPath(root, `${operation}/recovery.lock`);
  await writeFile(lock, String(process.pid), { flag: "wx" });
  try {
    await recoverOwnedPromotion(root);
  } catch (error) {
    await rm(lock, { force: true });
    throw error;
  }
}
async function recoverOwnedPromotion(root: string): Promise<void> {
  const raw = await promotionRead(root, `${operation}/journal.json`);
  if (raw === null) throw new Error("No recoverable journal; inspect the operation directory");
  const journal = object(parseJson(raw, "journal"), "journal");
  if (
    journal.formatVersion !== 1 ||
    typeof journal.pid !== "number" ||
    !Number.isSafeInteger(journal.pid) ||
    journal.pid < 0
  )
    throw new Error("Invalid promotion journal");
  if (journal.pid !== 0) {
    try {
      process.kill(journal.pid, 0);
      throw new Error("Promotion process is still active");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }
  const changes = objects(journal.changes, "changes").map((c) => ({
    path: text(c.path, "path"),
    before: c.before === null ? null : text(c.before, "before"),
    after: text(c.after, "after"),
  }));
  if (new Set(changes.map((c) => c.path)).size !== changes.length)
    throw new Error("Duplicate journal path");
  for (const change of changes) {
    assertPromotionChange(change);
    const current = await promotionRead(root, change.path);
    if (current !== change.before && current !== change.after)
      throw new Error(`Recovery conflicts with later edit: ${change.path}`);
  }
  for (const change of [...changes].reverse()) {
    const current = await promotionRead(root, change.path);
    if (current === change.before) continue;
    if (current !== change.after) throw new Error(`Concurrent recovery edit: ${change.path}`);
    if (change.before === null) {
      // Keep the exact bytes in the journal archive; remove unindexed additions for a clean retry.
      continue;
    }
    await atomic(root, change.path, change.before);
  }
  // Preserve every new artifact and interrupted proposal outside canonical indexing before removal.
  const archive = `local/evidence-promotion-recovery-${randomUUID()}.json`;
  await atomic(root, archive, raw);
  for (const change of changes.filter((c) => c.before === null)) {
    const current = await promotionRead(root, change.path);
    if (current === null) continue;
    if (current !== change.after) throw new Error(`Concurrent recovery edit: ${change.path}`);
    await rm(await promotionPath(root, change.path));
  }
  await rm(await promotionPath(root, operation), { recursive: true });
}
