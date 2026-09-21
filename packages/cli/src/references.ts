import { resolve } from "node:path";
import { digest, parseBundle, parseLock } from "./contracts.ts";
import type { ReferenceBundle, ReferenceResource } from "./contracts.ts";
import { CliError } from "./errors.ts";
import { parseJson, readOptional, readRequired } from "./filesystem.ts";
import { applyChanges } from "./transactions.ts";

export interface RetrievalOptions {
  readonly offline?: boolean;
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}
export async function loadBundle(directory: string): Promise<ReferenceBundle> {
  return parseBundle(parseJson(await readRequired(directory, "bundle.json"), "reference bundle"));
}
export async function installedBundle(project: string): Promise<ReferenceBundle> {
  const lock = parseLock(parseJson(await readRequired(project, "mdk.lock.json"), "guidance lock"));
  const bytes = await readRequired(project, ".mdk/reference/bundle.json");
  const expected = lock.files.find((item) => item.path === ".mdk/reference/bundle.json");
  if (expected?.digest !== digest(bytes))
    throw new CliError("Integrity", "Installed reference index differs from its lock");
  const bundle = parseBundle(parseJson(bytes, "installed reference bundle"));
  if (bundle.id !== lock.bundleId)
    throw new CliError("Integrity", "Installed bundle differs from its lock");
  return bundle;
}
export function resourceClosure(
  bundle: ReferenceBundle,
  ids: readonly string[],
): readonly ReferenceResource[] {
  const seen = new Set<string>();
  const pending = [...ids];
  while (pending.length) {
    const id = pending.shift();
    if (!id || seen.has(id)) continue;
    const resource = bundle.resources.find((item) => item.id === id);
    if (!resource) {
      const excluded = bundle.exclusions.find((item) => item.id === id);
      throw new CliError(
        "Unavailable",
        excluded ? `${id} is excluded: ${excluded.reason}` : `Unknown reference: ${id}`,
      );
    }
    seen.add(id);
    pending.push(...resource.requires);
  }
  return bundle.resources.filter((item) => seen.has(item.id));
}
export function verifyResource(
  bytes: Uint8Array,
  resource: { readonly digest: string; readonly size: number; readonly path: string },
): void {
  if (bytes.length !== resource.size || digest(bytes) !== resource.digest)
    throw new CliError("Integrity", `Content differs from the locked resource: ${resource.path}`);
}
export async function obtainResource(
  sourceRoot: string,
  bundle: ReferenceBundle,
  resource: ReferenceResource,
  options: RetrievalOptions = {},
): Promise<Buffer> {
  const local = await readOptional(sourceRoot, resource.path);
  if (local) {
    verifyResource(local, resource);
    return local;
  }
  if (options.offline || !bundle.remoteBase)
    throw new CliError(
      "Unavailable",
      `Reference ${resource.id} is absent locally; provide its pinned artifact${options.offline ? " before offline use" : ""}`,
    );
  const url = new URL(resource.path, bundle.remoteBase);
  const origin = new URL(bundle.remoteBase);
  if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname))
    throw new CliError("InvalidInput", "Reference locator escapes the locked origin");
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, { redirect: "error", signal });
    if (!response.ok || !response.body)
      throw new CliError("Unavailable", `Reference download failed with HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        const chunk: unknown = next.value;
        if (!(chunk instanceof Uint8Array))
          throw new CliError("Integrity", "Invalid response stream");
        length += chunk.length;
        if (length > resource.size)
          throw new CliError("Integrity", "Downloaded reference exceeds its declared size");
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    verifyResource(bytes, resource);
    return bytes;
  } catch (cause) {
    if (cause instanceof CliError) throw cause;
    // Do not serialize fetch errors or URLs: applications may use credential-bearing proxies.
    throw new CliError("Unavailable", "Pinned reference download failed or was cancelled");
  }
}
export async function fetchReferences(
  project: string,
  sourceRoot: string,
  bundle: ReferenceBundle,
  ids: readonly string[],
  options: RetrievalOptions = {},
): Promise<{
  readonly complete: boolean;
  readonly verified: readonly string[];
  readonly missing: readonly { id: string; code: string; message: string }[];
  readonly planned: readonly string[];
  readonly bytes: number;
}> {
  const selected = resourceClosure(bundle, ids);
  const verified: string[] = [],
    planned: string[] = [];
  const missing: { id: string; code: string; message: string }[] = [];
  for (const resource of selected) {
    const path = `.mdk/reference/${resource.path}`;
    try {
      const existing = await readOptional(project, path);
      if (existing) {
        verifyResource(existing, resource);
        verified.push(resource.id);
        continue;
      }
      planned.push(resource.id);
      if (options.dryRun) continue;
      const bytes = await obtainResource(sourceRoot, bundle, resource, options);
      const rechecked = await readOptional(project, path);
      if (rechecked) verifyResource(rechecked, resource);
      else
        await applyChanges(project, [{ path, before: null, after: bytes }], {
          precondition: async () => {
            if ((await installedBundle(project)).id !== bundle.id)
              throw new CliError("Conflict", "Bundle changed during reference retrieval");
          },
        });
      verified.push(resource.id);
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      missing.push({ id: resource.id, code: error.code, message: error.message });
    }
  }
  return {
    complete: !options.dryRun && verified.length === selected.length,
    verified,
    missing,
    planned,
    bytes: selected.reduce((sum, item) => sum + item.size, 0),
  };
}
export async function showReference(
  project: string,
  bundle: ReferenceBundle,
  id: string,
): Promise<{
  readonly resource: ReferenceResource;
  readonly path: string;
  readonly content: string;
}> {
  const resource = resourceClosure(bundle, [id]).find((item) => item.id === id);
  if (!resource) throw new CliError("Unavailable", `Unknown reference: ${id}`);
  const path = `.mdk/reference/${resource.path}`;
  const bytes = await readRequired(project, path);
  verifyResource(bytes, resource);
  return { resource, path: resolve(project, path), content: bytes.toString("utf8") };
}
