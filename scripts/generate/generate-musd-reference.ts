import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  display,
  object,
  objects,
  parseJson,
  scalar,
  text,
  values,
  type JsonObject,
} from "../lib/json.ts";
import { loadKnowledgeModule, resolveKnowledgeResource } from "../lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checkOnly = process.argv.slice(2).includes("--check");
const unknown = process.argv.slice(2).filter((value) => value !== "--check");
if (unknown.length > 0) throw new Error(`unknown argument '${unknown[0]}'`);

function cell(value: unknown): string {
  return display(value, "table cell").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function table(headers: unknown[], rows: unknown[][]): string {
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

function rootBody(byId: ReadonlyMap<string, JsonObject>): string[] {
  const terms = required(byId, "musd-terminology");
  const components = required(byId, "musd-components");
  const model = required(byId, "musd-system-model");
  return [
    "## Inventory",
    "",
    table(
      ["Resource", "Count"],
      [
        ["Terms", values(terms.records, "terms").length],
        ["Components", values(components.records, "components").length],
        ["System claims", values(model.claims, "system claims").length],
        ["Units", values(model.units, "units").length],
        ["Parameter owners", values(model.parameters, "parameters").length],
      ],
    ),
    "",
    "## Components",
    "",
    table(
      ["Contract ID", "Name", "Group", "Stability"],
      objects(components.records, "components").map((record) => [
        scalar(record.contractId, "component contract ID"),
        scalar(record.name, "component name"),
        scalar(record.group, "component group"),
        scalar(record.stability, "component stability"),
      ]),
    ),
  ];
}

function borrowingBody(byId: ReadonlyMap<string, JsonObject>): string[] {
  const position = required(byId, "borrowing-position");
  const formulas = required(byId, "borrowing-formulas");
  const parameters = required(byId, "borrowing-parameters");
  const operations = required(byId, "borrowing-operations");
  const liquidations = required(byId, "borrowing-liquidations");
  const fixtures = required(byId, "borrowing-formula-fixtures");
  return [
    "## Inventory",
    "",
    inventoryTable([
      ["Position rules", position.records],
      ["Formulas", formulas.records],
      ["Parameters", parameters.records],
      ["Operations", operations.records],
      ["Liquidation rules", liquidations.records],
      ["Formula fixtures", fixtures.records],
    ]),
    "",
    "## Formulas",
    "",
    formulaTable(formulas.records),
    "",
    "## Operation capability state",
    "",
    "The table records the knowledge model's operation capability states. For the private direct-borrower readers and writers implemented in this checkout, use the [Borrowing SDK](../../../../../packages/protocols/musd-borrowing/README.md). Acceptance of the model does not approve those implementations for release.",
    "",
    table(
      ["Operation", "Capability support"],
      objects(operations.records, "borrowing operations").map((record) => [
        scalar(record.id, "operation ID"),
        scalar(record.support, "operation support"),
      ]),
    ),
  ];
}

function redemptionBody(byId: ReadonlyMap<string, JsonObject>): string[] {
  const model = required(byId, "redemption-model");
  const formulas = required(byId, "redemption-formulas");
  const parameters = required(byId, "redemption-parameters");
  const fixtures = required(byId, "redemption-formula-fixtures");
  return [
    "## Inventory",
    "",
    inventoryTable([
      ["Rules", model.records],
      ["Formulas", formulas.records],
      ["Parameters", parameters.records],
      ["Formula fixtures", fixtures.records],
      ["Transition scenarios", fixtures.scenarios],
    ]),
    "",
    "## Formulas",
    "",
    formulaTable(formulas.records),
    "",
    "The [Redemption SDK](../../../../../packages/protocols/musd-redemptions/README.md) provides private queue readers, hint preparation, an exact-output simulation adapter and a writer. The recorded contract entrypoint has no minimum-received parameter. The writer checks output policy before submission and reports the actual settled result; it cannot guarantee that inclusion-time output meets a preflight minimum. These implementations still require release review.",
  ];
}

interface Configuration {
  moduleId: string;
  resourceId: string;
  title: string;
  body: (byId: ReadonlyMap<string, JsonObject>) => string[];
}

const configurations: Configuration[] = [
  {
    moduleId: "protocols/musd",
    resourceId: "musd-reference",
    title: "MUSD system reference",
    body: rootBody,
  },
  {
    moduleId: "protocols/musd/borrowing",
    resourceId: "borrowing-reference",
    title: "MUSD borrowing reference",
    body: borrowingBody,
  },
  {
    moduleId: "protocols/musd/redemptions",
    resourceId: "redemption-reference",
    title: "MUSD redemption reference",
    body: redemptionBody,
  },
];

for (const configuration of configurations) {
  const module = await loadKnowledgeModule(repositoryRoot, configuration.moduleId);
  const generated = module.index.resources.find(
    (resource) => resource.id === configuration.resourceId,
  );
  if (generated?.role !== "generated")
    throw new Error(`${configuration.resourceId} generated resource is missing`);
  const outputPath = resolve(module.directory, generated.path);
  const relation = relative(module.directory, outputPath);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error(`${configuration.resourceId} output escapes its module`);

  const digest = createHash("sha256");
  digest.update(await readFile(module.indexPath));
  const byId = new Map<string, JsonObject>();
  for (const reference of objects(generated.generatedFrom, `${configuration.moduleId} inputs`)) {
    const moduleId = text(reference.moduleId, "generated reference module ID");
    const resourceId = text(reference.resourceId, "generated reference resource ID");
    const resolved = await resolveKnowledgeResource(repositoryRoot, reference);
    const bytes = await readFile(resolved.path);
    digest.update(`${moduleId}:${resourceId}\0`);
    digest.update(bytes);
    digest.update("\0");
    byId.set(resourceId, object(parseJson(bytes.toString("utf8"), resourceId), resourceId));
  }

  const inputDigest = digest.digest("hex");
  const output = [
    "<!-- Generated by scripts/generate/generate-musd-reference.ts. Do not edit. -->",
    "",
    `# ${configuration.title}`,
    "",
    "This is a deterministic projection of indexed canonical knowledge, not an independent authority.",
    "",
    `- Module: \`${configuration.moduleId}\``,
    `- Support: \`${display(module.index.supportStatus, "module support")}\``,
    `- Review: \`${display(module.index.reviewStatus, "module review")}\``,
    `- Verified: \`${display(module.index.verifiedAt, "module verification date")}\``,
    `- Review after: \`${module.index.reviewAfter === null || module.index.reviewAfter === undefined ? "change-triggered" : display(module.index.reviewAfter, "module review date")}\``,
    `- Input digest: \`sha256:${inputDigest}\``,
    "",
    ...configuration.body(byId),
    "",
  ].join("\n");

  if (checkOnly) {
    let current;
    try {
      current = await readFile(outputPath, "utf8");
    } catch {
      throw new Error(`${generated.path} is missing; run the generator without --check`);
    }
    if (current !== output)
      throw new Error(`${configuration.moduleId} generated reference drifted`);
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
  }
  process.stdout.write(`${configuration.moduleId} reference is current (${inputDigest}).\n`);
}

function required(byId: ReadonlyMap<string, JsonObject>, resourceId: string): JsonObject {
  const value = byId.get(resourceId);
  if (value === undefined) throw new Error(`required resource '${resourceId}' is missing`);
  return value;
}

function inventoryTable(entries: [string, unknown][]): string {
  return table(
    ["Resource", "Count"],
    entries.map(([label, records]) => [label, values(records, label).length]),
  );
}

function formulaTable(value: unknown): string {
  return table(
    ["ID", "Expression", "Output"],
    objects(value, "formulas").map((record) => [
      scalar(record.id, "formula ID"),
      scalar(record.expression, "formula expression"),
      record.output === undefined
        ? "See the formula's named result variables"
        : scalar(record.output, "formula output"),
    ]),
  );
}
