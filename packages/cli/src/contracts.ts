import { createHash } from "node:crypto";
import { CliError } from "./errors.ts";

export interface ProjectConfig {
  readonly formatVersion: 1;
  readonly domains: readonly string[];
  readonly skillsDirectory: ".agents/skills" | ".claude/skills";
  readonly references: { readonly mode: "selected" | "all" };
}
export interface FileDigest {
  readonly path: string;
  readonly digest: string;
  readonly size: number;
}
export interface PackageArtifact {
  readonly name: string;
  readonly version: string;
  readonly manifestDigest: string;
  readonly files: readonly FileDigest[];
}
export interface ReferenceResource extends FileDigest {
  readonly id: string;
  readonly title: string;
  readonly searchTerms: readonly string[];
  readonly sourcePath: string;
  readonly sourceDigest: string;
  readonly domains: readonly string[];
  readonly requires: readonly string[];
  readonly kind: "api" | "knowledge" | "guide";
  readonly moduleId: string | null;
  readonly resourceId: string | null;
  readonly recordIds: readonly string[];
  readonly reviewAfter: string | null;
  readonly limitations: readonly string[];
}
export interface ConsumerSkill {
  readonly name: string;
  readonly domains: readonly string[];
  readonly files: readonly FileDigest[];
}
export interface ConsumerDomain {
  readonly id: string;
  readonly packages: readonly string[];
  readonly resources: readonly string[];
}
/** A user-facing selection of existing package, skill and reference domains. */
export interface CapabilitySet {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly domains: readonly string[];
}
export interface ReferenceBundle {
  readonly formatVersion: 1;
  readonly id: string;
  readonly source: { readonly revision: string | null; readonly inputsDigest: string };
  readonly packages: readonly PackageArtifact[];
  readonly domains: readonly ConsumerDomain[];
  readonly skills: readonly ConsumerSkill[];
  /** Absent in older v1 bundles, which retain their original digest. */
  readonly sets?: readonly CapabilitySet[];
  readonly template: FileDigest;
  readonly starter: readonly FileDigest[];
  readonly resources: readonly ReferenceResource[];
  readonly exclusions: readonly {
    readonly id: string;
    readonly sourcePath: string;
    readonly reason: string;
  }[];
  readonly remoteBase: string | null;
}
export interface GuidanceLock {
  readonly formatVersion: 1;
  readonly bundleId: string;
  readonly config: ProjectConfig;
  readonly files: readonly FileDigest[];
}
export interface RecoveryJournal {
  readonly formatVersion: 1;
  readonly pid: number;
  readonly changes: readonly {
    readonly path: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
}
export interface PackedArtifact extends FileDigest {
  readonly name: string;
  readonly version: string;
}
export interface ArtifactSet {
  readonly formatVersion: 1;
  readonly bundleId: string;
  readonly packages: readonly PackedArtifact[];
}

export function parseArtifactSet(value: unknown): ArtifactSet {
  const obj = record(value, "artifact set");
  keys(obj, ["formatVersion", "bundleId", "packages"]);
  version(obj.formatVersion);
  const packages = arrayValue(obj.packages, "packages").map((value) => {
    const item = record(value, "artifact");
    keys(item, ["path", "size", "digest", "name", "version"]);
    const name = textValue(item.name, "package name");
    if (!/^@mezo-dev-kit\/[a-z0-9-]+$/.test(name))
      throw new CliError("InvalidInput", "Invalid MDK artifact name");
    const metadata = file(item, false);
    if (!metadata.path.endsWith(".tgz"))
      throw new CliError("InvalidInput", "Expected package tarball");
    return { ...metadata, name, version: textValue(item.version, "package version") };
  });
  unique(packages, (item) => item.name);
  unique(packages, (item) => item.path);
  return { formatVersion: 1, bundleId: hash(obj.bundleId), packages };
}

export function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Stable object ordering; array order is part of the distribution contract. */
export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return item;
    const obj = record(item, "JSON object");
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((key) => [key, obj[key]]),
    );
  });
  if (result === undefined) throw new CliError("InvalidInput", "Value is not JSON");
  return result;
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new CliError("InvalidInput", `${label} must be an object`);
  return value as Record<string, unknown>;
}

