import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  validateSourceHistory,
  validateSourceIndex,
  validateSourcePush,
} from "./lib/source-boundary.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root: string, path: string, content = "synthetic local note\n"): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "mdk-source-boundary-"));
  fixtures.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Boundary Fixture");
  git(root, "config", "user.email", "boundary@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "config", "core.hooksPath", "/dev/null");
  write(root, ".gitignore", readFileSync(join(repositoryRoot, ".gitignore"), "utf8"));
  write(root, "README.md", "# Synthetic MDK source\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "Public foundation");
  git(root, "switch", "-c", "feat/next");
  return root;
}

test("whole-feature commits and repeated fast-forward merges preserve ignored local data", () => {
  const root = fixture();
  write(root, "legacy/reference.ts");
  write(root, "tasks/active/work.md");
  write(root, "docs/reviews/private.md");
  write(root, ".agents/skills/example/SKILL.md");
  write(root, "docs/examples/tasks/public-example.md", "maintained example\n");
  for (const revision of ["first", "second"]) {
    write(root, "src/feature.ts", `export const revision = '${revision}';\n`);
    git(root, "add", "-A");
    expect(validateSourceIndex(root)).toEqual([]);
    expect(git(root, "ls-files", "legacy", "tasks", "docs/reviews", ".agents")).toBe("");
    expect(git(root, "ls-files", "docs/examples/tasks")).toBe(
      "docs/examples/tasks/public-example.md",
    );
    git(root, "commit", "-m", `Feature ${revision}`);
    expect(validateSourceHistory(root, "HEAD", "main")).toEqual([]);
    git(root, "switch", "main");
    git(root, "merge", "--ff-only", "feat/next");
    expect(readFileSync(join(root, "legacy/reference.ts"), "utf8")).toBe("synthetic local note\n");
    git(root, "switch", "feat/next");
  }
});

test("force-added private paths are rejected even with spaces or newlines", () => {
  const root = fixture();
  const privatePaths = [
    "legacy/reference.ts",
    "tasks/private plan\nsecond line.md",
    "docs/reviews/result.md",
    ".mdk/memory/note.json",
  ];
  for (const path of privatePaths) {
    write(root, path);
    git(root, "add", "--force", "--", path);
  }
  const diagnostics = validateSourceIndex(root);
  for (const path of privatePaths)
    expect(diagnostics).toContain(`Local material is staged/tracked: ${path}`);
});

test("a root symlink cannot publish local material under an ignored directory name", () => {
  const root = fixture();
  symlinkSync("../external-private-data", join(root, "legacy"));
  git(root, "add", "--force", "legacy");
  expect(validateSourceIndex(root)).toContain("Local material is staged/tracked: legacy");
});

test("an unstaged repair cannot conceal a removed ignore rule in the index", () => {
  const root = fixture();
  const policy = readFileSync(join(root, ".gitignore"), "utf8");
  write(root, ".gitignore", policy.replace("/legacy/\n", ""));
  git(root, "add", ".gitignore");
  write(root, ".gitignore", policy);
  expect(validateSourceIndex(root)).toContain(
    "Required root ignore rule missing from index or worktree: /legacy/",
  );
});

test("incoming history rejects private files that were committed and subsequently removed", () => {
  const root = fixture();
  const base = git(root, "rev-parse", "main");
  write(root, "plans/abandoned.md");
  git(root, "add", "--force", "plans/abandoned.md");
  git(root, "commit", "-m", "Accidental private commit");
  git(root, "rm", "plans/abandoned.md");
  git(root, "commit", "-m", "Remove private file");
  expect(validateSourceIndex(root)).toEqual([]);
  expect(validateSourceHistory(root, "HEAD", "main")).toEqual([
    expect.stringContaining("plans/abandoned.md"),
  ]);
  const head = git(root, "rev-parse", "HEAD");
  expect(
    validateSourcePush(root, `refs/heads/feat/next ${head} refs/heads/main ${base}\n`),
  ).toEqual([expect.stringContaining("plans/abandoned.md")]);
  expect(
    validateSourcePush(root, `refs/heads/feat/next ${head} refs/heads/new ${"0".repeat(40)}\n`),
  ).toEqual([expect.stringContaining("plans/abandoned.md")]);
});

test("promotion refuses a stale base until main has been merged into the feature", () => {
  const root = fixture();
  write(root, "feature.md");
  git(root, "add", "feature.md");
  git(root, "commit", "-m", "Feature");
  git(root, "switch", "main");
  write(root, "upstream.md");
  git(root, "add", "upstream.md");
  git(root, "commit", "-m", "Upstream");
  git(root, "switch", "feat/next");
  expect(validateSourceHistory(root, "HEAD", "main")).toEqual([
    expect.stringContaining("not an ancestor"),
  ]);
  git(root, "merge", "--no-edit", "main");
  expect(validateSourceHistory(root, "HEAD", "main")).toEqual([]);
});

test("missing history and malformed push input fail instead of silently passing", () => {
  const root = fixture();
  expect(() => validateSourceHistory(root, "HEAD", "missing-ref")).toThrow();
  expect(() => validateSourcePush(root, "malformed\n")).toThrow("Malformed Git pre-push input");
  expect(
    validateSourcePush(
      root,
      `(delete) ${"0".repeat(40)} refs/heads/old ${git(root, "rev-parse", "HEAD")}\n`,
    ),
  ).toEqual([]);
});

test("the installed pre-commit hook blocks an ordinary commit of force-added local data", () => {
  const root = fixture();
  for (const path of ["scripts/validate-source-boundary.ts", "scripts/lib/source-boundary.ts"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repositoryRoot, path), join(root, path));
  }
  git(root, "config", "core.hooksPath", join(repositoryRoot, ".githooks"));
  write(root, "legacy/reference.ts");
  git(root, "add", "--force", "legacy/reference.ts");
  const before = git(root, "rev-parse", "HEAD");
  const result = spawnSync("git", ["commit", "-m", "Must be rejected"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Local material is staged/tracked: legacy/reference.ts");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
});

test("the push hook allows public history and blocks a deleted private file before transfer", () => {
  const root = fixture();
  const remote = mkdtempSync(join(tmpdir(), "mdk-source-remote-"));
  fixtures.push(remote);
  git(remote, "init", "--bare");
  git(root, "push", remote, "main:main");
  for (const path of ["scripts/validate-source-boundary.ts", "scripts/lib/source-boundary.ts"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(repositoryRoot, path), join(root, path));
  }
  git(root, "add", "scripts");
  git(root, "commit", "-m", "Public tooling");
  git(root, "config", "core.hooksPath", join(repositoryRoot, ".githooks"));
  git(root, "push", remote, "HEAD:main");
  const published = git(remote, "rev-parse", "refs/heads/main");
  expect(published).toBe(git(root, "rev-parse", "HEAD"));

  // Deliberately bypass the synthetic commit hook to exercise the independent push guard.
  write(root, "local/accidental-note.md");
  git(root, "add", "--force", "local/accidental-note.md");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-m", "Private fixture");
  git(root, "rm", "local/accidental-note.md");
  git(root, "commit", "-m", "Delete private fixture");
  const result = spawnSync("git", ["push", remote, "HEAD:main"], { cwd: root, encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("local/accidental-note.md");
  expect(git(remote, "rev-parse", "refs/heads/main")).toBe(published);
});
