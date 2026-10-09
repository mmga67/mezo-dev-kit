import { readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { contextCatalog, readContext } from "./context-retrieval.ts";
import { readContextFile } from "./context-files.ts";
import { object, parseJson } from "./json.ts";
import { isLocalSourcePath } from "./source-boundary.ts";
import { loadKnowledgeModule, type KnowledgeReference } from "./knowledge-reference.ts";

interface Dependency {
  readonly consumer: string;
  readonly input: string;
  readonly basis: "logical-reference" | "generated-from" | "local-source-digest";
}

export interface ContextImpact {
  readonly seed: string;
  readonly dependents: readonly { path: string; reasons: readonly Dependency[] }[];
  readonly reviewCandidates: readonly { path: string; mentions: readonly string[] }[];
  readonly unresolvedReferences: readonly { consumer: string; reference: string }[];
  readonly coverage: {
    indexedResources: number;
    scannedGuidance: number;
    granularity: string;
    allDeclaredReferencesResolved: boolean;
    limitations: readonly string[];
  };
  readonly requiredReview: readonly string[];
  readonly networkRequests: 0;
  readonly writes: 0;
}

function localPath(root: string, path: string): string {
  const result = relative(resolve(root), resolve(root, path)).split(sep).join("/");
  if (!result || result === ".." || result.startsWith("../") || isLocalSourcePath(result))
    throw new Error("Impact input must be maintained repository source");
  if (result.split("/").some((part) => part.startsWith(".")))
    throw new Error("Hidden paths are outside impact scope");
  return result;
}

function visit(value: unknown, action: (entry: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, action);
  } else if (value !== null && typeof value === "object") {
    const entry = object(value, "impact input");
    action(entry);
    for (const item of Object.values(entry)) visit(item, action);
  }
}

