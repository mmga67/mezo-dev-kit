import { open, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseSubmissionRecord } from "@mezo-dev-kit/core";
import type { SubmissionRecord, SubmissionStore } from "@mezo-dev-kit/core";
import { parseHash32 } from "@mezo-dev-kit/evm";

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
function nonceKey(record: SubmissionRecord): string {
  return `${record.call.chainId}:${record.call.from}:${record.call.nonce}`;
}

export interface FileSubmissionStore extends SubmissionStore {
  list(): Promise<readonly Readonly<SubmissionRecord>[]>;
}

/** One locked journal makes operation and nonce reservation a single atomic change.
 * A leftover lock fails closed: inspect the process and journal before recovery. */
export async function createFileSubmissionStore(directory: string): Promise<FileSubmissionStore> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const statePath = join(directory, "submissions.json");
  const lockPath = join(directory, "submissions.lock");

  async function read(): Promise<readonly Readonly<SubmissionRecord>[]> {
    let text: string;
    try {
      const file = await open(statePath, "r");
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > 8_388_608)
          throw new Error("Submission journal exceeds its size limit");
        text = await file.readFile("utf8");
      } finally {
        await file.close();
      }
    } catch (error) {
      if (hasCode(error, "ENOENT")) return [];
      throw error;
    }
    if (Buffer.byteLength(text) > 8_388_608)
      throw new Error("Submission journal exceeds its size limit");
    const values: unknown = JSON.parse(text);
    if (!Array.isArray(values) || values.length > 4096)
      throw new Error("Invalid submission journal");
    const records = values.map((value: unknown) => parseSubmissionRecord(value));
    if (
      new Set(records.map((record) => record.operationId)).size !== records.length ||
      new Set(records.map(nonceKey)).size !== records.length
    )
      throw new Error("Conflicting operation IDs or nonces in submission journal");
    return records;
  }

  async function update<T>(
    change: (records: readonly Readonly<SubmissionRecord>[]) => {
      readonly result: T;
      readonly records: readonly Readonly<SubmissionRecord>[];
    },
  ): Promise<T> {
    const lock = await open(lockPath, "wx", 0o600);
    try {
      const next = change(await read());
      if (next.records.length > 4096) throw new Error("Submission journal is full");
      const serialized = JSON.stringify(next.records);
      if (Buffer.byteLength(serialized) > 8_388_608)
        throw new Error("Submission journal exceeds its size limit");
      const temporary = join(directory, `submissions-${randomUUID()}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(serialized);
        await file.sync();
      } finally {
        await file.close();
      }
      // fsync + rename + directory fsync preserves a whole old or new journal.
      // A failed write intentionally leaves its temporary file for inspection.
      await rename(temporary, statePath);
      const folder = await open(directory, "r");
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
      return next.result;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  return {
    list: read,
    reserve: async (input) => {
      const record = parseSubmissionRecord(input);
      return update((records) => {
        const exists = records.some(
          (saved) =>
            saved.operationId === record.operationId || nonceKey(saved) === nonceKey(record),
        );
        return { result: !exists, records: exists ? records : [...records, record] };
      });
    },
    attachHash: async (operationId, candidate) => {
      const hash = parseHash32(candidate);
      await update((records) => {
        const saved = records.find((record) => record.operationId === operationId);
        if (!saved || (saved.hash !== null && saved.hash !== hash))
          throw new Error("Cannot change a reserved submission hash");
        return {
          result: undefined,
          records: records.map((record) =>
            record.operationId === operationId ? { ...record, hash } : record,
          ),
        };
      });
    },
  };
}
