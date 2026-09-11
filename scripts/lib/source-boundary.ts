import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Root-only local material; maintained nested fixtures keep their own owners. */
export const LOCAL_SOURCE_ROOTS: readonly string[] = [
  "local",
  "legacy",
  ".mdk",
  ".agents",
  ".codex",
  "tasks",
  "plans",
  "docs/reviews",
];

export function isLocalSourcePath(path: string): boolean {
  return LOCAL_SOURCE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function paths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path.length > 0);
}

/** Inspect the actual index, including force-added files and symlinks. */
export function validateSourceIndex(root: string): readonly string[] {
  const diagnostics = paths(git(root, ["ls-files", "--cached", "-z"]))
    .filter(isLocalSourcePath)
    .map((path) => `Local material is staged/tracked: ${path}`);
  // Read the staged policy: a different working copy must not conceal a bad commit.
  const ignoreRules = new Set(git(root, ["show", ":.gitignore"]).split(/\r?\n/));
  const workingRules = new Set(readFileSync(join(root, ".gitignore"), "utf8").split(/\r?\n/));
  for (const path of LOCAL_SOURCE_ROOTS) {
    const rule = `/${path}/`;
    if (!ignoreRules.has(rule) || !workingRules.has(rule)) {
      diagnostics.push(`Required root ignore rule missing from index or worktree: ${rule}`);
    }
  }
  return diagnostics;
}

/** Check every incoming commit tree, including files deleted again before the tip. */
export function validateSourceHistory(
  root: string,
  head: string,
  base?: string,
): readonly string[] {
  const headCommit = git(root, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${head}^{commit}`,
  ]).trim();
  let revision = headCommit;
  if (base !== undefined) {
    const baseCommit = git(root, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ]).trim();
    const common = git(root, ["merge-base", baseCommit, headCommit]).trim();
    if (common !== baseCommit) {
      return [
        "Base is not an ancestor of the candidate; merge the updated main into feat/next first.",
      ];
    }
    revision = `${baseCommit}..${headCommit}`;
  }
  const commits = git(root, ["rev-list", revision]).trim().split("\n").filter(Boolean);
  const diagnostics: string[] = [];
  for (const commit of commits) {
    const privatePaths = paths(
      git(root, ["ls-tree", "-r", "--name-only", "-z", commit, "--", ...LOCAL_SOURCE_ROOTS]),
    );
    for (const path of privatePaths.filter(isLocalSourcePath)) {
      diagnostics.push(`Local material in incoming commit ${commit.slice(0, 12)}: ${path}`);
    }
  }
  return diagnostics;
}

/** Git supplies one local-ref/local-OID/remote-ref/remote-OID tuple per pushed ref. */
export function validateSourcePush(root: string, input: string): readonly string[] {
  const diagnostics: string[] = [];
  for (const line of input.split("\n").filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    const [localRef, localOid, remoteRef, remoteOid] = fields;
    if (
      fields.length !== 4 ||
      localRef === undefined ||
      remoteRef === undefined ||
      localOid === undefined ||
      remoteOid === undefined ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(localOid) ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(remoteOid)
    ) {
      throw new Error("Malformed Git pre-push input.");
    }
    if (/^0+$/.test(localOid)) continue; // A deletion sends no new source history.
    // A new remote ref has no trusted boundary; inspect its complete ancestry.
    diagnostics.push(
      ...validateSourceHistory(root, localOid, /^0+$/.test(remoteOid) ? undefined : remoteOid),
    );
  }
  return diagnostics;
}