async function guidanceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(path: string): Promise<void> {
    if (isLocalSourcePath(path)) return;
    let entries;
    try {
      entries = await readdir(resolve(root, path), { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || ["node_modules", "dist", "memory"].includes(entry.name))
        continue;
      const child = `${path}/${entry.name}`;
      if (isLocalSourcePath(child)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Impact guidance contains a symlink: ${child}`);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && extname(child) === ".md") found.push(child);
    }
  }
  for (const path of ["docs", "agents/skills", "agents/consumer/skills", "packages", "scripts"])
    await walk(path);
  for (const path of [
    "AGENTS.md",
    "ARCHITECTURE.md",
    "CONTRIBUTING.md",
    "README.md",
    "docs/manifest",
  ])
    if ((await readContextFile(root, path, true)) !== undefined) found.push(path);
  return [...new Set(found)].sort();
}

/** Reverse declared dependencies; prose matches are review candidates, never semantic proof. */
export async function contextImpact(
  root: string,
  target: { readonly path: string } | { readonly reference: KnowledgeReference },
): Promise<ContextImpact> {
  const seed = localPath(
    root,
    "path" in target
      ? target.path
      : (await readContext(root, target.reference, { maxChars: 100 })).path,
  );
  await readContextFile(root, seed);
  const catalog = await contextCatalog(root);
  const paths = new Map(
    catalog.map((entry) => [`${entry.moduleId}:${entry.resource.id}`, localPath(root, entry.path)]),
  );
  const dependencies: Dependency[] = [];
  const dependencyKeys = new Set<string>();
  const unresolved = new Map<string, { consumer: string; reference: string }>();
  const moduleDirectories = new Map<string, string>();
  const add = (consumer: string, input: string, basis: Dependency["basis"]) => {
    const key = JSON.stringify([consumer, input, basis]);
    if (consumer !== input && !dependencyKeys.has(key)) {
      dependencies.push({ consumer, input, basis });
      dependencyKeys.add(key);
    }
  };
  const referencePath = (value: Record<string, unknown>, consumer: string): string | undefined => {
    if (typeof value.moduleId !== "string" || typeof value.resourceId !== "string")
      return undefined;
    const path = paths.get(`${value.moduleId}:${value.resourceId}`);
    if (!path) {
      const reference = `${value.moduleId}:${value.resourceId}`;
      unresolved.set(`${consumer}:${reference}`, { consumer, reference });
    }
    return path;
  };
  for (const entry of catalog) {
    const consumer = localPath(root, entry.path);
    visit(entry.resource.generatedFrom, (ref) => {
      const input = referencePath(ref, consumer);
      if (input) add(consumer, input, "generated-from");
    });
    if (
      !["canonical-record", "source-catalog", "evidence", "fixture"].includes(
        String(entry.resource.role),
      )
    )
      continue;
    if (extname(consumer) !== ".json") continue;
    const raw = await readContextFile(root, consumer);
    if (raw === undefined) throw new Error(`Missing impact input: ${consumer}`);
    let moduleDirectory = moduleDirectories.get(entry.moduleId);
    if (!moduleDirectory) {
      moduleDirectory = (await loadKnowledgeModule(root, entry.moduleId)).directory;
      moduleDirectories.set(entry.moduleId, moduleDirectory);
    }
    const localSources: string[] = [];
    visit(parseJson(raw, consumer), (ref) => {
      const input = referencePath(ref, consumer);
      if (input) add(consumer, input, "logical-reference");
      if (
        entry.resource.role !== "source-catalog" ||
        typeof ref.path !== "string" ||
        typeof ref.sha256 !== "string"
      )
        return;
      // Upstream repository paths also have digests. Only explicit local provenance
      // or an indexed repository-root path establishes a local file dependency.
      if (ref.kind === "accepted-project-baseline" || ref.type === "local-evidence")
        localSources.push(localPath(root, resolve(moduleDirectory, ref.path)));
      else if (ref.path.startsWith("knowledge/") && [...paths.values()].includes(ref.path))
        localSources.push(ref.path);
    });
    for (const input of localSources) {
      await readContextFile(root, input);
      add(consumer, input, "local-source-digest");
    }
  }
  const affected = new Set([seed]);
  for (let changed = true; changed;) {
    changed = false;
    for (const edge of dependencies) {
      if (affected.has(edge.input) && !affected.has(edge.consumer)) {
        affected.add(edge.consumer);
        changed = true;
      }
    }
  }
  const ids = new Map<string, string[]>();
  const ownerPaths = new Map<string, string>();
  for (const entry of catalog) {
    const directory = moduleDirectories.get(entry.moduleId);
    if (entry.moduleId !== "knowledge" && directory)
      ownerPaths.set(localPath(root, entry.path), localPath(root, directory));
  }
  for (const [id, path] of paths)
    if (affected.has(path)) {
      const values = ids.get(path) ?? [];
      values.push(id, id.slice(id.indexOf(":") + 1));
      ids.set(path, values);
    }
  const guidance = [
    ...new Set([
      ...(await guidanceFiles(root)),
      ...catalog
        .filter((entry) => entry.resource.role === "review" && extname(entry.path) === ".md")
        .map((entry) => localPath(root, entry.path)),
    ]),
  ].sort();
  const reviewCandidates: { path: string; mentions: string[] }[] = [];
  for (const path of guidance) {
    if (affected.has(path)) continue;
    const raw = await readContextFile(root, path);
    if (raw === undefined) throw new Error(`Missing guidance: ${path}`);
    const mentioned = new Set<string>();
    // Only explicit paths/IDs and Markdown destinations: no claim of natural-language inference.
    for (const input of affected) {
      const owner = ownerPaths.get(input);
      if (
        raw.includes(input) ||
        ids.get(input)?.some((id) => raw.includes(id)) ||
        (owner && raw.includes(owner))
      )
        mentioned.add(input);
    }
    for (const match of raw.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const link = match[1]?.split("#")[0];
      if (!link || /^[a-z][a-z0-9+.-]*:|^\//i.test(link)) continue;
      const destination = relative(resolve(root), resolve(root, dirname(path), link))
        .split(sep)
        .join("/");
      if (affected.has(destination)) mentioned.add(destination);
    }
    if (mentioned.size) reviewCandidates.push({ path, mentions: [...mentioned].sort() });
  }
  return {
    seed,
    dependents: [...affected]
      .filter((path) => path !== seed)
      .sort()
      .map((path) => ({
        path,
        reasons: dependencies.filter((edge) => edge.consumer === path && affected.has(edge.input)),
      })),
    reviewCandidates,
    unresolvedReferences: [...unresolved.values()].sort((a, b) =>
      `${a.consumer}:${a.reference}`.localeCompare(`${b.consumer}:${b.reference}`),
    ),
    coverage: {
      indexedResources: catalog.length,
      scannedGuidance: guidance.length,
      granularity:
        "resource/file; record and field targets conservatively affect their entire resource",
      allDeclaredReferencesResolved: unresolved.size === 0,
      limitations: [
        "Only indexed logical references, generatedFrom declarations and explicitly local source-catalog digests form transitive dependencies; upstream source paths are not local paths.",
        "Prose path/ID/owning-module/link matches in maintained guidance and indexed reviews are direct review candidates; navigation links do not propagate semantic impact.",
        "Unmentioned assumptions, source imports, runtime behavior, raw artifacts, external applications and unindexed files require manual review.",
        "No source was fetched, claim verified, review deadline renewed or consumer installation updated.",
      ],
    },
    requiredReview: [
      "Verify the observation and its generation/time scope with the owning domain.",
      "Review economic relationships, human architecture, package behavior, skills, examples and behavioral cases even when text matching finds none.",
      "Record updated, reviewed-unaffected or unresolved dispositions in the owning task; unresolved dependent claims remain held back.",
      "Regenerate affected projections and contributor discovery; assess versioned consumer distribution and installed guidance separately.",
    ],
    networkRequests: 0,
    writes: 0,
  };
}
