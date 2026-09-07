import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { object, parseJson, values, type JsonObject } from "./lib/json.ts";
import { resolveJsonPointer } from "./lib/knowledge-reference.ts";

type Report = (message: string) => void;

interface Options {
  moduleId: string | null;
  requireAll: boolean;
  repositoryRoot: string | null;
}

interface DiscoveredModule {
  path: string;
  directory: string;
  relativeIndex: string;
  legacyId: string;
  index: JsonObject;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
let repositoryRoot = resolve(scriptDirectory, "..");
let knowledgeRoot = resolve(repositoryRoot, "knowledge");
let schemaRoot = resolve(knowledgeRoot, "schema", "v0.4");
const schemaNames = [
  "common-envelope.schema.json",
  "logical-reference.schema.json",
  "module-catalog.schema.json",
  "module-index.schema.json",
];

const idPattern = /^[a-z][a-z0-9]*(?:[./-][a-z0-9]+)*$/;
const recordIdPattern = /^[a-z][a-z0-9]*(?:[./@#-][a-z0-9]+)*$/;
const localIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const kindPattern = localIdPattern;
const statuses = new Set(["candidate", "unverified", "verified", "conflicting", "superseded"]);
const supportStatuses = new Set(["none", "proposed", "supported", "historical", "deprecated"]);
const reviewStatuses = new Set([
  "unreviewed",
  "pending-architecture-review",
  "pending-qualified-review",
  "accepted",
  "rejected",
]);
const roleDirectories = new Map([
  ["canonical-record", "records"],
  ["source-catalog", "sources"],
  ["evidence", "evidence"],
  ["fixture", "fixtures"],
  ["schema", "schema"],
  ["review", "review"],
  ["artifact", "artifacts"],
  ["generated", "generated"],
]);
const checkTypes = new Set(["structural", "semantic", "generation", "drift"]);
const envelopeRoles = new Set(["canonical-record", "source-catalog", "evidence", "fixture"]);
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function usage(): void {
  process.stdout.write(`Usage: node scripts/validate-knowledge-structure.ts [options]

Options:
  --module <module-id>  Require and validate one v0.4 module
  --require-all-v0.4    Fail when any legacy module index remains
  --repository-root <path>
                        Validate another repository root (used by tests)
  --help                Show this message\n`);
}

function parseArguments(arguments_: string[]): Options {
  const options: Options = { moduleId: null, requireAll: false, repositoryRoot: null };
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === "--help") {
      usage();
      process.exit(0);
    }
    if (value === "--require-all-v0.4") {
      options.requireAll = true;
      continue;
    }
    if (value === "--module") {
      const moduleId = arguments_[index + 1];
      if (!moduleId || moduleId.startsWith("--")) throw new Error("--module requires a module ID");
      options.moduleId = moduleId;
      index += 1;
      continue;
    }
    if (value === "--repository-root") {
      const root = arguments_[index + 1];
      if (!root || root.startsWith("--")) throw new Error("--repository-root requires a path");
      options.repositoryRoot = root;
      index += 1;
      continue;
    }
    throw new Error(`unknown option '${String(value)}'`);
  }
  return options;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestampOrNull(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" &&
      timestampPattern.test(value) &&
      Number.isFinite(Date.parse(value)))
  );
}

function slashPath(path: string): string {
  return path.split(sep).join("/");
}

async function loadJson(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}

async function existsAsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function findIndexes(directory: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === resolve(knowledgeRoot, "schema")) continue;
      results.push(...(await findIndexes(path)));
    } else if (entry.isFile() && entry.name === "index.json") {
      results.push(path);
    }
  }
  return results;
}

async function findMaintainedModuleFiles(
  directory: string,
  moduleRoot = directory,
): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (path !== moduleRoot) {
        const nestedIndexPath = resolve(path, "index.json");
        if (await existsAsFile(nestedIndexPath)) {
          try {
            const nestedIndex = await loadJson(nestedIndexPath);
            if (nestedIndex.knowledgeVersion === "0.4") continue;
          } catch {
            // The normal index discovery pass reports malformed JSON. Keep
            // walking so this module cannot hide unindexed content behind it.
          }
        }
      }
      results.push(...(await findMaintainedModuleFiles(path, moduleRoot)));
    } else if (entry.isFile()) {
      results.push(path);
    }
  }
  return results;
}

