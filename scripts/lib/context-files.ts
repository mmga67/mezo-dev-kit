import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const maxContextFileBytes = 32 * 1024 * 1024;

/** Read local inputs without following symlinks or hiding access/integrity failures. */
export async function readContextFile(
  root: string,
  path: string,
  optional = false,
): Promise<string | undefined> {
  const base = resolve(root);
  const target = resolve(base, path);
  const local = relative(base, target);
  if (!local || isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`))
    throw new Error("Context path must remain inside its repository/store");
  const parts = local.split(sep);
  let current = base;
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (optional && error instanceof Error && "code" in error && error.code === "ENOENT")
        return undefined;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Context path contains a symlink: ${local}`);
    if (index < parts.length - 1 && !info.isDirectory())
      throw new Error(`Context ancestor is not a directory: ${local}`);
    if (index === parts.length - 1 && (!info.isFile() || info.size > maxContextFileBytes))
      throw new Error(
        `Context input must be a file of at most ${maxContextFileBytes} bytes: ${local}`,
      );
  }
  return readFile(target, "utf8");
}

export function contextDigest(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}
