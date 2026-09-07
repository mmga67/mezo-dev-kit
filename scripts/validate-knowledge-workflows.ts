import { readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalPath = resolve(root, "agents/evals/knowledge-v0.4-workflows.json");
type JsonObject = Record<string, unknown>;

const suite = object(JSON.parse(await readFile(evalPath, "utf8")) as unknown, "workflow suite");
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};
const resolveRepositoryPath = (path: string, label: string): string => {
  const absolute = resolve(root, path);
  const relation = relative(root, absolute);
  assert(relation !== ".." && !relation.startsWith(`..${sep}`), `${label} escapes the repository`);
  return absolute;
};

assert(
  suite.schemaVersion === 1 && suite.kind === "knowledge-workflow-eval-set",
  "knowledge workflow eval header is invalid",
);
assert(
  Array.isArray(suite.cases) && suite.cases.length > 0,
  "knowledge workflow eval has no cases",
);
const ids = new Set<string>();
const audienceCounts = new Map<string, number>();
const referencedModules = new Set<string>();

for (const [caseIndex, itemValue] of objects(suite.cases, "workflow cases").entries()) {
  const item = object(itemValue, `workflow case ${caseIndex}`);
  const id = text(item.id, "eval case ID");
  assert(id.length > 0, "eval case ID is missing");
  assert(!ids.has(id), `duplicate eval case ${id}`);
  ids.add(id);
  const audience = text(item.audience, `${id} audience`);
  assert(
    ["human-consumer", "human-maintainer", "agent"].includes(audience),
    `${id} audience is invalid`,
  );
  audienceCounts.set(audience, (audienceCounts.get(audience) ?? 0) + 1);
  assert(typeof item.intent === "string" && item.intent.length > 0, `${id} intent is missing`);
  assert(Array.isArray(item.route) && item.route.length > 0, `${id} route is missing`);
  assert(
    Array.isArray(item.requiredOutcomes) && item.requiredOutcomes.length > 0,
    `${id} required outcomes are missing`,
  );
  assert(
    Array.isArray(item.prohibitedOutcomes) && item.prohibitedOutcomes.length > 0,
    `${id} prohibited outcomes are missing`,
  );

  const route = strings(item.route, `${id} route`);
  for (const path of route) {
    assert(
      await isFile(resolveRepositoryPath(path, `${id} route`)),
      `${id} route target '${path}' is missing`,
    );
  }
  for (const path of strings(item.excludedByDefault ?? [], `${id} exclusions`)) {
    assert(!route.includes(path), `${id} both routes and excludes '${path}'`);
    assert(
      await isFile(resolveRepositoryPath(path, `${id} exclusion`)),
      `${id} excluded target '${path}' is missing`,
    );
  }

  assert(
    Array.isArray(item.knowledgeReferences) && item.knowledgeReferences.length > 0,
    `${id} has no logical references`,
  );
  const resolvedReferences = [];
  for (const reference of objects(item.knowledgeReferences, `${id} knowledge references`)) {
    const resolved = await loadKnowledgeReference(root, reference);
    resolvedReferences.push(resolved);
    referencedModules.add(text(reference.moduleId, `${id} reference module`));
  }
  if (audience === "human-consumer" && id !== "human-discover-module") {
    assert(
      resolvedReferences.some((resolved) => resolved.resource.role === "generated"),
      `${id} does not route through a generated human reference`,
    );
  }
  if (audience === "agent") {
    assert(route.includes("knowledge/AGENTS.md"), `${id} omits scoped knowledge instructions`);
    assert(
      route.some((path) => path.startsWith("agents/skills/")),
      `${id} omits a task skill`,
    );
  }

  assert(
    Array.isArray(item.assertions) && item.assertions.length > 0,
    `${id} has no route assertions`,
  );
  for (const assertion of objects(item.assertions, `${id} assertions`)) {
    const assertionPath = text(assertion.path, `${id} assertion path`);
    const path = resolveRepositoryPath(assertionPath, `${id} assertion`);
    assert(await isFile(path), `${id} assertion target '${assertionPath}' is missing`);
    const contents = await readFile(path, "utf8");
    assert(
      Array.isArray(assertion.includes) && assertion.includes.length > 0,
      `${id} assertion phrases are missing`,
    );
    for (const phrase of strings(assertion.includes, `${id} assertion phrases`)) {
      assert(contents.includes(phrase), `${id} route target '${assertionPath}' omits '${phrase}'`);
    }
  }
}

assert((audienceCounts.get("human-consumer") ?? 0) >= 6, "human consumer coverage is incomplete");
assert(
  (audienceCounts.get("human-maintainer") ?? 0) >= 1,
  "human maintainer coverage is incomplete",
);
assert((audienceCounts.get("agent") ?? 0) >= 3, "agent coverage is incomplete");
for (const prefix of ["networks", "contracts", "protocols/", "workflows/", "troubleshooting"]) {
  assert(
    [...referencedModules].some((moduleId) => moduleId === prefix || moduleId.startsWith(prefix)),
    `eval coverage omits ${prefix}`,
  );
}

process.stdout.write(
  `Validated ${objects(suite.cases, "workflow cases").length} knowledge workflows: ${audienceCounts.get("human-consumer") ?? 0} human consumer, ${audienceCounts.get("human-maintainer") ?? 0} maintainer, and ${audienceCounts.get("agent") ?? 0} agent cases.\n`,
);

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function objects(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => object(item as unknown, `${label}[${index}]`));
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}
