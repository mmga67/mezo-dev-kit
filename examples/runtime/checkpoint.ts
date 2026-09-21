import { open, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** Checkpoints supplement Core's durable submission journal; they do not authorize replay. */
export async function saveCheckpoint(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify(
        value,
        (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
        2,
      ),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  const folder = await open(dirname(path), "r");
  try {
    await folder.sync();
  } finally {
    await folder.close();
  }
}
