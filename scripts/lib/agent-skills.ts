import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

export type SkillAudience = "contributor" | "consumer";

export interface AgentSkillCatalogEntry {
  name: string;
  audience: SkillAudience;
  path: string;
  domains: string[];
}

export interface AgentSkillCatalog {
  formatVersion: 1;
  profile: "portable-agent-skills-v1";
  skills: AgentSkillCatalogEntry[];
}

export interface ValidatedSkill {
  name: string;
  description: string;
  directory: string;
}

export interface ValidatedAgentSkills {
  catalog: AgentSkillCatalog;
  catalogPath: string;
  skills: Map<string, ValidatedSkill>;
}

const CATALOG_FILE = "agents/catalog.json";
const CONTRIBUTOR_ROOT = "agents/skills";
const CONSUMER_ROOT = "agents/consumer/skills";
const PORTABLE_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeysOnly(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  context: string,
): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new Error(`${context} contains unsupported fields: ${unsupported.join(", ")}`);
  }
}

function nonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function validateSkillName(name: string, context: string): void {
  if (name.length > 64 || !SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `${context} must be at most 64 characters of lowercase letters, digits, and single hyphens`,
    );
  }
  if (!name.startsWith("mdk-")) {
    throw new Error(`${context} must use the globally scoped mdk- prefix`);
  }
}

function expectedSourcePath(entry: AgentSkillCatalogEntry): string {
  const sourceRoot = entry.audience === "contributor" ? CONTRIBUTOR_ROOT : CONSUMER_ROOT;
  return `${sourceRoot}/${entry.name}`;
}

function resolveContained(repoRoot: string, sourcePath: string): string {
  if (isAbsolute(sourcePath)) {
    throw new Error(`Skill path must be repository-relative: ${sourcePath}`);
  }

  const resolvedRoot = resolve(repoRoot);
  const resolvedPath = resolve(resolvedRoot, sourcePath);
  const fromRoot = relative(resolvedRoot, resolvedPath);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`Skill path escapes the repository: ${sourcePath}`);
  }
  return resolvedPath;
}

function parseCatalogEntry(value: unknown, index: number): AgentSkillCatalogEntry {
  const context = `Catalog skill at index ${index}`;
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }
  ownKeysOnly(value, new Set(["name", "audience", "path", "domains"]), context);

  const name = nonEmptyString(value.name, `${context}.name`);
  validateSkillName(name, `${context}.name`);

  if (value.audience !== "contributor" && value.audience !== "consumer") {
    throw new Error(`${context}.audience must be contributor or consumer`);
  }
  const audience = value.audience;
  const path = nonEmptyString(value.path, `${context}.path`);

  if (!Array.isArray(value.domains) || value.domains.length === 0) {
    throw new Error(`${context}.domains must be a non-empty array`);
  }
  const domains = value.domains.map((domain, domainIndex) => {
    const parsed = nonEmptyString(domain, `${context}.domains[${domainIndex}]`);
    if (!DOMAIN_PATTERN.test(parsed)) {
      throw new Error(`${context}.domains[${domainIndex}] is not lowercase hyphenated text`);
    }
    return parsed;
  });
  if (new Set(domains).size !== domains.length) {
    throw new Error(`${context}.domains contains duplicates`);
  }

  return { name, audience, path, domains };
}

async function readCatalog(catalogPath: string): Promise<AgentSkillCatalog> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(catalogPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read agent skill catalog ${catalogPath}`, { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new Error("Agent skill catalog must be an object");
  }
  ownKeysOnly(
    parsed,
    new Set(["$schema", "formatVersion", "profile", "skills"]),
    "Agent skill catalog",
  );
  if (parsed.formatVersion !== 1) {
    throw new Error("Agent skill catalog formatVersion must be 1");
  }
  if (parsed.profile !== "portable-agent-skills-v1") {
    throw new Error("Agent skill catalog profile must be portable-agent-skills-v1");
  }
  if (!Array.isArray(parsed.skills)) {
    throw new Error("Agent skill catalog skills must be an array");
  }

  return {
    formatVersion: 1,
    profile: "portable-agent-skills-v1",
    skills: parsed.skills.map(parseCatalogEntry),
  };
}

function unquoteScalar(value: string): string {
  if (value.length >= 2) {
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parsePortableFrontmatter(
  source: string,
  skillFile: string,
): { fields: Map<string, string>; body: string } {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error(`${skillFile} must begin with YAML frontmatter`);
  }
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    throw new Error(`${skillFile} has unterminated YAML frontmatter`);
  }

  const fields = new Map<string, string>();
  for (const [offset, line] of lines.slice(1, closingIndex).entries()) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    if (/^\s/.test(line)) {
      continue;
    }
    const match = /^([A-Za-z0-9-]+):(?:\s*(.*))$/.exec(line);
    if (match === null) {
      throw new Error(`${skillFile}:${offset + 2} has unsupported frontmatter syntax`);
    }
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      throw new Error(`${skillFile}:${offset + 2} has incomplete frontmatter syntax`);
    }
    if (!PORTABLE_FRONTMATTER_FIELDS.has(key)) {
      throw new Error(`${skillFile} contains unsupported top-level frontmatter field: ${key}`);
    }
    if (fields.has(key)) {
      throw new Error(`${skillFile} contains duplicate frontmatter field: ${key}`);
    }
    fields.set(key, unquoteScalar(rawValue.trim()));
  }

  return {
    fields,
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim(),
  };
}

async function rejectSymlinks(directory: string): Promise<void> {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const itemPath = join(directory, item.name);
    const details = await lstat(itemPath);
    if (details.isSymbolicLink()) {
      throw new Error(`Skill sources must not contain symbolic links: ${itemPath}`);
    }
    if (details.isDirectory()) {
      await rejectSymlinks(itemPath);
    }
  }
}

export async function validateSkillDirectory(
  directory: string,
  expectedName?: string,
): Promise<ValidatedSkill> {
  const details = await lstat(directory).catch(() => undefined);
  if (details === undefined || !details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Skill source is not a regular directory: ${directory}`);
  }
  await rejectSymlinks(directory);

  const skillFile = join(directory, "SKILL.md");
  const source = await readFile(skillFile, "utf8").catch((error: unknown) => {
    throw new Error(`Skill source is missing SKILL.md: ${directory}`, { cause: error });
  });
  const { fields, body } = parsePortableFrontmatter(source, skillFile);
  const name = nonEmptyString(fields.get("name"), `${skillFile} name`);
  const description = nonEmptyString(fields.get("description"), `${skillFile} description`);
  validateSkillName(name, `${skillFile} name`);
  if (description.length > 1024) {
    throw new Error(`${skillFile} description exceeds 1024 characters`);
  }
  if (basename(directory) !== name) {
    throw new Error(`${skillFile} name ${name} does not match directory ${basename(directory)}`);
  }
  if (expectedName !== undefined && expectedName !== name) {
    throw new Error(`${skillFile} name ${name} does not match catalog name ${expectedName}`);
  }
  if (body === "") {
    throw new Error(`${skillFile} must contain instructions after frontmatter`);
  }

  return { name, description, directory };
}

