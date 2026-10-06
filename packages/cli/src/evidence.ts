import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createEvidenceHttpRequest,
  evidenceCapabilities,
  EvidenceError,
  parseEvidenceReport,
  parseEvidenceRequest,
  refreshEvidence,
} from "@mezo-dev-kit/evidence";
import type { EvidenceProgress, EvidenceReport } from "@mezo-dev-kit/evidence";
import type { CommandContext, CommandResult } from "./command.ts";
import { CliError } from "./errors.ts";
import { digest, jsonText, record } from "./contracts.ts";
import { containedPath, parseJson, readOptional, readRequired } from "./filesystem.ts";

const help = `Read-only evidence capture (private candidate)
mdk evidence capabilities [--json] [--offline]
mdk evidence refresh --network <id> --recipe <id> --provider <label>
  --rpc-env <environment-variable> --policy current-v1 --output <directory> [--json]
  [--contracts <comma-separated-ids>] [--max-requests <count>]
  [--max-block-age <seconds>] [--max-price-age <seconds>]
mdk evidence inspect <run-directory> [--json] [--offline]
mdk evidence recover <run-directory> [--json] [--offline]

current-v1: one concurrent request; 1000 requests; two attempts per call;
15-second timeout; 256 KiB response limit; block age 120s; price age 60s.
Set the RPC URL in the named environment variable. It is never saved in reports.
Ctrl-C saves the collected observations as cancelled. A killed process leaves
run.json; recover finalizes a fully written report or reports interruption.
Refresh exit: 0 complete without findings; 3 partial/conflicting/stale; 1 failed; 130 cancelled.
Capture does not modify canonical knowledge, accept evidence or sign transactions.
`;

