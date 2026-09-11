import { createHash } from "node:crypto";

import { object, objects, text, type JsonObject } from "./json.ts";
import { loadKnowledgeReference } from "./knowledge-reference.ts";

export interface PoolSourceBundle {
  readonly filePath: string;
  readonly sourceCode: string;
  readonly additionalSources: readonly JsonObject[];
}

/** Preserve the pool source-reproduction review digest algorithm, including its array ordering. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function parsePoolSourceBundle(value: unknown): PoolSourceBundle {
  const bundle = object(value, "pool source bundle");
  const filePath = text(bundle.filePath, "main source path");
  const sourceCode = text(bundle.sourceCode, "main source code");
  if (!filePath || !sourceCode) throw new Error("main source path and code must be nonempty");
  const additionalSources = objects(bundle.additionalSources, "additional sources");
  const paths = new Set([filePath]);
  for (const source of additionalSources) {
    const path = text(source.file_path, "additional source path");
    text(source.source_code, `source code for ${path}`);
    if (!path || paths.has(path)) throw new Error(`duplicate or empty source path '${path}'`);
    paths.add(path);
  }
  return { filePath, sourceCode, additionalSources };
}

/** Explorer metadata is deliberately outside source identity. No files are executed. */
export function capturePoolSourceBundle(value: unknown): PoolSourceBundle {
  const capture = object(value, "explorer capture");
  return parsePoolSourceBundle({
    filePath: capture.file_path,
    sourceCode: capture.source_code,
    additionalSources: [...objects(capture.additional_sources, "additional sources")].sort(
      (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  });
}

export function poolSourceDigest(bundle: PoolSourceBundle): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(bundle)))
    .digest("hex");
}

export function serializePoolSourceBundle(bundle: PoolSourceBundle): string {
  return `${JSON.stringify(canonicalize(bundle), null, 2)}\n`;
}

export function selectPoolSource(bundle: PoolSourceBundle, filePath = bundle.filePath): string {
  if (filePath === bundle.filePath) return bundle.sourceCode;
  const source = bundle.additionalSources.find((entry) => entry.file_path === filePath);
  if (source === undefined)
    throw new Error(`source file '${filePath}' not found in retained bundle`);
  return text(source.source_code, `source code for ${filePath}`);
}

/** Resolve indexed artifacts only. This function has no network or temporary-cache fallback. */
export async function loadPoolSourceBundle(
  repositoryRoot: string,
  contractId: string,
): Promise<PoolSourceBundle> {
  const entry = object(
    (
      await loadKnowledgeReference(repositoryRoot, {
        moduleId: "contracts",
        resourceId: "pool-source-bundles",
        recordId: contractId,
      })
    ).value,
    "retained pool source record",
  );
  const reproduction = object(
    (await loadKnowledgeReference(repositoryRoot, entry.reproductionReference)).value,
    "pool source reproduction",
  );
  if (entry.id !== contractId || reproduction.contractId !== contractId) {
    throw new Error(`source identity does not match '${contractId}'`);
  }
  const artifact = await loadKnowledgeReference(repositoryRoot, entry.artifactReference);
  const bundle = parsePoolSourceBundle(artifact.value);
  if (bundle.filePath !== reproduction.filePath) {
    throw new Error(`source file identity drifted for '${contractId}'`);
  }
  if (poolSourceDigest(bundle) !== reproduction.sourceBundleSha256) {
    throw new Error(`source bundle digest drifted for '${contractId}'`);
  }
  return bundle;
}
