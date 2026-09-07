import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maintainedRoots = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "agents",
  "docs",
  "knowledge",
];
const markdownFiles: string[] = [];
const failures: string[] = [];

const isWithinRoot = (path: string): boolean => {
  const relation = relative(root, path);
  return relation !== ".." && !relation.startsWith(`..${sep}`);
};

const collectMarkdown = async (path: string): Promise<void> => {
  const info = await stat(path);
  if (info.isFile()) {
    if (path.endsWith(".md")) markdownFiles.push(path);
    return;
  }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    await collectMarkdown(resolve(path, entry.name));
  }
};

const normalizeTarget = (rawTarget: string): string | null => {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  if (target.length === 0 || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return null;
  }
  target = target.split("#", 1).at(0)?.split("?", 1).at(0) ?? "";
  if (target.length === 0) return null;
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

const inspectTarget = async (source: string, line: number, rawTarget: string): Promise<void> => {
  const target = normalizeTarget(rawTarget);
  if (target === null) return;
  const absolute = isAbsolute(target) ? target : resolve(dirname(source), target);
  if (!isWithinRoot(absolute)) {
    failures.push(`${relative(root, source)}:${line} escapes the repository: ${rawTarget}`);
    return;
  }
  try {
    await stat(absolute);
  } catch {
    failures.push(`${relative(root, source)}:${line} missing target: ${rawTarget}`);
  }
};

for (const entry of maintainedRoots) {
  await collectMarkdown(resolve(root, entry));
}

for (const file of markdownFiles) {
  const contents = await readFile(file, "utf8");
  const visible = contents.replace(/```[\s\S]*?```/g, "");
  const patterns = [
    /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g,
    /^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm,
  ];
  for (const pattern of patterns) {
    for (const match of visible.matchAll(pattern)) {
      const line = visible.slice(0, match.index).split("\n").length;
      const target = match[1];
      if (target === undefined)
        throw new Error(`Markdown target capture failed in ${file}:${line}`);
      await inspectTarget(file, line, target);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Markdown link validation failed:\n${failures.join("\n")}`);
}

process.stdout.write(
  `Validated local Markdown links in ${markdownFiles.length} maintained files.\n`,
);