/** Link publishes a complete file exclusively; a crash leaves the immutable staging file. */
async function immutable(root: string, name: string, bytes: string): Promise<void> {
  const target = await containedPath(root, name),
    temporary = await containedPath(root, `${name}.pending`);
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  await link(temporary, target);
  await unlink(temporary);
}
function completeRecord(
  report: EvidenceReport,
  bytes: string | Uint8Array = jsonText(report),
): string {
  return jsonText({
    formatVersion: 1,
    runId: report.request.runId,
    report: "report.json",
    sha256: digest(bytes),
    status: report.status,
  });
}
async function inspect(root: string, recover: boolean): Promise<unknown> {
  const start = record(
    parseJson(await readRequired(root, "run.json"), "run manifest"),
    "run manifest",
  );
  if (start.formatVersion !== 1) throw new CliError("InvalidInput", "Unsupported run manifest");
  let bytes = await readOptional(root, "report.json");
  if (!bytes && recover) {
    const pending = await readOptional(root, "report.json.pending");
    if (pending) {
      const report = parseEvidenceReport(parseJson(pending, "pending report"));
      if (JSON.stringify(report.request) !== JSON.stringify(start.request))
        throw new CliError("Integrity", "Report and run request differ");
      await link(
        await containedPath(root, "report.json.pending"),
        await containedPath(root, "report.json"),
      );
      await unlink(await containedPath(root, "report.json.pending"));
      bytes = pending;
    }
  }
  if (!bytes)
    return {
      state: "interrupted",
      request: start.request,
      report: null,
      note: "No complete report is present. Start a new run to collect again; this command never contacts RPC.",
    };
  const report = parseEvidenceReport(parseJson(bytes, "report"));
  if (JSON.stringify(report.request) !== JSON.stringify(start.request))
    throw new CliError("Integrity", "Report and run request differ");
  const completion = await readOptional(root, "completed.json");
  if (completion && completion.toString("utf8") !== completeRecord(report, bytes))
    throw new CliError("Integrity", "Completion manifest does not match report");
  if (!completion && recover) {
    const pending = await readOptional(root, "completed.json.pending");
    if (pending) {
      if (pending.toString("utf8") !== completeRecord(report, bytes))
        throw new CliError(
          "Integrity",
          "Incomplete completion manifest differs; retain this run and start a new one",
        );
      await link(
        await containedPath(root, "completed.json.pending"),
        await containedPath(root, "completed.json"),
      );
      await unlink(await containedPath(root, "completed.json.pending"));
    } else await immutable(root, "completed.json", completeRecord(report, bytes));
  }
  return { state: completion || recover ? "saved" : "needs-recovery", report };
}
export function evidenceExitCode(report: EvidenceReport): number {
  if (report.status === "cancelled") return 130;
  if (report.status === "failed") return 1;
  if (
    report.status !== "complete" ||
    report.blockFreshness !== "fresh" ||
    report.observations.some(
      (o) => o.status === "conflict" || ["stale", "future", "missing"].includes(o.freshness),
    )
  )
    return 3;
  return 0;
}
export async function evidenceCommand(
  args: readonly string[],
  context: CommandContext,
): Promise<CommandResult> {
  try {
    const parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean" },
        json: { type: "boolean" },
        offline: { type: "boolean" },
        network: { type: "string" },
        recipe: { type: "string" },
        provider: { type: "string" },
        "rpc-env": { type: "string" },
        policy: { type: "string" },
        output: { type: "string" },
        contracts: { type: "string" },
        "max-requests": { type: "string" },
        "max-block-age": { type: "string" },
        "max-price-age": { type: "string" },
      },
    });
    const { values, positionals } = parsed,
      [action, ...rest] = positionals;
    if (values.help || !action) return { exitCode: 0, data: help };
    const common = ["json", "offline"],
      refresh = [
        "network",
        "recipe",
        "provider",
        "rpc-env",
        "policy",
        "output",
        "contracts",
        "max-requests",
        "max-block-age",
        "max-price-age",
      ];
    if (
      Object.keys(values).some(
        (k) => ![...common, ...(action === "refresh" ? refresh : [])].includes(k),
      )
    )
      throw new CliError("InvalidInput", "Option does not apply to this evidence command");
    if (action === "capabilities" && !rest.length)
      return { exitCode: 0, data: evidenceCapabilities() };
    if ((action === "inspect" || action === "recover") && rest.length === 1 && rest[0])
      return {
        exitCode: 0,
        data: await inspect(resolve(context.cwd, rest[0]), action === "recover"),
      };
    if (
      action !== "refresh" ||
      rest.length ||
      values.offline ||
      values.policy !== "current-v1" ||
      !values.output ||
      !values["rpc-env"]
    )
      throw new CliError(
        "InvalidInput",
        "Use evidence --help; refresh requires explicit inputs and cannot run offline",
      );
    const request = parseEvidenceRequest({
      formatVersion: 1,
      runId: randomUUID(),
      providerId: values.provider,
      networkId: values.network,
      recipe: values.recipe,
      contractIds: values.contracts?.split(",") ?? [],
      policy: {
        maxRequests: values["max-requests"] ? Number(values["max-requests"]) : 1000,
        maxAttempts: 2,
        maxResponseBytes: 262144,
        timeoutMs: 15000,
        maxBlockAgeSeconds: values["max-block-age"] ?? "120",
        maxPriceAgeSeconds: values["max-price-age"] ?? "60",
      },
    });
    const url = (context.environment ?? process.env)[values["rpc-env"]];
    if (!url) throw new CliError("InvalidInput", "The selected RPC environment variable is empty");
    const rpc = createEvidenceHttpRequest({ url, fetch: context.fetch ?? globalThis.fetch });
    const output = resolve(context.cwd, values.output);
    await mkdir(output, { recursive: true });
    const root = await containedPath(output, request.runId);
    await mkdir(root, { mode: 0o700 });
    await immutable(root, "run.json", jsonText({ formatVersion: 1, request }));
    const report = await refreshEvidence(request, {
      request: rpc,
      now: () => BigInt(Math.floor((context.now?.getTime() ?? Date.now()) / 1000)),
      ...(context.signal ? { signal: context.signal } : {}),
      ...(context.onEvidenceProgress ? { onProgress: context.onEvidenceProgress } : {}),
    });
    await immutable(root, "report.json", jsonText(report));
    await immutable(root, "completed.json", completeRecord(report));
    return { exitCode: evidenceExitCode(report), data: report };
  } catch (error) {
    if (error instanceof EvidenceError)
      throw new CliError(
        "InvalidInput",
        "Invalid evidence request or report; run mdk evidence --help",
      );
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("ERR_PARSE_ARGS_")
    )
      throw new CliError("InvalidInput", "Invalid evidence arguments; run mdk evidence --help");
    throw error;
  }
}
export type EvidenceProgressHandler = (event: EvidenceProgress) => void;
