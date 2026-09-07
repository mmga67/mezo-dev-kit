import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { object, text, type JsonObject } from "./lib/json.ts";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const validator = resolve(scriptDirectory, "validate-knowledge-structure.ts");
const fixtureRoot = await mkdtemp(join(tmpdir(), "mdk-knowledge-v0.4-"));

interface LogicalReference {
  moduleId: string;
  resourceId: string;
  recordId?: string;
}

interface FixtureResource {
  id: string;
  role: string;
  kind: string;
  path: string;
  recordIds?: string[];
  recordCollectionPointer?: string;
  generatedFrom?: LogicalReference[];
  content?: JsonObject;
  domain?: string;
}

interface FixtureModuleIndex extends JsonObject {
  resources: FixtureResource[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function envelope(id: string, kind: string, domain: string): JsonObject {
  return {
    schemaVersion: 1,
    kind,
    id,
    owner: `${domain}-owner`,
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: "2026-08-20T00:00:00Z",
    reviewAfter: "2027-02-20T00:00:00Z",
    scope: { domain },
    limitations: ["Synthetic structural-test record only."],
  };
}

async function writeResource(moduleDirectory: string, resource: FixtureResource): Promise<void> {
  const path = resolve(moduleDirectory, resource.path);
  await mkdir(dirname(path), { recursive: true });
  if (resource.role === "review" || resource.role === "generated") {
    await writeFile(path, "# Synthetic structural-test content\n", "utf8");
    return;
  }
  if (resource.role === "artifact") {
    await writeFile(
      path,
      json([{ type: "function", name: "example", inputs: [], outputs: [] }]),
      "utf8",
    );
    return;
  }
  await writeFile(
    path,
    json(
      resource.content ??
        envelope(
          `${resource.id}.content`,
          resource.kind,
          text(resource.domain, `${resource.id} domain`),
        ),
    ),
    "utf8",
  );
}

async function writeModule(
  moduleId: string,
  resources: FixtureResource[],
): Promise<{ moduleDirectory: string; index: FixtureModuleIndex }> {
  const moduleDirectory = resolve(fixtureRoot, "knowledge", moduleId);
  await mkdir(moduleDirectory, { recursive: true });
  await writeFile(resolve(moduleDirectory, "README.md"), `# ${moduleId} test module\n`, "utf8");
  for (const resource of resources)
    await writeResource(moduleDirectory, { ...resource, domain: moduleId });

  const index: FixtureModuleIndex = {
    ...envelope(moduleId, "knowledge-module-index", moduleId),
    knowledgeVersion: "0.4",
    moduleId,
    resources: resources.map(
      ({ id, role, kind, path, recordIds, recordCollectionPointer, generatedFrom }) => ({
        id,
        role,
        kind,
        path,
        ...(recordIds ? { recordIds } : {}),
        ...(recordCollectionPointer ? { recordCollectionPointer } : {}),
        ...(generatedFrom ? { generatedFrom } : {}),
      }),
    ),
    checks: [
      {
        id: "common-structure",
        type: "structural",
        command: "node scripts/validate-knowledge-structure.ts",
      },
      {
        id: "domain-semantics",
        type: "semantic",
        command: "node scripts/domain-semantic-validator.ts",
      },
    ],
  };
  await writeFile(resolve(moduleDirectory, "index.json"), json(index), "utf8");
  return { moduleDirectory, index };
}

function run(...arguments_: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [validator, "--repository-root", fixtureRoot, ...arguments_], {
    encoding: "utf8",
  });
}

try {
  await cp(
    resolve(repositoryRoot, "knowledge", "schema"),
    resolve(fixtureRoot, "knowledge", "schema"),
    {
      recursive: true,
    },
  );

  const networks = await writeModule("networks", [
    {
      id: "network-records",
      role: "canonical-record",
      kind: "network-records",
      path: "records/networks.json",
    },
    { id: "rpc-probe", role: "evidence", kind: "rpc-probe", path: "evidence/rpc-probe.json" },
    {
      id: "endpoint-catalog",
      role: "canonical-record",
      kind: "endpoint-catalog",
      path: "records/endpoints.json",
      recordIds: ["example.contract@mezo-mainnet#v2"],
      recordCollectionPointer: "/records",
      content: {
        ...envelope("endpoint-catalog", "endpoint-catalog", "networks"),
        records: [{ id: "example.contract@mezo-mainnet#v2", provider: "example" }],
      },
    },
  ]);
  await writeModule("contracts", [
    {
      id: "deployments",
      role: "canonical-record",
      kind: "deployments",
      path: "records/deployments.json",
    },
    {
      id: "example-abi",
      role: "artifact",
      kind: "contract-abi",
      path: "artifacts/example.abi.json",
    },
  ]);
  await writeModule("protocols/example", [
    { id: "model", role: "canonical-record", kind: "protocol-model", path: "records/model.json" },
    { id: "math-cases", role: "fixture", kind: "math-fixtures", path: "fixtures/math.json" },
  ]);
  const workflow = await writeModule("workflows/example", [
    {
      id: "lifecycle",
      role: "canonical-record",
      kind: "workflow-lifecycle",
      path: "records/lifecycle.json",
    },
    {
      id: "execution-trace",
      role: "evidence",
      kind: "execution-trace",
      path: "evidence/trace.json",
    },
  ]);
  await writeModule("troubleshooting", [
    { id: "issues", role: "canonical-record", kind: "issue-records", path: "records/issues.json" },
    {
      id: "unresolved-leads",
      role: "review",
      kind: "candidate-inventory",
      path: "review/candidates.md",
    },
  ]);

  const valid = run("--require-all-v0.4");
  assert(!valid.error, `could not execute the structure validator: ${valid.error?.message}`);
  assert(valid.status === 0, `five-domain fixture should pass:\n${valid.stderr}`);
  assert(
    valid.stdout.includes("5 v0.4 module(s) checked"),
    `five-domain fixture count is wrong:\n${valid.stdout}`,
  );
  const selectedEndpoint = await loadKnowledgeReference(fixtureRoot, {
    moduleId: "networks",
    resourceId: "endpoint-catalog",
    recordId: "example.contract@mezo-mainnet#v2",
  });
  assert(
    object(selectedEndpoint.value, "selected endpoint").provider === "example",
    "collection record did not resolve through its pointer",
  );

  const networkRecordPath = resolve(networks.moduleDirectory, "records", "networks.json");
  const invalidRecord = envelope("network-records.content", "network-records", "networks");
  invalidRecord.status = "invented-status";
  await writeFile(networkRecordPath, json(invalidRecord), "utf8");
  const structuralFailure = run("--module", "networks");
  assert(
    !structuralFailure.error,
    `could not execute structural failure case: ${structuralFailure.error?.message}`,
  );
  assert(structuralFailure.status === 1, "invalid common envelope should fail");
  assert(
    structuralFailure.stderr.includes(".status is not a v0.4 status"),
    "structural failure was not classified",
  );
  await writeFile(
    networkRecordPath,
    json(envelope("network-records.content", "network-records", "networks")),
    "utf8",
  );

  const generated: FixtureResource = {
    id: "generated-reference",
    role: "generated",
    kind: "human-reference",
    path: "generated/reference.md",
    generatedFrom: [{ moduleId: "networks", resourceId: "missing-resource" }],
  };
  await writeResource(workflow.moduleDirectory, { ...generated, domain: "workflows/example" });
  workflow.index.resources.push(generated);
  await writeFile(resolve(workflow.moduleDirectory, "index.json"), json(workflow.index), "utf8");
  const referenceFailure = run("--module", "workflows/example");
  assert(
    !referenceFailure.error,
    `could not execute reference failure case: ${referenceFailure.error?.message}`,
  );
  assert(referenceFailure.status === 1, "unresolved logical reference should fail");
  assert(
    referenceFailure.stderr.includes("targets unknown resource"),
    "logical-reference failure was not classified",
  );

  generated.generatedFrom = [
    {
      moduleId: "networks",
      resourceId: "network-records",
      recordId: "missing-record",
    },
  ];
  workflow.index.resources[workflow.index.resources.length - 1] = generated;
  await writeFile(resolve(workflow.moduleDirectory, "index.json"), json(workflow.index), "utf8");
  const recordReferenceFailure = run("--module", "workflows/example");
  assert(
    !recordReferenceFailure.error,
    `could not execute record-reference failure case: ${recordReferenceFailure.error?.message}`,
  );
  assert(recordReferenceFailure.status === 1, "undeclared record reference should fail");
  assert(
    recordReferenceFailure.stderr.includes("targets undeclared record 'missing-record'"),
    "record-reference failure was not classified",
  );

  process.stdout.write(
    "Knowledge structure tests passed for networks, contracts, protocols, workflows, and troubleshooting.\n",
  );
  process.stdout.write(
    "Structural and logical-reference failures were detected; named domain semantic commands were not executed.\n",
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
