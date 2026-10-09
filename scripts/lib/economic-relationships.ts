import { contextCatalog, readContext } from "./context-retrieval.ts";
import { readContextFile } from "./context-files.ts";
import { object, objects, parseJson, text } from "./json.ts";
import type { KnowledgeReference } from "./knowledge-reference.ts";

export interface EconomicEndpoint {
  readonly label: string;
  readonly reference: KnowledgeReference;
}

export interface EconomicRelationship {
  readonly id: string;
  readonly name: string;
  readonly kind: "value-flow" | "position-claim" | "voting-influence" | "authority";
  readonly quantity: string;
  readonly from: EconomicEndpoint;
  readonly to: EconomicEndpoint;
  readonly accountingReference: KnowledgeReference;
  readonly qualification: "recorded-model" | "published-description" | "unqualified";
  readonly basisReferences: readonly KnowledgeReference[];
  readonly limitations: readonly string[];
}

const quantities: Readonly<Record<EconomicRelationship["kind"], readonly string[]>> = {
  "value-flow": ["asset", "collateral", "debt", "principal", "yield", "fees", "emissions"],
  "position-claim": ["receipt", "collateral-pledge"],
  "voting-influence": ["voting-power"],
  authority: ["control"],
};

function reference(value: unknown): KnowledgeReference {
  const ref = object(value, "economic reference");
  const result: KnowledgeReference = {
    moduleId: text(ref.moduleId, "reference module"),
    resourceId: text(ref.resourceId, "reference resource"),
    ...(ref.recordId === undefined ? {} : { recordId: text(ref.recordId, "reference record") }),
    ...(ref.pointer === undefined ? {} : { pointer: text(ref.pointer, "reference pointer") }),
  };
  if (!result.moduleId || !result.resourceId) throw new Error("Empty economic reference");
  return result;
}

/** Validate structure and accounting categories; source truth still needs domain review. */
export function parseEconomicRelationships(
  value: unknown,
  expectedOwner: string,
): EconomicRelationship[] {
  const document = object(value, "economic relationship collection");
  if (
    document.kind !== "economic-relationship-collection" ||
    document.schemaVersion !== 1 ||
    document.owner !== expectedOwner
  )
    throw new Error("Economic relationship owner/kind/version mismatch");
  const seen = new Set<string>();
  const records = objects(document.records, "economic relationships");
  if (!records.length) throw new Error("Empty economic relationship collection");
  return records.map((record) => {
    const id = text(record.id, "relationship ID");
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) || seen.has(id))
      throw new Error(`Invalid or duplicate economic relationship: ${id}`);
    seen.add(id);
    const kind = record.kind;
    if (
      kind !== "value-flow" &&
      kind !== "position-claim" &&
      kind !== "voting-influence" &&
      kind !== "authority"
    )
      throw new Error(`Unknown economic relationship kind: ${id}`);
    const quantity = text(record.quantity, "quantity kind");
    if (!quantities[kind].includes(quantity))
      throw new Error(`Incompatible economic quantity: ${id}`);
    const qualification = record.qualification;
    if (
      qualification !== "recorded-model" &&
      qualification !== "published-description" &&
      qualification !== "unqualified"
    )
      throw new Error(`Unknown economic qualification: ${id}`);
    const endpoint = (input: unknown): EconomicEndpoint => {
      const entry = object(input, "economic endpoint");
      const label = text(entry.label, "endpoint label");
      if (!label.trim()) throw new Error(`Empty economic endpoint: ${id}`);
      return { label, reference: reference(entry.reference) };
    };
    if (
      !Array.isArray(record.limitations) ||
      !record.limitations.every((item) => typeof item === "string" && item.trim())
    )
      throw new Error(`Invalid economic limitations: ${id}`);
    if (qualification === "unqualified" && record.limitations.length === 0)
      throw new Error(`Unqualified relationship requires an explicit gap: ${id}`);
    const basisReferences = objects(record.basisReferences, "relationship basis").map(reference);
    if (!basisReferences.length) throw new Error(`Missing economic basis: ${id}`);
    const accountingReference = reference(record.accountingReference);
    if (accountingReference.moduleId !== expectedOwner)
      throw new Error(`Accounting boundary must resolve to its owning domain: ${id}`);
    const name = text(record.name, "relationship name");
    if (!name.trim()) throw new Error(`Empty economic relationship name: ${id}`);
    return {
      id,
      name,
      kind,
      quantity,
      from: endpoint(record.from),
      to: endpoint(record.to),
      accountingReference,
      qualification,
      basisReferences,
      limitations: record.limitations,
    };
  });
}

export interface OwnedEconomicRelationships {
  readonly moduleId: string;
  readonly resourceId: string;
  readonly path: string;
  readonly status: string;
  readonly reviewStatus: string;
  readonly records: readonly EconomicRelationship[];
}

export async function loadEconomicRelationships(
  root: string,
  moduleId?: string,
): Promise<OwnedEconomicRelationships[]> {
  const result: OwnedEconomicRelationships[] = [];
  for (const entry of await contextCatalog(root, moduleId)) {
    if (entry.resource.kind !== "economic-relationship-collection") continue;
    const raw = await readContextFile(root, entry.path);
    if (raw === undefined) throw new Error(`Missing relationship collection: ${entry.path}`);
    const document = object(parseJson(raw, entry.path), "relationship collection");
    const records = parseEconomicRelationships(document, entry.moduleId);
    for (const record of records) {
      for (const ref of [
        record.from.reference,
        record.to.reference,
        record.accountingReference,
        ...record.basisReferences,
      ])
        await readContext(root, ref, { maxChars: 100 });
    }
    result.push({
      moduleId: entry.moduleId,
      resourceId: entry.resource.id,
      path: entry.path,
      status: text(document.status, "relationship status"),
      reviewStatus: text(document.reviewStatus, "relationship review"),
      records,
    });
  }
  if (!result.length) throw new Error("No indexed economic relationships");
  return result;
}

export function renderEconomicRelationships(
  collections: readonly OwnedEconomicRelationships[],
): string {
  const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = [
    "# Mezo economic relationships",
    "",
    "> Generated from domain-owned economic relationship collections. Do not edit manually.",
    "",
    "This inventory connects economic actors and quantities. It does not qualify live routes,",
    "current balances, transaction support or a profitable strategy. Each row retains its",
    "collection review state and source qualification; recorded-model rows inherit the",
    "referenced model's generation and evidence limitations. Unqualified rows are owned gaps.",
    "",
  ];
  for (const collection of collections) {
    lines.push(
      `## ${collection.moduleId}`,
      "",
      `Owner: [${collection.resourceId}](../${collection.path.replace(/^knowledge\//, "")}). Status: ${collection.status}; review: ${collection.reviewStatus}.`,
      "",
      "| Relationship | From → to | Quantity | Basis |",
      "| --- | --- | --- | --- |",
    );
    for (const record of collection.records)
      lines.push(
        `| ${cell(record.name)} | ${cell(record.from.label)} → ${cell(record.to.label)} | ${cell(record.quantity)} | ${record.qualification} |`,
      );
    lines.push(
      "",
      "Follow the owning collection for exact logical references, accounting boundaries and limitations.",
      "",
    );
  }
  return lines.join("\n");
}