async function discoverSkillDirectories(root: string): Promise<string[]> {
  const details = await lstat(root).catch(() => undefined);
  if (details === undefined) {
    return [];
  }
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`Canonical skill root is not a regular directory: ${root}`);
  }

  const discovered: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const itemPath = join(directory, item.name);
      if (item.isSymbolicLink()) {
        throw new Error(`Canonical skill roots must not contain symbolic links: ${itemPath}`);
      }
      if (item.isDirectory()) {
        await visit(itemPath);
      } else if (item.isFile() && item.name === "SKILL.md") {
        discovered.push(directory);
      }
    }
  }
  await visit(root);
  return discovered.sort();
}

export async function validateAgentSkills(
  repoRoot: string,
  catalogFile = CATALOG_FILE,
): Promise<ValidatedAgentSkills> {
  const resolvedRepoRoot = resolve(repoRoot);
  const catalogPath = resolveContained(resolvedRepoRoot, catalogFile);
  const catalog = await readCatalog(catalogPath);

  const names = new Set<string>();
  const paths = new Set<string>();
  const skills = new Map<string, ValidatedSkill>();

  for (const entry of catalog.skills) {
    if (names.has(entry.name)) {
      throw new Error(`Agent skill catalog contains duplicate name: ${entry.name}`);
    }
    if (paths.has(entry.path)) {
      throw new Error(`Agent skill catalog contains duplicate path: ${entry.path}`);
    }
    names.add(entry.name);
    paths.add(entry.path);

    const expectedPath = expectedSourcePath(entry);
    if (entry.path !== expectedPath) {
      throw new Error(
        `Catalog path for ${entry.name} must be ${expectedPath}, received ${entry.path}`,
      );
    }
    const sourceDirectory = resolveContained(resolvedRepoRoot, entry.path);
    skills.set(entry.name, await validateSkillDirectory(sourceDirectory, entry.name));
  }

  const discovered = (
    await Promise.all([
      discoverSkillDirectories(resolve(resolvedRepoRoot, CONTRIBUTOR_ROOT)),
      discoverSkillDirectories(resolve(resolvedRepoRoot, CONSUMER_ROOT)),
    ])
  ).flat();
  const catalogDirectories = new Set(
    catalog.skills.map((entry) => resolveContained(resolvedRepoRoot, entry.path)),
  );
  const unlisted = discovered.filter((directory) => !catalogDirectories.has(directory));
  const missing = [...catalogDirectories].filter((directory) => !discovered.includes(directory));
  if (unlisted.length > 0 || missing.length > 0) {
    const details = [
      ...unlisted.map((directory) => `uncataloged skill ${relative(resolvedRepoRoot, directory)}`),
      ...missing.map((directory) => `missing skill ${relative(resolvedRepoRoot, directory)}`),
    ];
    throw new Error(`Agent skill catalog coverage mismatch: ${details.join("; ")}`);
  }

  return { catalog, catalogPath, skills };
}

export async function materializeAgentSkills(options: {
  repoRoot: string;
  outputRoot: string;
  audience: SkillAudience;
}): Promise<AgentSkillCatalogEntry[]> {
  const validated = await validateAgentSkills(options.repoRoot);
  const outputRoot = resolve(options.outputRoot);
  const outputDetails = await lstat(outputRoot).catch(() => undefined);
  if (outputDetails !== undefined) {
    if (!outputDetails.isDirectory() || outputDetails.isSymbolicLink()) {
      throw new Error(`Materialization target is not a regular directory: ${outputRoot}`);
    }
    const existing = await readdir(outputRoot);
    if (existing.length > 0) {
      throw new Error(`Materialization target must be empty: ${outputRoot}`);
    }
  } else {
    await mkdir(outputRoot, { recursive: true });
  }

  const selected = validated.catalog.skills.filter((entry) => entry.audience === options.audience);
  for (const entry of selected) {
    const source = resolve(options.repoRoot, entry.path);
    const target = resolve(outputRoot, entry.name);
    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    });
    await validateSkillDirectory(target, entry.name);
  }
  return selected;
}
