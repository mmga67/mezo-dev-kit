import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { format, resolveConfig } from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = ts.createSourceFile(
  "contracts.ts",
  await readFile(resolve(root, "packages/cli/src/contracts.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
type Schema = Readonly<Record<string, unknown>>;
const definitions: Record<string, Schema> = {};

function members(nodes: ts.NodeArray<ts.TypeElement>): Schema {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const node of nodes) {
    if (!ts.isPropertySignature(node) || !node.type || !node.name || !ts.isIdentifier(node.name))
      throw new Error("Unsupported CLI schema member");
    properties[node.name.text] = ["before", "after"].includes(node.name.text)
      ? {
          anyOf: [
            { type: "null" },
            {
              type: "string",
              maxLength: 33554432,
              pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
            },
          ],
        }
      : node.name.text === "pid"
        ? { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
        : typeSchema(node.type);
    if (!node.questionToken) required.push(node.name.text);
  }
  return { type: "object", additionalProperties: false, properties, required };
}
function typeSchema(node: ts.TypeNode): Schema {
  if (node.kind === ts.SyntaxKind.StringKeyword)
    return { type: "string", minLength: 1, maxLength: 16384 };
  if (node.kind === ts.SyntaxKind.NumberKeyword)
    return { type: "integer", minimum: 0, maximum: 33554432 };
  if (ts.isTypeOperatorNode(node)) return typeSchema(node.type);
  if (ts.isArrayTypeNode(node))
    return {
      type: "array",
      maxItems: 20000,
      uniqueItems: true,
      items: typeSchema(node.elementType),
    };
  if (ts.isUnionTypeNode(node)) return { anyOf: node.types.map(typeSchema) };
  if (ts.isLiteralTypeNode(node)) {
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { type: "null" };
    if (ts.isStringLiteral(node.literal)) return { const: node.literal.text };
    if (ts.isNumericLiteral(node.literal)) return { const: Number(node.literal.text) };
  }
  if (ts.isTypeLiteralNode(node)) return members(node.members);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName))
    return { $ref: `#/$defs/${node.typeName.text}` };
  throw new Error(`Unsupported CLI schema type: ${node.getText(source)}`);
}
for (const node of source.statements) {
  if (!ts.isInterfaceDeclaration(node)) continue;
  const own = members(node.members);
  if (node.heritageClauses?.length) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const base of node.heritageClauses.flatMap((clause) => [...clause.types])) {
      const schema = definitions[base.expression.getText(source)];
      if (!schema) throw new Error("Schema base must precede derived interface");
      Object.assign(properties, schema.properties);
      if (Array.isArray(schema.required))
        for (const key of schema.required) if (typeof key === "string") required.push(key);
    }
    Object.assign(properties, own.properties);
    if (Array.isArray(own.required))
      for (const key of own.required) if (typeof key === "string") required.push(key);
    definitions[node.name.text] = { ...own, properties, required };
  } else definitions[node.name.text] = own;
}
await mkdir(resolve(root, "packages/cli/schema"), { recursive: true });
for (const [name, type] of [
  ["config", "ProjectConfig"],
  ["bundle", "ReferenceBundle"],
  ["lock", "GuidanceLock"],
  ["artifacts", "ArtifactSet"],
  ["recovery", "RecoveryJournal"],
]) {
  const path = resolve(root, `packages/cli/schema/${name}.schema.json`);
  const raw = `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", $comment: "Generated from src/contracts.ts by scripts/generate/generate-cli-schemas.ts; semantic validation belongs to the public parsers.", $ref: `#/$defs/${type}`, $defs: definitions }, null, 2)}\n`;
  const result = await format(raw, { ...(await resolveConfig(path)), parser: "json" });
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== result) throw new Error(`CLI schema drift: ${path}`);
  } else await writeFile(path, result);
}
process.stdout.write("CLI schemas match their TypeScript contracts.\n");
