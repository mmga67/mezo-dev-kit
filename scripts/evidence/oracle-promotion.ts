import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { object, objects, parseJson, text } from "../lib/json.ts";
import { OracleProposalError, proposeOracleRefresh } from "./oracle-refresh-plan.ts";
import {
  applyPromotionFiles,
  assertPromotionChange,
  promotionDiff,
  promotionDigest,
  promotionPath,
  promotionReadBytes,
  recoverPromotionFiles,
  verifyPromotionInputs,
  type PromotionChange,
} from "./promotion-files.ts";

const exec = promisify(execFile);
const generators = [
  "generate-contract-reference",
  "generate-price-reference",
  "generate-chains-package",
  "generate-contracts-package",
  "generate-protocol-operations",
  "generate-savings-package",
  "generate-lending-package",
  "generate-vault-package",
  "generate-borrowing-package",
  "generate-prices-package",
  "generate-pools-package",
  "generate-institutional-package",
  "generate-redemption-package",
  "generate-incentives-package",
  "generate-bridges-package",
  "generate-evidence-package",
];
const validators = [
  ["scripts/checks/validate-knowledge-structure.ts"],
  ["scripts/checks/validate-contract-knowledge.ts", "--network", "mezo-mainnet"],
  ["scripts/checks/validate-price-knowledge.ts", "--network", "mezo-mainnet"],
];