function validateEnvelope(record: unknown, label: string, report: Report): void {
  if (!isObject(record)) {
    report(`${label} must be an object`);
    return;
  }
  if (
    typeof record.schemaVersion !== "number" ||
    !Number.isInteger(record.schemaVersion) ||
    record.schemaVersion < 1
  ) {
    report(`${label}.schemaVersion must be a positive integer`);
  }
  if (typeof record.kind !== "string" || !kindPattern.test(record.kind)) {
    report(`${label}.kind must be a stable lowercase kind`);
  }
  if (typeof record.id !== "string" || !idPattern.test(record.id)) {
    report(`${label}.id must be a stable lowercase ID`);
  }
  if (typeof record.owner !== "string" || record.owner.length === 0) {
    report(`${label}.owner must be a non-empty string`);
  }
  if (typeof record.status !== "string" || !statuses.has(record.status)) {
    report(`${label}.status is not a v0.4 status`);
  }
  if (typeof record.supportStatus !== "string" || !supportStatuses.has(record.supportStatus)) {
    report(`${label}.supportStatus is not a v0.4 support status`);
  }
  if (typeof record.reviewStatus !== "string" || !reviewStatuses.has(record.reviewStatus)) {
    report(`${label}.reviewStatus is not a v0.4 review status`);
  }
  if (!isTimestampOrNull(record.verifiedAt)) {
    report(`${label}.verifiedAt must be an RFC 3339 timestamp or null`);
  }
  if (!isTimestampOrNull(record.reviewAfter)) {
    report(`${label}.reviewAfter must be an RFC 3339 timestamp or null`);
  }
  if (!isObject(record.scope) || Object.keys(record.scope).length === 0) {
    report(`${label}.scope must be a non-empty object`);
  }
  if (
    !Array.isArray(record.limitations) ||
    record.limitations.some((item) => typeof item !== "string" || item.length === 0) ||
    new Set(record.limitations).size !== record.limitations.length
  ) {
    report(`${label}.limitations must contain unique non-empty strings`);
  }
}

function validateLogicalReference(reference: unknown, label: string, report: Report): boolean {
  if (!isObject(reference)) {
    report(`${label} must be an object`);
    return false;
  }
  const keys = Object.keys(reference);
  if (keys.some((key) => !["moduleId", "resourceId", "recordId", "pointer"].includes(key))) {
    report(`${label} has an unknown field`);
  }
  if (typeof reference.moduleId !== "string" || !idPattern.test(reference.moduleId)) {
    report(`${label}.moduleId is invalid`);
  }
  if (typeof reference.resourceId !== "string" || !localIdPattern.test(reference.resourceId)) {
    report(`${label}.resourceId is invalid`);
  }
  if (
    reference.recordId !== undefined &&
    (typeof reference.recordId !== "string" || !recordIdPattern.test(reference.recordId))
  ) {
    report(`${label}.recordId is invalid`);
  }
  if (
    reference.pointer !== undefined &&
    (typeof reference.pointer !== "string" || !/^(?:\/(?:[^~/]|~[01])*)*$/.test(reference.pointer))
  ) {
    report(`${label}.pointer is not an RFC 6901 JSON Pointer`);
  }
  return true;
}

async function validateSchemas(report: Report): Promise<void> {
  for (const name of schemaNames) {
    const path = resolve(schemaRoot, name);
    let schema: JsonObject;
    try {
      schema = await loadJson(path);
    } catch (error) {
      report(`knowledge/schema/v0.4/${name} cannot be parsed: ${errorMessage(error)}`);
      continue;
    }
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      report(`knowledge/schema/v0.4/${name} must declare JSON Schema draft 2020-12`);
    }
  }

  const moduleSchema = resolve(schemaRoot, "module-index.schema.json");
  const parsed = await loadJson(moduleSchema);
  for (const reference of JSON.stringify(parsed).matchAll(/"\$ref":"([^"]+)"/g)) {
    const targetReference = reference[1];
    if (targetReference === undefined) continue;
    const target = resolve(schemaRoot, targetReference);
    if (!(await existsAsFile(target))) {
      report(`module index schema reference '${targetReference}' is missing`);
    }
  }
}