export function textValue(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 16384 ||
    value.includes("\0")
  )
    throw new CliError("InvalidInput", `${label} must be bounded nonempty text`);
  return value;
}

export function safePath(value: unknown): string {
  const path = textValue(value, "relative path");
  if (
    !/^[a-zA-Z0-9_.@/-]+$/.test(path) ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    path.includes(":")
  )
    throw new CliError("InvalidInput", "Expected a contained portable relative path");
  return path;
}

function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  optional: readonly string[] = [],
): void {
  if (
    Object.keys(value).some((key) => !allowed.includes(key) && !optional.includes(key)) ||
    allowed.some((key) => !Object.hasOwn(value, key))
  )
    throw new CliError("InvalidInput", `Expected fields: ${allowed.join(", ")}`);
}

export function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 20000)
    throw new CliError("InvalidInput", `${label} must be a bounded array`);
  return value;
}
function strings(value: unknown): string[] {
  const result = arrayValue(value, "strings").map((item) => textValue(item, "item"));
  if (new Set(result).size !== result.length)
    throw new CliError("InvalidInput", "Duplicate array entry");
  return result;
}
function hash(value: unknown): string {
  const result = textValue(value, "SHA-256 digest");
  if (!/^[a-f0-9]{64}$/.test(result)) throw new CliError("InvalidInput", "Invalid SHA-256 digest");
  return result;
}
function literal<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const choice of choices) if (value === choice) return choice;
  throw new CliError("InvalidInput", `Expected one of: ${choices.join(", ")}`);
}
function nullableText(value: unknown): string | null {
  return value === null ? null : textValue(value, "text");
}
function version(value: unknown): void {
  if (value !== 1) throw new CliError("InvalidInput", "Unsupported formatVersion");
}
function identifier(value: unknown): string {
  const id = textValue(value, "identifier");
  if (!/^[a-z0-9][a-z0-9_./:@#-]*$/.test(id))
    throw new CliError("InvalidInput", "Invalid logical identifier");
  return id;
}
function unique<T>(items: readonly T[], key: (item: T) => string): void {
  if (new Set(items.map(key)).size !== items.length)
    throw new CliError("InvalidInput", "Duplicate identity or path");
}
function file(value: unknown, strict = true): FileDigest {
  const obj = record(value, "file");
  if (strict) keys(obj, ["path", "digest", "size"]);
  if (
    typeof obj.size !== "number" ||
    !Number.isSafeInteger(obj.size) ||
    obj.size < 0 ||
    obj.size > 32 * 1024 * 1024
  )
    throw new CliError("InvalidInput", "Invalid resource size");
  return { path: safePath(obj.path), digest: hash(obj.digest), size: obj.size };
}
export function parseConfig(value: unknown): ProjectConfig {
  const obj = record(value, "config");
  keys(obj, ["formatVersion", "domains", "skillsDirectory", "references"]);
  version(obj.formatVersion);
  const references = record(obj.references, "references");
  keys(references, ["mode"]);
  const domains = strings(obj.domains).map(identifier);
  if (!domains.length) throw new CliError("InvalidInput", "Select at least one domain");
  return {
    formatVersion: 1,
    domains,
    skillsDirectory: literal(obj.skillsDirectory, [".agents/skills", ".claude/skills"]),
    references: { mode: literal(references.mode, ["selected", "all"]) },
  };
}
export function parseBundle(value: unknown): ReferenceBundle {
  const obj = record(value, "bundle");
  keys(
    obj,
    [
      "formatVersion",
      "id",
      "source",
      "packages",
      "domains",
      "skills",
      "template",
      "starter",
      "resources",
      "exclusions",
      "remoteBase",
    ],
    ["sets"],
  );
  version(obj.formatVersion);
  const source = record(obj.source, "source");
  keys(source, ["revision", "inputsDigest"]);
  const revision = nullableText(source.revision);
  if (revision !== null && !/^[a-f0-9]{40}$/.test(revision))
    throw new CliError("InvalidInput", "Invalid source revision");
  const packages = arrayValue(obj.packages, "packages").map((value) => {
    const item = record(value, "package");
    keys(item, ["name", "version", "manifestDigest", "files"]);
    const name = textValue(item.name, "package name");
    if (!/^@mezo-dev-kit\/[a-z0-9-]+$/.test(name) || name === "@mezo-dev-kit/cli")
      throw new CliError("InvalidInput", "Invalid SDK package name");
    const files = arrayValue(item.files, "files").map((value) => file(value));
    unique(files, (item) => item.path);
    if (!files.length || files.some((item) => !item.path.startsWith("dist/")))
      throw new CliError("InvalidInput", "Package identity requires built files");
    return {
      name,
      version: textValue(item.version, "version"),
      manifestDigest: hash(item.manifestDigest),
      files,
    };
  });
  unique(packages, (item) => item.name);
  const resources = arrayValue(obj.resources, "resources").map((value) => {
    const item = record(value, "resource");
    keys(item, [
      "path",
      "digest",
      "size",
      "id",
      "title",
      "searchTerms",
      "sourcePath",
      "sourceDigest",
      "domains",
      "requires",
      "kind",
      "moduleId",
      "resourceId",
      "recordIds",
      "reviewAfter",
      "limitations",
    ]);
    const metadata = file(item, false);
    if (!metadata.path.startsWith("references/"))
      throw new CliError("InvalidInput", "Reference path must start with references/");
    return {
      ...metadata,
      id: identifier(item.id),
      title: textValue(item.title, "title"),
      searchTerms: strings(item.searchTerms),
      sourcePath: safePath(item.sourcePath),
      sourceDigest: hash(item.sourceDigest),
      domains: strings(item.domains).map(identifier),
      requires: strings(item.requires).map(identifier),
      kind: literal(item.kind, ["api", "knowledge", "guide"]),
      moduleId: nullableText(item.moduleId),
      resourceId: nullableText(item.resourceId),
      recordIds: strings(item.recordIds),
      reviewAfter: nullableText(item.reviewAfter),
      limitations: strings(item.limitations),
    };
  });
  unique(resources, (item) => item.id);
  unique(resources, (item) => item.path);
  const domains = arrayValue(obj.domains, "domains").map((value) => {
    const item = record(value, "domain");
    keys(item, ["id", "packages", "resources"]);
    return {
      id: identifier(item.id),
      packages: strings(item.packages),
      resources: strings(item.resources),
    };
  });
  unique(domains, (item) => item.id);
  const skills = arrayValue(obj.skills, "skills").map((value) => {
    const item = record(value, "skill");
    keys(item, ["name", "domains", "files"]);
    const name = textValue(item.name, "skill name");
    if (!/^mdk-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      throw new CliError("InvalidInput", "Invalid skill name");
    const files = arrayValue(item.files, "files").map((value) => file(value));
    unique(files, (item) => item.path);
    if (!files.some((item) => item.path === "SKILL.md"))
      throw new CliError("InvalidInput", "Missing skill instructions");
    return { name, domains: strings(item.domains), files };
  });
  unique(skills, (item) => item.name);
  const sets =
    obj.sets === undefined
      ? undefined
      : arrayValue(obj.sets, "capability sets").map((value) => {
          const item = record(value, "capability set");
          keys(item, ["id", "title", "description", "domains"]);
          const id = identifier(item.id);
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
            throw new CliError("InvalidInput", "Invalid capability set ID");
          const selected = strings(item.domains);
          if (
            !selected.length ||
            selected.some((id) => !domains.some((domain) => domain.id === id))
          )
            throw new CliError("InvalidInput", "Unresolved capability set domain");
          return {
            id,
            title: textValue(item.title, "set title"),
            description: textValue(item.description, "set description"),
            domains: selected,
          };
        });
  if (sets) unique(sets, (item) => item.id);
  const exclusions = arrayValue(obj.exclusions, "exclusions").map((value) => {
    const item = record(value, "exclusion");
    keys(item, ["id", "sourcePath", "reason"]);
    return {
      id: identifier(item.id),
      sourcePath: safePath(item.sourcePath),
      reason: textValue(item.reason, "reason"),
    };
  });
  unique(exclusions, (item) => item.id);
  if (exclusions.some((item) => resources.some((resource) => resource.id === item.id)))
    throw new CliError("InvalidInput", "Included resource is also excluded");
  const template = file(obj.template);
  if (template.path !== "APP_AGENTS.md")
    throw new CliError("InvalidInput", "Invalid instructions template path");
  const starter = arrayValue(obj.starter, "starter files").map((value) => file(value));
  unique(starter, (item) => item.path);
  for (const resource of resources)
    if (
      resource.requires.some((id) => !resources.some((item) => item.id === id)) ||
      resource.domains.some((id) => !domains.some((item) => item.id === id))
    )
      throw new CliError("InvalidInput", "Unresolved reference dependency or domain");
  for (const domain of domains)
    if (
      domain.resources.some((id) => !resources.some((item) => item.id === id)) ||
      domain.packages.some((name) => !packages.some((item) => item.name === name))
    )
      throw new CliError("InvalidInput", "Unresolved domain resource or package");
  for (const skill of skills)
    if (
      !skill.domains.length ||
      skill.domains.some((id) => !domains.some((item) => item.id === id))
    )
      throw new CliError("InvalidInput", "Unknown skill domain");
  const remoteBase = nullableText(obj.remoteBase);
  if (remoteBase !== null) {
    const url = new URL(remoteBase);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith("/")
    )
      throw new CliError(
        "InvalidInput",
        "Reference origin must be a credential-free HTTPS directory",
      );
  }
  const result: ReferenceBundle = {
    formatVersion: 1,
    id: hash(obj.id),
    source: { revision, inputsDigest: hash(source.inputsDigest) },
    packages,
    domains,
    skills,
    ...(sets ? { sets } : {}),
    template,
    starter,
    resources,
    exclusions,
    remoteBase,
  };
  if (bundleDigest(result) !== result.id)
    throw new CliError("Integrity", "Reference bundle digest does not match its content");
  return result;
}
export function bundleDigest(bundle: Omit<ReferenceBundle, "id"> | ReferenceBundle): string {
  const {
    formatVersion,
    source,
    packages,
    domains,
    skills,
    template,
    starter,
    resources,
    exclusions,
    remoteBase,
  } = bundle;
  return digest(
    canonicalJson({
      formatVersion,
      source,
      packages,
      domains,
      skills,
      ...(bundle.sets ? { sets: bundle.sets } : {}),
      template,
      starter,
      resources,
      exclusions,
      remoteBase,
    }),
  );
}
export function parseLock(value: unknown): GuidanceLock {
  const obj = record(value, "lock");
  keys(obj, ["formatVersion", "bundleId", "config", "files"]);
  version(obj.formatVersion);
  const config = parseConfig(obj.config);
  const files = arrayValue(obj.files, "files").map((value) => file(value));
  unique(files, (item) => item.path);
  for (const item of files) {
    const skillPath = item.path.slice(config.skillsDirectory.length + 1);
    if (!(
      item.path.startsWith(".mdk/reference/") ||
      (item.path.startsWith(`${config.skillsDirectory}/`) && /^mdk-[a-z0-9-]+\/.+/.test(skillPath))
    ))
      throw new CliError("InvalidInput", "Lock claims an application-owned path");
  }
  return { formatVersion: 1, bundleId: hash(obj.bundleId), config, files };
}