/** Build an offline, content-bound proposal. Staging never writes into canonical owners. */
export async function prepareOraclePromotion(
  root: string,
  capture: Buffer,
  asOf: number,
): Promise<string> {
  const { stdout } = await exec(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, maxBuffer: 8 * 1024 * 1024 },
  );
  const snapshot = new Map<string, Buffer>();
  for (const path of [...new Set(stdout.split("\0").filter(Boolean))].sort()) {
    const bytes = await promotionReadBytes(root, path);
    if (bytes !== null) snapshot.set(path, bytes);
  }
  const writes = await proposeOracleRefresh(
    capture,
    async (path) => {
      const value = snapshot.get(path);
      if (value === undefined) throw new Error(`Missing proposal input: ${path}`);
      return value.toString("utf8");
    },
    asOf,
  );
  for (const entry of writes)
    assertPromotionChange({
      path: entry.path,
      before: snapshot.get(entry.path)?.toString("utf8") ?? null,
      after: entry.content,
    });
  const stage = await mkdtemp(join(tmpdir(), "mdk-oracle-proposal-"));
  const validation: { command: readonly string[]; status: "passed" | "failed"; detail: string }[] =
    [];
  try {
    for (const [path, content] of snapshot) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), content);
    }
    await symlink(join(root, "node_modules"), join(stage, "node_modules"), "dir");
    for (const path of snapshot.keys()) {
      if (path.startsWith("packages/") && path.endsWith("/package.json")) {
        await symlink(
          join(root, dirname(path), "node_modules"),
          join(stage, dirname(path), "node_modules"),
          "dir",
        );
      }
    }
    for (const entry of writes) {
      await mkdir(dirname(join(stage, entry.path)), { recursive: true });
      await writeFile(join(stage, entry.path), entry.content);
    }
    for (const args of [...generators.map((g) => [`scripts/generate/${g}.ts`]), ...validators]) {
      try {
        await exec(process.execPath, args, { cwd: stage, maxBuffer: 4 * 1024 * 1024 });
        validation.push({
          command: ["node", ...args],
          status: "passed",
          detail: "Completed in disposable workspace",
        });
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message.slice(0, 4000).replaceAll(stage, "<stage>")
            : "Validation failed";
        validation.push({ command: ["node", ...args], status: "failed", detail });
        if (args[0]?.startsWith("scripts/generate/")) break;
      }
    }
    const changes: PromotionChange[] = [];
    for (const path of new Set([...snapshot.keys(), ...writes.map((w) => w.path)])) {
      const beforeBytes = snapshot.get(path) ?? null;
      const afterBytes = await promotionReadBytes(stage, path);
      if (beforeBytes !== null && afterBytes !== null && beforeBytes.equals(afterBytes)) continue;
      if (afterBytes === null) throw new Error("Proposal unexpectedly removed a file");
      const change = {
        path,
        before: beforeBytes?.toString("utf8") ?? null,
        after: afterBytes.toString("utf8"),
      };
      assertPromotionChange(change);
      changes.push(change);
    }
    const inputs = [...snapshot].map(([path, value]) => ({ path, sha256: promotionDigest(value) }));
    await verifyPromotionInputs(root, inputs);
    const fields = changes
      .filter((c) => c.path.endsWith(".json"))
      .map((c) => ({
        path: c.path,
        changes: promotionDiff(
          c.before === null ? undefined : parseJson(c.before, c.path),
          parseJson(c.after, c.path),
        ),
      }));
    return (
      JSON.stringify(
        {
          formatVersion: 1,
          recipe: "oracle-mainnet-matching-v1",
          disposition: "matching-reverification",
          captureSha256: promotionDigest(capture),
          capture: capture.toString("utf8"),
          plannedAt: new Date(asOf).toISOString(),
          freshnessPolicy: {
            captureMaxAgeSeconds: 86400,
            blockMaxSkewSeconds: 300,
            claimReviewDays: 7,
          },
          coverage: {
            included: ["mainnet oracle matching generation, source, ABI and historical replay"],
            excluded: [
              "testnet archive",
              "unrelated envelope renewal",
              "changed mechanics/source/ABI/support",
            ],
            reviewRequired: ["exact changeset digest", "qualified domain review"],
          },
          inputs,
          changes,
          fields,
          validation,
        },
        null,
        2,
      ) + "\n"
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

/** Apply only a reviewed exact-byte proposal after reproducible offline validation. */
export async function applyOraclePromotion(
  root: string,
  bytes: string,
  reviewedDigest: string,
  asOf: number,
): Promise<void> {
  if (promotionDigest(bytes) !== reviewedDigest)
    throw new Error("Reviewed changeset digest mismatch");
  const plan = object(parseJson(bytes, "changeset"), "changeset");
  if (
    plan.formatVersion !== 1 ||
    plan.recipe !== "oracle-mainnet-matching-v1" ||
    plan.disposition !== "matching-reverification"
  )
    throw new Error("Unsupported review disposition");
  const inputs = objects(plan.inputs, "inputs").map((i) => ({
    path: text(i.path, "path"),
    sha256: text(i.sha256, "sha256"),
  }));
  await verifyPromotionInputs(root, inputs);
  const capture = Buffer.from(text(plan.capture, "capture"));
  if (promotionDigest(capture) !== plan.captureSha256) throw new Error("Capture digest mismatch");
  const validation = objects(plan.validation, "validation");
  if (
    validation.length !== generators.length + validators.length ||
    validation.some((v) => v.status !== "passed")
  )
    throw new Error("Required proposal validation did not pass");
  const replanned = object(
    parseJson(await prepareOraclePromotion(root, capture, asOf), "replanned"),
    "replanned",
  );
  if (
    objects(replanned.validation, "validation").some((v) => v.status !== "passed") ||
    JSON.stringify(replanned.changes) !== JSON.stringify(plan.changes)
  )
    throw new Error("Proposal changed or validation failed; review a new proposal");
  const changes = objects(plan.changes, "changes").map((c) => ({
    path: text(c.path, "path"),
    before: c.before === null ? null : text(c.before, "before"),
    after: text(c.after, "after"),
  }));
  await applyPromotionFiles(root, changes, inputs);
}

/** Maintainer command boundary, separate from the installed public capture CLI. */
export async function oraclePromotionCommand(root: string, args: readonly string[]): Promise<void> {
  const [command, path, output, digest] = args;
  if (command === "recover" && args.length === 1) {
    await recoverPromotionFiles(root);
    return;
  }
  if (command === "propose" && path && output && args.length === 3) {
    if (!output.startsWith("local/"))
      throw new Error("Review proposals belong under ignored local/");
    let result: string;
    try {
      result = await prepareOraclePromotion(root, await readFile(path), Date.now());
    } catch (error) {
      if (!(error instanceof OracleProposalError)) throw error;
      process.stdout.write(
        `${JSON.stringify({ status: "rejected", disposition: error.disposition, reason: error.message, canonicalMutation: false })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    const target = await promotionPath(root, output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result, { flag: "wx" });
    process.stdout.write(
      `${JSON.stringify({ changeset: output, sha256: promotionDigest(result), validation: object(parseJson(result, "proposal"), "proposal").validation })}\n`,
    );
    return;
  }
  if (
    command === "apply" &&
    path &&
    output === "--reviewed-digest" &&
    digest &&
    args.length === 4
  ) {
    await applyOraclePromotion(root, await readFile(path, "utf8"), digest, Date.now());
    return;
  }
  throw new Error(
    "Usage: import-mainnet-oracle-refresh.ts propose <capture> <local/changeset.json> | apply <changeset> --reviewed-digest <sha256> | recover",
  );
}