async function validateModule(module: DiscoveredModule, report: Report): Promise<void> {
  const { directory, index, relativeIndex } = module;
  const label = `${relativeIndex}`;
  validateEnvelope(index, label, report);

  const indexFields = new Set([
    "schemaVersion",
    "kind",
    "id",
    "owner",
    "status",
    "supportStatus",
    "reviewStatus",
    "verifiedAt",
    "reviewAfter",
    "scope",
    "limitations",
    "knowledgeVersion",
    "moduleId",
    "resources",
    "checks",
    "extensions",
  ]);
  for (const field of Object.keys(index)) {
    if (!indexFields.has(field)) {
      report(`${label} has unknown field '${field}'; use extensions for domain metadata`);
    }
  }

  if (index.knowledgeVersion !== "0.4") report(`${label}.knowledgeVersion must be '0.4'`);
  if (index.kind !== "knowledge-module-index")
    report(`${label}.kind must be 'knowledge-module-index'`);
  if (typeof index.moduleId !== "string" || !idPattern.test(index.moduleId)) {
    report(`${label}.moduleId is invalid`);
  }
  if (index.id !== index.moduleId) report(`${label}.id must equal moduleId`);
  if (!(await existsAsFile(resolve(directory, "README.md")))) {
    report(`${label} has no README.md human entry point`);
  }

  if (!Array.isArray(index.resources)) {
    report(`${label}.resources must be an array`);
    return;
  }
  if (index.resources.length === 0) report(`${label}.resources must not be empty`);
  if (!Array.isArray(index.checks) || index.checks.length === 0) {
    report(`${label}.checks must be a non-empty array`);
  }

  const resourceIds = new Set();
  const resourcePaths = new Set();
  for (const [position, resource] of values(index.resources, `${label}.resources`).entries()) {
    const resourceLabel = `${label}.resources[${position}]`;
    if (!isObject(resource)) {
      report(`${resourceLabel} must be an object`);
      continue;
    }
    const resourceFields = new Set([
      "id",
      "role",
      "kind",
      "path",
      "recordIds",
      "recordCollectionPointer",
      "generatedFrom",
    ]);
    for (const field of Object.keys(resource)) {
      if (!resourceFields.has(field)) report(`${resourceLabel} has unknown field '${field}'`);
    }
    if (typeof resource.id !== "string" || !localIdPattern.test(resource.id)) {
      report(`${resourceLabel}.id is invalid`);
    } else if (resourceIds.has(resource.id)) {
      report(`${label} has duplicate resource ID '${resource.id}'`);
    } else {
      resourceIds.add(resource.id);
    }
    if (typeof resource.role !== "string" || !roleDirectories.has(resource.role)) {
      report(`${resourceLabel}.role is invalid`);
    }
    if (typeof resource.kind !== "string" || !kindPattern.test(resource.kind)) {
      report(`${resourceLabel}.kind is invalid`);
    }
    if (
      typeof resource.path !== "string" ||
      resource.path.length === 0 ||
      isAbsolute(resource.path)
    ) {
      report(`${resourceLabel}.path must be a relative module path`);
      continue;
    }

    const absolutePath = resolve(directory, resource.path);
    const relation = relative(directory, absolutePath);
    if (relation === "" || relation.startsWith(`..${sep}`) || relation === "..") {
      report(`${resourceLabel}.path escapes the module`);
      continue;
    }
    const normalizedPath = slashPath(relation);
    if (resourcePaths.has(normalizedPath)) {
      report(`${label} indexes '${normalizedPath}' more than once`);
    } else {
      resourcePaths.add(normalizedPath);
    }

    const role = typeof resource.role === "string" ? resource.role : "invalid";
    const expectedDirectory = roleDirectories.get(role);
    if (expectedDirectory && !normalizedPath.startsWith(`${expectedDirectory}/`)) {
      report(`${resourceLabel}.path must be under ${expectedDirectory}/ for role '${role}'`);
    }
    if (!(await existsAsFile(absolutePath))) {
      report(`${resourceLabel}.path '${normalizedPath}' is missing or is not a file`);
      continue;
    }
    let resourceDocument: JsonObject | undefined;
    if (envelopeRoles.has(role)) {
      if (extname(absolutePath) !== ".json") {
        report(`${resourceLabel} must point to JSON for role '${role}'`);
      } else {
        try {
          resourceDocument = await loadJson(absolutePath);
          validateEnvelope(resourceDocument, normalizedPath, report);
        } catch (error) {
          report(`${normalizedPath} cannot be parsed: ${errorMessage(error)}`);
        }
      }
    }
    if (resource.role === "schema" && extname(absolutePath) !== ".json") {
      report(`${resourceLabel} schema must be JSON`);
    }
    if (resource.recordIds !== undefined) {
      if (
        !Array.isArray(resource.recordIds) ||
        resource.recordIds.some((id) => typeof id !== "string" || !recordIdPattern.test(id)) ||
        new Set(resource.recordIds).size !== resource.recordIds.length
      ) {
        report(`${resourceLabel}.recordIds must contain unique stable IDs`);
      }
    }
    if (resource.recordCollectionPointer !== undefined) {
      if (
        typeof resource.recordCollectionPointer !== "string" ||
        !/^(?:\/(?:[^~/]|~[01])*)*$/.test(resource.recordCollectionPointer)
      ) {
        report(`${resourceLabel}.recordCollectionPointer is not an RFC 6901 JSON Pointer`);
      } else if (!Array.isArray(resource.recordIds) || resource.recordIds.length === 0) {
        report(`${resourceLabel}.recordCollectionPointer requires recordIds`);
      }
    }
    if (
      resourceDocument !== undefined &&
      Array.isArray(resource.recordIds) &&
      resource.recordIds.length > 0
    ) {
      if (resource.recordIds.length === 1 && resourceDocument.id === resource.recordIds[0]) {
        if (resource.recordCollectionPointer !== undefined) {
          report(`${resourceLabel}.recordCollectionPointer is unnecessary for a root record`);
        }
      } else if (typeof resource.recordCollectionPointer !== "string") {
        report(`${resourceLabel}.recordCollectionPointer is required for a record collection`);
      } else {
        try {
          const collection = resolveJsonPointer(resourceDocument, resource.recordCollectionPointer);
          if (!Array.isArray(collection)) {
            report(`${resourceLabel}.recordCollectionPointer must select an array`);
          } else {
            const recordIds = resource.recordIds;
            const collectionIds = collection.map((record) =>
              isObject(record) ? record.id : undefined,
            );
            if (
              collectionIds.length !== recordIds.length ||
              collectionIds.some((id, index) => id !== recordIds[index])
            ) {
              report(`${resourceLabel}.recordIds do not match the indexed collection`);
            }
          }
        } catch (error) {
          report(`${resourceLabel}.recordCollectionPointer cannot resolve: ${errorMessage(error)}`);
        }
      }
    }
    if (
      resource.role === "generated" &&
      (!Array.isArray(resource.generatedFrom) || resource.generatedFrom.length === 0)
    ) {
      report(`${resourceLabel}.generatedFrom is required for generated output`);
    }
    if (resource.generatedFrom !== undefined) {
      if (!Array.isArray(resource.generatedFrom) || resource.generatedFrom.length === 0) {
        report(`${resourceLabel}.generatedFrom must be a non-empty array`);
      } else {
        values(resource.generatedFrom, `${resourceLabel}.generatedFrom`).forEach(
          (reference, index) => {
            validateLogicalReference(reference, `${resourceLabel}.generatedFrom[${index}]`, report);
          },
        );
      }
    }
  }

  const controlFiles = new Set(["README.md", "index.json", "AGENTS.md"]);
  for (const path of await findMaintainedModuleFiles(directory)) {
    const normalizedPath = slashPath(relative(directory, path));
    if (controlFiles.has(normalizedPath)) continue;
    if (!resourcePaths.has(normalizedPath)) {
      report(`${label} has unindexed maintained file '${normalizedPath}'`);
    }
  }

  if (Array.isArray(index.checks)) {
    const checkIds = new Set();
    for (const [position, check] of values(index.checks, `${label}.checks`).entries()) {
      const checkLabel = `${label}.checks[${position}]`;
      if (!isObject(check)) {
        report(`${checkLabel} must be an object`);
        continue;
      }
      for (const field of Object.keys(check)) {
        if (!["id", "type", "command"].includes(field)) {
          report(`${checkLabel} has unknown field '${field}'`);
        }
      }
      if (typeof check.id !== "string" || !localIdPattern.test(check.id)) {
        report(`${checkLabel}.id is invalid`);
      } else if (checkIds.has(check.id)) {
        report(`${label} has duplicate check ID '${check.id}'`);
      } else {
        checkIds.add(check.id);
      }
      if (typeof check.type !== "string" || !checkTypes.has(check.type)) {
        report(`${checkLabel}.type is invalid`);
      }
      if (typeof check.command !== "string" || check.command.length === 0) {
        report(`${checkLabel}.command must be a non-empty string`);
      }
    }
  }

  if (index.extensions !== undefined && !isObject(index.extensions)) {
    report(`${label}.extensions must be an object`);
  }
}

