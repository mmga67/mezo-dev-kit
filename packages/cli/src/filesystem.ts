import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { digest, safePath } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";

export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** Output paths must remain in a regular project tree, including every ancestor. */
export async function containedPath(root: string, path: string): Promise<string> {
  safePath(path);
  let current = resolve(root);
  const rootInfo = await lstat(current);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new CliError("Conflict", "Project root must be a regular directory");
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    const info = await lstat(current).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (info && (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())))
      throw new CliError(
        "Conflict",
        `Unsafe path component: ${parts.slice(0, index + 1).join("/")}`,
      );
  }
  return current;
}

export async function readOptional(root: string, path: string): Promise<Buffer | null> {
  const target = await containedPath(root, path);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW).catch(
    (error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    },
  );
  if (!handle) return null;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_FILE_BYTES)
      throw new CliError("InvalidInput", `Expected bounded regular file: ${path}`);
    const result = await handle.readFile();
    if (result.length > MAX_FILE_BYTES)
      throw new CliError("InvalidInput", "File grew beyond limit during read");
    return result;
  } finally {
    await handle.close();
  }
}

export async function readRequired(root: string, path: string): Promise<Buffer> {
  const bytes = await readOptional(root, path);
  if (!bytes) throw new CliError("Unavailable", `Missing local file: ${path}`);
  return bytes;
}
export function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (cause) {
    throw new CliError("InvalidInput", `Invalid JSON: ${label}`, { cause });
  }
}

export async function atomicWrite(root: string, path: string, bytes: Uint8Array): Promise<void> {
  const target = await containedPath(root, path);
  await mkdir(dirname(target), { recursive: true });
  await containedPath(root, path);
  const temporary = `${target}.mdk-${randomUUID()}`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await containedPath(root, path);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function fileInventory(
  root: string,
  directory: string,
): Promise<readonly { path: string; digest: string; size: number }[]> {
  const files: { path: string; digest: string; size: number }[] = [];
  async function visit(path: string): Promise<void> {
    const target = await containedPath(root, path);
    for (const item of await readdir(target, { withFileTypes: true })) {
      const child = `${path}/${item.name}`;
      if (item.isDirectory()) await visit(child);
      else {
        const bytes = await readRequired(root, child);
        files.push({ path: child, digest: digest(bytes), size: bytes.length });
      }
    }
  }
  await visit(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
