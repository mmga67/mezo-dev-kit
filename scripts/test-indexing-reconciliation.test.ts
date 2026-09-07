import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { evaluateIndexingCase } from "./lib/indexing-reconciliation.ts";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

type JsonRecord = Record<string, unknown>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalPath = join(repositoryRoot, "agents", "evals", "indexing-reconciliation.json");

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

async function loadSuite(): Promise<JsonRecord> {
  return record(JSON.parse(await readFile(evalPath, "utf8")), "eval suite");
}

describe("provider-neutral indexing and reconciliation", () => {
  test("the eval suite has the bounded accepted identity", async () => {
    const suite = await loadSuite();
    expect(suite).toMatchObject({
      schemaVersion: 1,
      kind: "indexing-reconciliation-eval-set",
      id: "provider-neutral-indexing-reconciliation",
      status: "verified",
      reviewStatus: "accepted",
    });
  });

  test("every deterministic eval matches its expected observable result", async () => {
    const suite = await loadSuite();
    const cases = array(suite.cases, "eval cases");
    expect(cases.length).toBe(16);
    for (const [index, rawCase] of cases.entries()) {
      const item = record(rawCase, `eval case ${index}`);
      expect(evaluateIndexingCase(item), String(item.id)).toEqual(item.expected);
    }
  });

  test("evals distinguish absence, unknown, delayed, failed, and completed", async () => {
    const suite = await loadSuite();
    const outcomes = new Set(
      array(suite.cases, "eval cases")
        .map((value, index) => record(value, `eval case ${index}`))
        .map((item) => record(item.expected, `${String(item.id)}.expected`).outcome)
        .filter((outcome): outcome is string => typeof outcome === "string"),
    );
    expect(outcomes).toEqual(
      new Set(["absent", "unknown", "delayed", "failed", "incomplete", "completed"]),
    );
  });

  test("canonical references resolve without copying protocol facts", async () => {
    const suite = await loadSuite();
    for (const [index, value] of array(
      suite.canonicalReferences,
      "canonical references",
    ).entries()) {
      const reference = record(value, `canonical reference ${index}`);
      const resolved = await loadKnowledgeReference(repositoryRoot, reference);
      expect(resolved.resource.id).toBe(reference.resourceId);
    }
  });

  test("the suite requires neither a hosted indexer nor a database", async () => {
    const suite = await loadSuite();
    const scope = record(suite.scope, "eval scope");
    expect(scope.hostedIndexerRequired).toBe(false);
    expect(scope.databaseRequired).toBe(false);
  });

  test("unknown eval operations fail closed", () => {
    expect(() => evaluateIndexingCase({ operation: "replay-value", input: {} })).toThrow(
      "unsupported indexing eval operation 'replay-value'",
    );
  });
});
