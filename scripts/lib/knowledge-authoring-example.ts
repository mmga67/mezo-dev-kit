import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { object, objects, parseJson, text, type JsonObject } from "./json.ts";

interface IndexedResource extends JsonObject {
  readonly id: string;
  readonly role: string;
  readonly path: string;
}

export interface KnowledgeAuthoringExample {
  readonly moduleId: string;
  readonly inputDigest: string;
  readonly generatedPath: string;
  readonly recordId: string;
  readonly displayName: string;
  readonly color: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly evidenceId: string;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function logicalReference(
  value: unknown,
  label: string,
  expected: { readonly moduleId: string; readonly resourceId: string; readonly recordId?: string },
): void {
  const reference = object(value, label);
  expect(reference.moduleId === expected.moduleId, `${label}.moduleId is inconsistent`);
  expect(reference.resourceId === expected.resourceId, `${label}.resourceId is inconsistent`);
  if (expected.recordId !== undefined) {
    expect(reference.recordId === expected.recordId, `${label}.recordId is inconsistent`);
  }
}

function indexedResource(
  index: JsonObject,
  resourceId: string,
  expectedRole: string,
): IndexedResource {
  const resource = objects(index.resources, "example index resources").find(
    (candidate) => candidate.id === resourceId,
  );
  expect(resource !== undefined, `example index is missing '${resourceId}'`);
  expect(resource.role === expectedRole, `${resourceId} must use role '${expectedRole}'`);
  return {
    ...resource,
    id: text(resource.id, `${resourceId} ID`),
    role: text(resource.role, `${resourceId} role`),
    path: text(resource.path, `${resourceId} path`),
  };
}

function resourcePath(moduleRoot: string, resource: IndexedResource): string {
  const path = resolve(moduleRoot, resource.path);
  const relation = relative(moduleRoot, path);
  expect(
    relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`),
    `${resource.id} escapes the example module`,
  );
  return path;
}

async function readJson(
  path: string,
  label: string,
): Promise<{ document: JsonObject; bytes: Buffer }> {
  const bytes = await readFile(path);
  return {
    document: object(parseJson(bytes.toString("utf8"), label), label),
    bytes,
  };
}

/**
 * Loads and semantically validates the documentation-only knowledge example.
 * The universal structure validator remains the owner of v0.4 envelope and
 * index rules; this function owns only the fixture's cross-resource rules.
 */
export async function loadKnowledgeAuthoringExample(
  moduleRoot: string,
): Promise<KnowledgeAuthoringExample> {
  const indexPath = resolve(moduleRoot, "index.json");
  const { document: index } = await readJson(indexPath, "example module index");
  const moduleId = text(index.moduleId, "example module ID");
  expect(moduleId === "synthetic/widget-catalog", "unexpected example module ID");

  const artifactResource = indexedResource(index, "synthetic-specification", "artifact");
  const sourceResource = indexedResource(index, "widget-sources", "source-catalog");
  const evidenceResource = indexedResource(index, "widget-observations", "evidence");
  const recordResource = indexedResource(index, "widget-records", "canonical-record");
  const schemaResource = indexedResource(index, "widget-record-schema", "schema");
  const generatedResource = indexedResource(index, "widget-reference", "generated");

  const artifact = await readJson(
    resourcePath(moduleRoot, artifactResource),
    "synthetic source artifact",
  );
  const sources = await readJson(resourcePath(moduleRoot, sourceResource), "source catalog");
  const evidence = await readJson(resourcePath(moduleRoot, evidenceResource), "evidence catalog");
  const records = await readJson(resourcePath(moduleRoot, recordResource), "record catalog");
  const schema = await readJson(resourcePath(moduleRoot, schemaResource), "record schema");

  expect(
    schema.document.$schema === "https://json-schema.org/draft/2020-12/schema",
    "example record schema must declare JSON Schema draft 2020-12",
  );
  const schemaComposition = objects(schema.document.allOf, "record schema allOf");
  expect(
    schemaComposition.some(
      (entry) => entry.$ref === "../../../../../knowledge/schema/v0.4/common-envelope.schema.json",
    ),
    "example record schema must compose the canonical v0.4 envelope",
  );

  const artifactWidget = object(artifact.document.widget, "synthetic source widget");
  const recordId = text(artifactWidget.id, "synthetic source widget ID");
  const displayName = text(artifactWidget.displayName, "synthetic source display name");
  const color = text(artifactWidget.color, "synthetic source color");
  const sourceRevision = text(artifact.document.revision, "synthetic source revision");
  const artifactDigest = createHash("sha256").update(artifact.bytes).digest("hex");

  const sourceRows = objects(sources.document.sources, "source catalog rows");
  expect(sourceRows.length === 1, "example source catalog must contain exactly one source");
  const source = object(sourceRows[0], "example source");
  const sourceId = text(source.id, "example source ID");
  expect(source.revision === sourceRevision, "source revision does not match its artifact");
  expect(source.sha256 === artifactDigest, "source digest does not match its artifact");
  logicalReference(source.artifactRef, "source artifact reference", {
    moduleId,
    resourceId: artifactResource.id,
  });

  const observationRows = objects(evidence.document.observations, "evidence observations");
  expect(observationRows.length === 1, "example evidence must contain exactly one observation");
  const observation = object(observationRows[0], "example observation");
  const evidenceId = text(observation.id, "example evidence ID");
  expect(observation.subjectId === recordId, "evidence subject does not match the source artifact");
  expect(observation.displayName === displayName, "evidence display name drifted from the source");
  expect(observation.color === color, "evidence color drifted from the source");
  logicalReference(observation.sourceRef, "evidence source reference", {
    moduleId,
    resourceId: sourceResource.id,
    recordId: sourceId,
  });

  const recordRows = objects(records.document.records, "canonical record rows");
  expect(recordRows.length === 1, "example record catalog must contain exactly one record");
  const record = object(recordRows[0], "example widget record");
  expect(record.id === recordId, "record ID drifted from its evidence");
  expect(record.displayName === displayName, "record display name drifted from its evidence");
  expect(record.color === color, "record color drifted from its evidence");
  logicalReference(record.sourceRef, "record source reference", {
    moduleId,
    resourceId: sourceResource.id,
    recordId: sourceId,
  });
  logicalReference(record.evidenceRef, "record evidence reference", {
    moduleId,
    resourceId: evidenceResource.id,
    recordId: evidenceId,
  });
  expect(records.document.supportStatus === "none", "synthetic records must remain unsupported");
  expect(
    records.document.reviewStatus === "pending-qualified-review",
    "synthetic records must remain pending review",
  );

  const generatedFrom = objects(generatedResource.generatedFrom, "generated inputs");
  const generatedInputIds = generatedFrom.map((reference) =>
    text(reference.resourceId, "generated input resource ID"),
  );
  expect(
    JSON.stringify(generatedInputIds) ===
      JSON.stringify([
        artifactResource.id,
        sourceResource.id,
        evidenceResource.id,
        recordResource.id,
      ]),
    "generated inputs must declare the artifact, source, evidence, and record in order",
  );

  const inputDigest = createHash("sha256")
    .update(artifact.bytes)
    .update(sources.bytes)
    .update(evidence.bytes)
    .update(records.bytes)
    .digest("hex");

  return {
    moduleId,
    inputDigest,
    generatedPath: resourcePath(moduleRoot, generatedResource),
    recordId,
    displayName,
    color,
    sourceId,
    sourceRevision,
    evidenceId,
  };
}
