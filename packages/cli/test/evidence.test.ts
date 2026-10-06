import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { parseEvidenceReport } from "@mezo-dev-kit/evidence";
import { runCommand } from "../src/command.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "mdk-evidence-cli-"));
  roots.push(cwd);
  const methods: string[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("fixture body");
    const input: unknown = JSON.parse(init.body);
    if (
      !input ||
      typeof input !== "object" ||
      !("method" in input) ||
      typeof input.method !== "string"
    )
      throw new Error("fixture request");
    methods.push(input.method);
    const result =
      input.method === "eth_chainId"
        ? "0x1"
        : input.method === "eth_blockNumber"
          ? "0x64"
          : { number: "0x64", timestamp: "0x3e8", hash: `0x${"ab".repeat(32)}` };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  };
  const context = {
    cwd,
    fetch,
    now: new Date(1000000),
    environment: { SYNTHETIC_RPC: "https://private.invalid/SECRET" },
  };
  const args = [
    "evidence",
    "refresh",
    "--network",
    "ethereum-mainnet",
    "--recipe",
    "network.identity",
    "--provider",
    "fixture",
    "--rpc-env",
    "SYNTHETIC_RPC",
    "--policy",
    "current-v1",
    "--output",
    "reports",
    "--json",
  ];
  return { context, args, methods };
}
test("refresh from an uninitialized directory writes the same immutable schema as the API", async () => {
  const f = await fixture(),
    result = await runCommand(f.args, f.context),
    report = parseEvidenceReport(result.data);
  expect(result.exitCode).toBe(0);
  expect(report.status).toBe("complete");
  expect(await readdir(f.context.cwd)).toEqual(["reports"]);
  const root = join(f.context.cwd, "reports", report.request.runId);
  expect(JSON.parse(await readFile(join(root, "report.json"), "utf8"))).toEqual(report);
  expect(JSON.stringify(report)).not.toContain("SECRET");
  const original = await readFile(join(root, "report.json"));
  await runCommand(f.args, f.context);
  expect(await readFile(join(root, "report.json"))).toEqual(original);
  expect(await readdir(join(f.context.cwd, "reports"))).toHaveLength(2);
});
test("offline capabilities and inspect/recover never contact a provider", async () => {
  const f = await fixture(),
    report = parseEvidenceReport((await runCommand(f.args, f.context)).data),
    root = join(f.context.cwd, "reports", report.request.runId);
  await rm(join(root, "completed.json"));
  const count = f.methods.length;
  expect(
    (await runCommand(["evidence", "inspect", root, "--offline"], f.context)).data,
  ).toMatchObject({ state: "needs-recovery" });
  expect(
    (await runCommand(["evidence", "recover", root, "--offline"], f.context)).data,
  ).toMatchObject({ state: "saved", report });
  await runCommand(["evidence", "capabilities", "--offline"], f.context);
  expect(f.methods).toHaveLength(count);
});
test("recovery publishes a fully written pending report without recollecting", async () => {
  const f = await fixture(),
    report = parseEvidenceReport((await runCommand(f.args, f.context)).data),
    root = join(f.context.cwd, "reports", report.request.runId);
  await rm(join(root, "completed.json"));
  await rename(join(root, "report.json"), join(root, "report.json.pending"));
  const count = f.methods.length;
  expect((await runCommand(["evidence", "recover", root], f.context)).data).toMatchObject({
    state: "saved",
    report,
  });
  expect(f.methods).toHaveLength(count);
});
test("incomplete captures stay interrupted and corrupted completion manifests fail closed", async () => {
  const f = await fixture(),
    report = parseEvidenceReport((await runCommand(f.args, f.context)).data),
    root = join(f.context.cwd, "reports", report.request.runId);
  const original = await readFile(join(root, "report.json"));
  await writeFile(join(root, "report.json"), original.toString("utf8") + "\n");
  await expect(runCommand(["evidence", "inspect", root], f.context)).rejects.toMatchObject({
    code: "Integrity",
  });
  await writeFile(join(root, "report.json"), original);
  await writeFile(join(root, "completed.json"), "{}");
  await expect(runCommand(["evidence", "inspect", root], f.context)).rejects.toMatchObject({
    code: "Integrity",
  });
  await rm(join(root, "report.json"));
  await rm(join(root, "completed.json"));
  expect((await runCommand(["evidence", "recover", root], f.context)).data).toMatchObject({
    state: "interrupted",
    report: null,
  });
});
test("cancellation saves a partial report and maps to exit 130", async () => {
  const f = await fixture(),
    controller = new AbortController();
  const result = await runCommand(f.args, {
    ...f.context,
    signal: controller.signal,
    onEvidenceProgress: (event) => {
      if (event.phase === "claim") controller.abort();
    },
  });
  expect(result.exitCode).toBe(130);
  expect(parseEvidenceReport(result.data).status).toBe("cancelled");
  expect(f.methods).toHaveLength(1);
});
test("invalid, implicit and offline refresh arguments fail before output or RPC", async () => {
  const f = await fixture();
  for (const args of [
    [...f.args, "--offline"],
    f.args.filter((a) => a !== "current-v1"),
    ["evidence", "refresh"],
    ["evidence", "capabilities", "--network", "ethereum-mainnet"],
  ])
    await expect(runCommand(args, f.context)).rejects.toMatchObject({ code: "InvalidInput" });
  expect(f.methods).toHaveLength(0);
  expect(await readdir(f.context.cwd)).toHaveLength(0);
});
