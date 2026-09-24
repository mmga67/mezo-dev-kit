import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve, posix } from "node:path";
import {
  arrayValue,
  bundleDigest,
  digest,
  jsonText,
  parseBundle,
  record,
  safePath,
  textValue,
} from "./contracts.ts";
import type {
  ConsumerDomain,
  CapabilitySet,
  ConsumerSkill,
  PackageArtifact,
  ReferenceBundle,
  ReferenceResource,
} from "./contracts.ts";
import { fileInventory, parseJson, readRequired } from "./filesystem.ts";
import { packageManifestDigest } from "./project.ts";
import { CliError } from "./errors.ts";
import { lockedDependencyPins } from "./dependency-pins.ts";

export interface DistributionInput {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly revision: string | null;
  readonly remoteBase?: string;
}

/** Build-time projection: explicit canonical inputs, no live state or evidence renewal. */
export async function buildReferenceBundle(input: DistributionInput): Promise<ReferenceBundle> {
  const root = resolve(input.sourceRoot);
  const output = resolve(input.outputRoot);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new CliError("Conflict", "Bundle output must be empty");
  const inputs = new Map<string, string>();
  async function source(path: string): Promise<Buffer> {
    const bytes = await readRequired(root, path);
    inputs.set(path, digest(bytes));
    return bytes;
  }
  async function sourceJson(path: string): Promise<Record<string, unknown>> {
    return record(parseJson(await source(path), path), path);
  }
  const selection = await sourceJson("agents/consumer/distribution.json");
  if (selection.formatVersion !== 1)
    throw new CliError("InvalidInput", "Unsupported consumer distribution format");
  const resources: ReferenceResource[] = [];
  const contents = new Map<string, Buffer>();
  const packages: PackageArtifact[] = [];
  const domains: ConsumerDomain[] = arrayValue(selection.domains, "domains").map((value) => {
    const item = record(value, "domain");
    return {
      id: textValue(item.id, "domain"),
      packages: arrayValue(item.packages, "packages").map((value) => textValue(value, "package")),
      resources: arrayValue(item.resources, "resources").map((value) =>
        textValue(value, "resource"),
      ),
    };
  });
  const sets: CapabilitySet[] = arrayValue(selection.sets, "sets").map((value) => {
    const item = record(value, "capability set");
    return {
      id: textValue(item.id, "set ID"),
      title: textValue(item.title, "set title"),
      description: textValue(item.description, "set description"),
      domains: arrayValue(item.domains, "set domains").map((value) => textValue(value, "domain")),
    };
  });
  const exclusions: { id: string; sourcePath: string; reason: string }[] = [];
  const exclusionReason = textValue(selection.exclusionReason, "exclusion reason");
  async function addResource(
    id: string,
    sourcePath: string,
    kind: ReferenceResource["kind"],
    domain: string,
    moduleId: string | null = null,
    resourceId: string | null = null,
    recordIds: readonly string[] = [],
  ): Promise<void> {
    const bytes = await source(sourcePath);
    const isJson = sourcePath.endsWith(".json");
    const data = isJson ? record(parseJson(bytes, sourcePath), sourcePath) : null;
    const path = `references/${digest(id)}.${isJson ? "json" : "md"}`;
    resources.push({
      id,
      title: isJson
        ? `${moduleId}: ${resourceId}`
        : (/^# (.+)$/m.exec(bytes.toString("utf8"))?.[1] ?? id),
      searchTerms: isJson
        ? [...recordIds]
        : [
            ...new Set(
              bytes
                .toString("utf8")
                .toLowerCase()
                .split(/[^a-z0-9_]+/)
                .filter((word) => /^[a-z][a-z0-9_]{2,80}$/.test(word)),
            ),
          ],
      path,
      digest: digest(bytes),
      size: bytes.length,
      sourcePath,
      sourceDigest: digest(bytes),
      domains: [domain],
      requires: [],
      kind,
      moduleId,
      resourceId,
      recordIds,
      reviewAfter:
        data?.reviewAfter === null || data?.reviewAfter === undefined
          ? null
          : textValue(data.reviewAfter, "reviewAfter"),
      limitations: data
        ? arrayValue(data.limitations ?? [], "limitations").map((value) =>
            textValue(value, "limitation"),
          )
        : ["Source-alpha reference; package and protocol release limitations remain applicable."],
    });
    contents.set(path, bytes);
  }
  async function discoverPackages(directory: string): Promise<void> {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (!entry.isDirectory() || ["node_modules", "dist", "cli"].includes(entry.name)) continue;
      const child = `${directory}/${entry.name}`;
      const listing = await readdir(resolve(root, child));
      if (!listing.includes("package.json")) {
        await discoverPackages(child);
        continue;
      }
      const manifest = await sourceJson(`${child}/package.json`);
      const name = textValue(manifest.name, "package name");
      const files = await fileInventory(resolve(root, child), "dist");
      for (const file of files) inputs.set(`${child}/${file.path}`, file.digest);
      packages.push({
        name,
        version: textValue(manifest.version, "version"),
        manifestDigest: packageManifestDigest(manifest),
        files,
      });
      const domain = name.replace("@mezo-dev-kit/", "");
      domains.push({ id: domain, packages: [name], resources: [`api:${domain}`] });
      await addResource(`api:${domain}`, `${child}/REFERENCE.md`, "api", domain);
      exclusions.push({
        id: `source:${child}/README.md`.toLowerCase(),
        sourcePath: `${child}/README.md`,
        reason:
          "The package README owns source-workspace setup and release context; this corpus distributes its public API reference. Consult the exact source artifact for the full README.",
      });
    }
  }
  await discoverPackages("packages");
  const index = await sourceJson("knowledge/index.json");
  const moduleResource = arrayValue(index.resources, "knowledge resources")
    .map((value) => record(value, "resource"))
    .find((item) => item.id === "knowledge-module-catalog");
  if (!moduleResource) throw new CliError("InvalidInput", "Knowledge module catalog is missing");
  const catalog = await sourceJson(`knowledge/${safePath(moduleResource.path)}`);
  const roles = arrayValue(selection.knowledgeRoles, "knowledge roles").map((value) =>
    textValue(value, "role"),
  );
  if (roles.length !== 1 || roles[0] !== "canonical-record")
    throw new CliError("InvalidInput", "Only canonical record distribution is qualified");
  for (const value of arrayValue(catalog.modules, "modules")) {
    const module = record(value, "module");
    const moduleId = textValue(module.moduleId, "module ID");
    const modulePath = `knowledge/${safePath(module.indexPath)}`;
    const moduleIndex = await sourceJson(modulePath);
    if (moduleIndex.moduleId !== moduleId || moduleIndex.knowledgeVersion !== "0.4")
      throw new CliError("InvalidInput", "Knowledge module identity or version mismatch");
    const domain = `knowledge-${moduleId.replaceAll("/", "-")}`;
    const selected: string[] = [];
    for (const item of arrayValue(moduleIndex.resources, "module resources")) {
      const resource = record(item, "resource");
      const resourceId = textValue(resource.id, "resource ID");
      const sourcePath = posix.join(posix.dirname(modulePath), safePath(resource.path));
      const id = `knowledge:${moduleId}:${resourceId}`;
      if (resource.role !== "canonical-record") {
        exclusions.push({ id, sourcePath, reason: `${String(resource.role)}: ${exclusionReason}` });
        continue;
      }
      const recordIds = arrayValue(resource.recordIds ?? [], "record IDs").map((value) =>
        textValue(value, "record ID"),
      );
      await addResource(id, sourcePath, "knowledge", domain, moduleId, resourceId, recordIds);
      selected.push(id);
    }
    domains.push({ id: domain, packages: [], resources: selected });
  }
  for (const path of arrayValue(selection.guides, "guides").map(safePath)) {
    const id = `guide:${path.toLowerCase()}`;
    const owner = domains.find((domain) => domain.resources.includes(id));
    await addResource(id, path, "guide", owner?.id ?? "typescript");
  }
  const bySource = new Map(resources.map((item) => [item.sourcePath, item]));
  const byLogical = new Map(
    resources
      .filter((item) => item.moduleId && item.resourceId)
      .map((item) => [`${item.moduleId}:${item.resourceId}`, item.id]),
  );
  for (const [index, resource] of resources.entries()) {
    const bytes = contents.get(resource.path);
    if (!bytes) throw new CliError("Integrity", "Missing generated content");
    const requires = new Set<string>();
    let rewritten = bytes;
    if (resource.path.endsWith(".md")) {
      const markdown = bytes
        .toString("utf8")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole: string, label: string, link: string) => {
          if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(link)) return whole;
          const [local, anchor] = link.split("#");
          if (!local) return whole;
          const owner = posix.normalize(posix.join(posix.dirname(resource.sourcePath), local));
          const target = bySource.get(owner);
          if (!target)
            return `${label} (source: \`${owner}${anchor ? `#${anchor}` : ""}\`; outside this corpus)`;
          requires.add(target.id);
          return `[${label}](${posix.relative(posix.dirname(resource.path), target.path)}${anchor ? `#${anchor}` : ""})`;
        });
      rewritten = Buffer.from(markdown);
    } else {
      function references(value: unknown): void {
        if (Array.isArray(value)) {
          for (const item of value) references(item);
          return;
        }
        if (typeof value !== "object" || value === null) return;
        const obj = record(value, "reference");
        if (typeof obj.moduleId === "string" && typeof obj.resourceId === "string") {
          const match = byLogical.get(`${obj.moduleId}:${obj.resourceId}`);
          if (match) requires.add(match);
        }
        for (const item of Object.values(obj)) references(item);
      }
      references(parseJson(bytes, resource.id));
    }
    requires.delete(resource.id);
    resources[index] = {
      ...resource,
      requires: [...requires].sort(),
      digest: digest(rewritten),
      size: rewritten.length,
    };
    contents.set(resource.path, rewritten);
  }
  const skillCatalog = await sourceJson("agents/catalog.json");
  const skills: ConsumerSkill[] = [];
  for (const value of arrayValue(skillCatalog.skills, "skills")) {
    const entry = record(value, "skill");
    if (entry.audience !== "consumer") continue;
    const name = textValue(entry.name, "skill name");
    const path = safePath(entry.path);
    if (path !== `agents/consumer/skills/${name}`)
      throw new CliError("InvalidInput", "Consumer skill path mismatch");
    const allFiles = await fileInventory(root, path);
    const files = allFiles.map((file) => ({ ...file, path: file.path.slice(path.length + 1) }));
    const skillDomains = arrayValue(entry.domains, "skill domains").map((value) =>
      textValue(value, "domain"),
    );
    skills.push({ name, domains: skillDomains, files });
    for (const file of files)
      contents.set(`skills/${name}/${file.path}`, await source(`${path}/${file.path}`));
  }
  contents.set("APP_AGENTS.md", await source("agents/consumer/APP_AGENTS.template.md"));
  const starter = (await fileInventory(root, "templates/typescript")).map((file) => ({
    ...file,
    path: file.path.slice("templates/typescript/".length),
  }));
  for (const file of starter)
    contents.set(`starter/${file.path}`, await source(`templates/typescript/${file.path}`));
  const rootManifest = await sourceJson("package.json");
  const starterManifest = await sourceJson("templates/typescript/package.template.json");
  const rootTools = record(rootManifest.devDependencies, "root tooling");
  const starterTools = record(starterManifest.devDependencies, "starter tooling");
  if (
    starterManifest.packageManager !== rootManifest.packageManager ||
    ["typescript", "vitest", "@types/node"].some((name) => starterTools[name] !== rootTools[name])
  )
    throw new CliError("Incompatible", "Starter toolchain must match the root-pinned toolchain");
  await source("pnpm-lock.yaml");
  const pins = Buffer.from(jsonText(await lockedDependencyPins(root)));
  starter.push({ path: "dependency-pins.json", digest: digest(pins), size: pins.length });
  contents.set("starter/dependency-pins.json", pins);
  packages.sort((a, b) => a.name.localeCompare(b.name, "en"));
  resources.sort((a, b) => a.id.localeCompare(b.id, "en"));
  domains.sort((a, b) => a.id.localeCompare(b.id, "en"));
  skills.sort((a, b) => a.name.localeCompare(b.name, "en"));
  exclusions.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const template = contents.get("APP_AGENTS.md");
  if (!template) throw new CliError("Integrity", "Missing application instructions template");
  const base: Omit<ReferenceBundle, "id"> = {
    formatVersion: 1,
    source: {
      revision: input.revision,
      inputsDigest: digest(jsonText([...inputs].sort(([a], [b]) => a.localeCompare(b, "en")))),
    },
    packages,
    domains,
    skills,
    sets,
    template: { path: "APP_AGENTS.md", digest: digest(template), size: template.length },
    starter,
    resources,
    exclusions,
    remoteBase: input.remoteBase ?? null,
  };
  const bundle = parseBundle({ ...base, id: bundleDigest(base) });
  for (const [path, bytes] of contents) {
    const target = resolve(output, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(resolve(output, "bundle.json"), jsonText(bundle));
  await writeFile(resolve(output, "inputs.json"), jsonText(Object.fromEntries(inputs)));
  return bundle;
}