function validateResolvedReferences(
  sourceModules: DiscoveredModule[],
  resolutionModules: DiscoveredModule[],
  report: Report,
): void {
  const modulesById = new Map<string, DiscoveredModule>();
  for (const module of resolutionModules) {
    if (typeof module.index.moduleId === "string") {
      modulesById.set(module.index.moduleId, module);
    }
  }
  for (const module of sourceModules) {
    if (!Array.isArray(module.index.resources)) continue;
    for (const resourceValue of values(module.index.resources, "module resources")) {
      if (!isObject(resourceValue)) continue;
      const resource = resourceValue;
      if (!Array.isArray(resource.generatedFrom)) continue;
      for (const [position, reference] of values(
        resource.generatedFrom,
        "generated references",
      ).entries()) {
        if (!isObject(reference)) continue;
        const resourceId = typeof resource.id === "string" ? resource.id : "invalid-resource";
        const label = `${module.relativeIndex}:${resourceId}.generatedFrom[${position}]`;
        if (typeof reference.moduleId !== "string") continue;
        const targetModule = modulesById.get(reference.moduleId);
        if (!targetModule) {
          report(`${label} targets unknown v0.4 module '${reference.moduleId}'`);
          continue;
        }
        if (typeof reference.resourceId !== "string") continue;
        const targetResource = Array.isArray(targetModule.index.resources)
          ? values(targetModule.index.resources, "target resources").find(
              (candidate) => isObject(candidate) && candidate.id === reference.resourceId,
            )
          : undefined;
        if (!isObject(targetResource)) {
          report(`${label} targets unknown resource '${reference.resourceId}'`);
          continue;
        }
        if (reference.recordId !== undefined) {
          if (typeof reference.recordId !== "string") continue;
          if (
            !Array.isArray(targetResource.recordIds) ||
            !targetResource.recordIds.includes(reference.recordId)
          ) {
            report(`${label} targets undeclared record '${reference.recordId}'`);
          }
        }
      }
    }
  }
}

