import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const DOCUMENTATION_ROOTS = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "agents",
  "docs",
  "knowledge",
  "examples",
  "scripts",
  "packages",
  "templates",
] as const;
const OMIT_DIRECTORIES = new Set(["node_modules", "dist", "coverage"]);

export interface MarkdownLinkDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly target: string;
  readonly message: string;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function isMarkdown(file: string): boolean {
  return file.endsWith(".md") || basename(file) === "manifest";
}

// Preserve offsets for useful diagnostics. Fenced examples and HTML comments are not navigation.
export function visibleMarkdown(source: string): string {
  let fence: { character: string; length: number } | undefined;
  return source
    .replace(/<!--[\s\S]*?-->/g, (value) => value.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence) {
        const closing = new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line);
        if (closing) fence = undefined;
        return " ".repeat(line.length);
      }
      if (opening) {
        fence = { character: opening[0] ?? "`", length: opening.length };
        return " ".repeat(line.length);
      }
      return line;
    })
    .join("\n");
}

function headingText(value: string): string {
  return value
    .replace(
      /(`+)([\s\S]*?)\1|<[^>]*>|!?\[([^\]]+)\]\([^)]*\)/g,
      (_match, marker: string | undefined, code: string | undefined, label: string | undefined) =>
        marker === undefined ? (label ?? "") : (code ?? ""),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** GitHub-style heading IDs: punctuation removal, Unicode, duplicate suffixes and explicit HTML IDs. */
export function markdownAnchors(source: string): ReadonlySet<string> {
  const visible = visibleMarkdown(source);
  const anchors = new Set<string>();
  const headings = new Set<string>();
  const lines = visible.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    let heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined && /^ {0,3}(?:=+|-+)\s*$/.test(line)) {
      const previous = lines[index - 1]?.trim();
      if (previous && !/^(?:#|>|[-*+]\s)/.test(previous)) heading = previous;
    }
    if (heading === undefined) continue;
    const base = headingText(heading)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    let id = base;
    let suffix = 0;
    while (headings.has(id)) id = `${base}-${++suffix}`;
    headings.add(id);
    anchors.add(id);
  }
  for (const match of visible.matchAll(
    /<(?:a|h[1-6])\b[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi,
  )) {
    if (match[1]) anchors.add(match[1]);
  }
  return anchors;
}

function targets(source: string): readonly { target: string; index: number }[] {
  const visible = visibleMarkdown(source).replace(/(`+)[\s\S]*?\1/g, (value) =>
    value.replace(/[^\n]/g, " "),
  );
  const found: { target: string; index: number }[] = [];
  for (const match of visible.matchAll(/!?\[[^\]\n]*\]\(/g)) {
    const start = match.index + match[0].length;
    let cursor = start;
    while (/\s/.test(visible[cursor] ?? "") && cursor < visible.length) cursor++;
    if (visible[cursor] === "<") {
      const end = visible.indexOf(">", cursor + 1);
      if (end !== -1) found.push({ target: visible.slice(cursor + 1, end), index: match.index });
      continue;
    }
    const begin = cursor;
    let depth = 0;
    while (cursor < visible.length) {
      const character = visible[cursor];
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === "(") depth++;
      if (character === ")") {
        if (depth === 0) break;
        depth--;
      }
      if (/\s/.test(character ?? "")) break;
      cursor++;
    }
    found.push({
      target: visible.slice(begin, cursor).replace(/\\([()])/g, "$1"),
      index: match.index,
    });
  }
  for (const match of visible.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>]+>|\S+)/gm)) {
    const target = match[1];
    if (target) found.push({ target: target.replace(/^<|>$/g, ""), index: match.index });
  }
  return found;
}

export async function validateMarkdownLinks(root: string): Promise<{
  readonly files: number;
  readonly diagnostics: readonly MarkdownLinkDiagnostic[];
}> {
  const files: string[] = [];
  async function collect(file: string): Promise<void> {
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    if (info.isFile()) {
      if (isMarkdown(file)) files.push(file);
      return;
    }
    for (const entry of await readdir(file, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || OMIT_DIRECTORIES.has(entry.name) || entry.isSymbolicLink())
        continue;
      await collect(resolve(file, entry.name));
    }
  }
  for (const item of DOCUMENTATION_ROOTS) await collect(resolve(root, item));
  const diagnostics: MarkdownLinkDiagnostic[] = [];
  const anchors = new Map<string, ReadonlySet<string>>();
  for (const file of files.sort()) {
    const source = await readFile(file, "utf8");
    for (const { target, index } of targets(source)) {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
      const fail = (message: string): void => {
        diagnostics.push({
          file: relative(root, file),
          line: source.slice(0, index).split("\n").length,
          target,
          message,
        });
      };
      const hash = target.indexOf("#");
      let pathname: string;
      let fragment: string;
      try {
        pathname = decodeURIComponent(
          (hash === -1 ? target : target.slice(0, hash)).split("?")[0] ?? "",
        );
        fragment = hash === -1 ? "" : decodeURIComponent(target.slice(hash + 1));
      } catch {
        fail("invalid percent encoding");
        continue;
      }
      const destination = pathname
        ? isAbsolute(pathname)
          ? pathname
          : resolve(dirname(file), pathname)
        : file;
      const relation = relative(root, destination);
      if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        fail("target escapes the repository");
        continue;
      }
      try {
        await stat(destination);
      } catch (error) {
        if (!isMissing(error)) throw error;
        fail("missing target");
        continue;
      }
      if (!fragment || !isMarkdown(destination)) continue;
      let ids = anchors.get(destination);
      if (!ids) {
        ids = markdownAnchors(await readFile(destination, "utf8"));
        anchors.set(destination, ids);
      }
      if (!ids.has(fragment)) fail(`missing heading or explicit anchor '${fragment}'`);
    }
  }
  return { files: files.length, diagnostics };
}
