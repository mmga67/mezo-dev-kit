import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  loadEconomicRelationships,
  parseEconomicRelationships,
  renderEconomicRelationships,
} from "../lib/economic-relationships.ts";

const reference = { moduleId: "synthetic", resourceId: "model" };
const relationship = {
  id: "receipt-claim",
  name: "Synthetic receipt claim",
  kind: "position-claim",
  quantity: "receipt",
  from: { label: "Principal", reference },
  to: { label: "Receipt holder", reference },
  accountingReference: reference,
  qualification: "recorded-model",
  basisReferences: [reference],
  limitations: [],
};
const collection = (record: unknown = relationship) => ({
  schemaVersion: 1,
  kind: "economic-relationship-collection",
  owner: "synthetic",
  records: [record],
});

test("economic relationships preserve receipt and principal distinctions without copying arithmetic", () => {
  const result = parseEconomicRelationships(collection(), "synthetic");
  expect(result[0]).toMatchObject({
    kind: "position-claim",
    quantity: "receipt",
    accountingReference: reference,
  });
  expect(() =>
    parseEconomicRelationships(collection({ ...relationship, quantity: "principal" }), "synthetic"),
  ).toThrow("Incompatible economic quantity");
});

test.for([
  {
    label: "asset counted as voting power",
    change: { kind: "voting-influence", quantity: "asset" },
    error: "Incompatible economic quantity",
  },
  {
    label: "missing evidence basis",
    change: { basisReferences: [] },
    error: "Missing economic basis",
  },
  {
    label: "unqualified edge with no gap",
    change: { qualification: "unqualified" },
    error: "explicit gap",
  },
  {
    label: "accounting assigned to another owner",
    change: { accountingReference: { moduleId: "other", resourceId: "model" } },
    error: "owning domain",
  },
])("rejects $label", ({ change, error }) => {
  expect(() =>
    parseEconomicRelationships(collection({ ...relationship, ...change }), "synthetic"),
  ).toThrow(error);
});

test("duplicate stable IDs fail even when endpoints differ", () => {
  expect(() =>
    parseEconomicRelationships(
      { ...collection(), records: [relationship, { ...relationship, name: "Other" }] },
      "synthetic",
    ),
  ).toThrow("duplicate");
});

test("indexed relationships reject an unresolved endpoint and allow economic cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdk-relationships-"));
  const put = async (path: string, value: unknown) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), JSON.stringify(value));
  };
  try {
    await put("knowledge/index.json", {
      knowledgeVersion: "0.4",
      moduleId: "knowledge",
      resources: [{ id: "knowledge-module-catalog", path: "modules.json" }],
    });
    await put("knowledge/modules.json", {
      modules: [{ moduleId: "synthetic", indexPath: "synthetic/index.json" }],
    });
    await put("knowledge/synthetic/index.json", {
      knowledgeVersion: "0.4",
      moduleId: "synthetic",
      resources: [
        {
          id: "model",
          role: "canonical-record",
          kind: "economic-relationship-collection",
          path: "model.json",
          recordIds: [relationship.id],
          recordCollectionPointer: "/records",
        },
      ],
    });
    const value = {
      ...collection(),
      status: "candidate",
      reviewStatus: "pending-qualified-review",
    };
    await put("knowledge/synthetic/model.json", value);
    expect(await loadEconomicRelationships(root)).toMatchObject([
      { status: "candidate", records: [relationship] },
    ]);
    await put("knowledge/synthetic/model.json", {
      ...value,
      records: [
        {
          ...relationship,
          to: { label: "Missing recipient", reference: { ...reference, recordId: "absent" } },
        },
      ],
    });
    await expect(loadEconomicRelationships(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("projection retains unqualified gaps and pending review rather than implying verification", () => {
  const records = parseEconomicRelationships(
    collection({
      ...relationship,
      qualification: "unqualified",
      limitations: ["Missing scoped evidence"],
    }),
    "synthetic",
  );
  const rendered = renderEconomicRelationships([
    {
      moduleId: "synthetic",
      resourceId: "relationships",
      path: "knowledge/synthetic/records/relationships.json",
      status: "candidate",
      reviewStatus: "pending-qualified-review",
      records,
    },
  ]);
  expect(rendered).toContain("candidate; review: pending-qualified-review");
  expect(rendered).toContain("unqualified");
  expect(rendered).toContain("Principal → Receipt holder | receipt");
});
