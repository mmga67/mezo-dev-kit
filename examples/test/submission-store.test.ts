import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";
import { createFileSubmissionStore } from "../runtime/submission-store.ts";
import { submissionFixture as record } from "./submission-fixture.ts";

describe("durable submission reservation", () => {
  test("survives recreation and never replaces a reserved nonce or known hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdk-example-store-"));
    try {
      const first = await createFileSubmissionStore(directory);
      expect(await first.reserve(record("deposit"))).toBe(true);
      const second = await createFileSubmissionStore(directory);
      expect(await second.reserve(record("deposit", "1"))).toBe(false);
      expect(await second.reserve(record("different-operation"))).toBe(false);
      const hash = `0x${"44".repeat(32)}` as const;
      await second.attachHash("deposit", hash);
      expect((await first.list())[0]?.hash).toBe(hash);
      await expect(first.attachHash("deposit", `0x${"55".repeat(32)}`)).rejects.toThrow(
        "Cannot change",
      );
      expect((await first.list())[0]?.hash).toBe(hash);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  test("competing store instances cannot both reserve one sender nonce", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdk-example-contention-"));
    try {
      const [a, b] = await Promise.all([
        createFileSubmissionStore(directory),
        createFileSubmissionStore(directory),
      ]);
      const results = await Promise.allSettled([a.reserve(record("a")), b.reserve(record("b"))]);
      expect(
        results.filter((result) => result.status === "fulfilled" && result.value),
      ).toHaveLength(1);
      expect(await a.list()).toHaveLength(1);
      expect(await b.reserve(record("third"))).toBe(false);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  test("a crash lock or corrupt journal prevents new reservations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdk-example-crash-"));
    try {
      const store = await createFileSubmissionStore(directory);
      await writeFile(join(directory, "submissions.lock"), "interrupted writer");
      await expect(store.reserve(record("unsafe-retry"))).rejects.toMatchObject({ code: "EEXIST" });
      await rm(join(directory, "submissions.lock"));
      await writeFile(join(directory, "submissions.json"), "{");
      await expect(store.reserve(record("unsafe-retry"))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  test("independent Node processes cannot reserve the same nonce", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdk-example-process-"));
    const module = new URL("../runtime/submission-store.ts", import.meta.url).href;
    const script = `const {createFileSubmissionStore} = await import(process.argv[1]);
      const store = await createFileSubmissionStore(process.argv[2]);
      try { process.exitCode = await store.reserve(JSON.parse(process.argv[3])) ? 0 : 3; }
      catch (error) { if (error.code === 'EEXIST') process.exitCode = 3; else throw error; }`;
    function reserve(operationId: string): Promise<number | null> {
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          script,
          module,
          directory,
          JSON.stringify(record(operationId)),
        ],
        { stdio: "ignore", timeout: 5000 },
      );
      return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
    }
    try {
      const results = await Promise.all([reserve("process-a"), reserve("process-b")]);
      expect(results.sort()).toEqual([0, 3]);
      expect(await (await createFileSubmissionStore(directory)).list()).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