let options: Options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  usage();
  process.exit(2);
}

if (options.repositoryRoot) {
  repositoryRoot = resolve(options.repositoryRoot);
  knowledgeRoot = resolve(repositoryRoot, "knowledge");
  schemaRoot = resolve(knowledgeRoot, "schema", "v0.4");
}

const errors: string[] = [];
const report = (message: string): void => {
  errors.push(message);
};
await validateSchemas(report);

const discovered: DiscoveredModule[] = [];
for (const path of (await findIndexes(knowledgeRoot)).sort()) {
  const relativeIndex = slashPath(relative(repositoryRoot, path));
  try {
    const index = await loadJson(path);
    discovered.push({
      path,
      directory: dirname(path),
      relativeIndex,
      legacyId: slashPath(relative(knowledgeRoot, dirname(path))),
      index,
    });
  } catch (error) {
    report(`${relativeIndex} cannot be parsed: ${errorMessage(error)}`);
  }
}

const currentModules = discovered.filter((module) => module.index.knowledgeVersion === "0.4");
const legacyModules = discovered.filter((module) => module.index.knowledgeVersion !== "0.4");
const duplicateModuleIds = new Set<string>();
const seenModuleIds = new Set<string>();
for (const module of currentModules) {
  if (typeof module.index.moduleId !== "string") continue;
  if (seenModuleIds.has(module.index.moduleId)) duplicateModuleIds.add(module.index.moduleId);
  seenModuleIds.add(module.index.moduleId);
}
for (const moduleId of duplicateModuleIds) report(`duplicate v0.4 module ID '${moduleId}'`);

let selectedModules = currentModules;
if (options.moduleId) {
  selectedModules = currentModules.filter((module) => module.index.moduleId === options.moduleId);
  if (selectedModules.length === 0) {
    const legacy = legacyModules.find((module) => module.legacyId === options.moduleId);
    report(
      legacy
        ? `module '${options.moduleId}' is still legacy and does not declare knowledgeVersion '0.4'`
        : `v0.4 module '${options.moduleId}' was not found`,
    );
  }
}

for (const module of selectedModules) await validateModule(module, report);
validateResolvedReferences(selectedModules, currentModules, report);

if (options.requireAll && legacyModules.length > 0) {
  report(`legacy modules remain: ${legacyModules.map((module) => module.legacyId).join(", ")}`);
}

if (errors.length > 0) {
  process.stderr.write(`Knowledge structure validation failed (${errors.length}):\n`);
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(
  `Knowledge structure valid: ${selectedModules.length} v0.4 module(s) checked; ${legacyModules.length} legacy module(s) remain.\n`,
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
