import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { connectLocalFork } from "../runtime/local-fork.ts";
import { invariant, object } from "../runtime/validation.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeNode(mismatchedParent = false): string[] {
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = async (url, options) => {
    invariant(
      typeof options?.body === "string" && url instanceof URL,
      "Expected serialized HTTP RPC request",
    );
    const request = object(JSON.parse(options.body) as unknown);
    const method = String(request.method);
    calls.push(method);
    const result: unknown =
      method === "web3_clientVersion"
        ? "anvil/test"
        : method === "eth_chainId"
          ? "0x7b7c"
          : method === "eth_getBlockByNumber"
            ? {
                number: "0x1",
                hash: `0x${(mismatchedParent && url.hostname.includes("source") ? "22" : "11").repeat(32)}`,
              }
            : method === "eth_accounts"
              ? [`0x${"33".repeat(20)}`]
              : method === "evm_snapshot"
                ? "0x1"
                : true;
    expect(options?.signal?.aborted).toBe(false);
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
  vi.stubGlobal("fetch", fetch);
  return calls;
}

test("a source-parent mismatch prevents snapshot creation and mutation", async () => {
  const calls = fakeNode(true);
  await expect(
    connectLocalFork({
      url: "http://127.0.0.1:18545",
      sourceUrl: "https://source.invalid",
      runId: "mismatch",
      directory: "/unused",
      repositoryRoot: "/unused",
      report: () => undefined,
    }),
  ).rejects.toThrow("fresh fork");
  expect(calls).not.toContain("evm_snapshot");
  expect(calls).not.toContain("evm_setAutomine");
});

test("cancellation still restores the fork and original mining policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mdk-fork-cleanup-"));
  try {
    const calls = fakeNode();
    const abort = new AbortController();
    const fork = await connectLocalFork({
      url: "http://127.0.0.1:18545",
      sourceUrl: "https://source.invalid",
      runId: "cleanup",
      directory,
      repositoryRoot: directory,
      signal: abort.signal,
      report: () => undefined,
    });
    abort.abort();
    await fork.close();
    expect(calls.slice(-2)).toEqual(["evm_revert", "evm_setAutomine"]);
  } finally {
    await rm(directory, { recursive: true });
  }
});
