import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeModule, loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = createHash("sha256");
for (const moduleId of ["contracts", "protocols/musd/savings"]) {
  const module = await loadKnowledgeModule(root, moduleId);
  if (module.index.status !== "verified" || module.index.reviewStatus !== "accepted")
    throw new Error(`unaccepted module '${moduleId}'`);
  digest.update(moduleId).update(await readFile(module.indexPath));
}
const check = process.argv.slice(2);
if (check.some((arg) => arg !== "--check"))
  throw new Error("usage: generate-savings-package.ts [--check]");
async function resource(moduleId: string, resourceId: string): Promise<Record<string, unknown>> {
  const loaded = await loadKnowledgeReference(root, { moduleId, resourceId });
  digest.update(`${moduleId}:${resourceId}\n`).update(await readFile(loaded.path));
  return record(loaded.document);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("expected array");
  return value as unknown[];
}
function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("expected string");
  return value;
}
function accepted(value: Record<string, unknown>): void {
  if (
    value.status !== "verified" ||
    value.reviewStatus !== "accepted" ||
    value.supportStatus !== "proposed"
  ) {
    throw new Error("Savings model must retain its accepted, verified, proposed lifecycle");
  }
}
const model = await resource("protocols/musd/savings", "musd-savings-model");
const roles = await resource("protocols/musd/savings", "musd-savings-roles");
const reconciliation = await resource("protocols/musd/savings", "musd-savings-reconciliation");
for (const owner of [model, roles, reconciliation]) accepted(owner);
const scale = string(record(model.yieldAccounting).scale);
if (!/^[1-9][0-9]*$/.test(scale)) throw new Error("invalid yield scale");
const networkId = string(array(record(model.scope).networkIds)[0]);
const savingsDeployment = await loadKnowledgeReference(root, {
  moduleId: "contracts",
  resourceId: "contract-deployments",
  recordId: `musd.savings-rate@${networkId}`,
});
digest.update(await readFile(savingsDeployment.path));
const implementationSlot = string(record(record(savingsDeployment.value).proxy).implementationSlot);
const roots: Record<string, string> = {};
for (const value of array(roles.stableReferences)) {
  const role = record(value);
  const ref = record(role.reference);
  if (ref.moduleId !== "contracts" || ref.resourceId !== "contract-deployments") continue;
  const id = string(ref.recordId);
  if (!id.endsWith(`@${networkId}`)) throw new Error("root network mismatch");
  await loadKnowledgeReference(root, ref);
  roots[string(role.id)] = id.slice(0, -(networkId.length + 1));
}
for (const role of ["savings-deployment", "musd-token", "pcv", "pools-voter"]) {
  if (!roots[role]) throw new Error(`missing root '${role}'`);
}
const profiles = await resource("contracts", "savings-dynamic-read-interfaces");
const savingsSource = await loadKnowledgeReference(root, profiles.savingsSourceReference);
const savingsSourceBytes = await readFile(savingsSource.path);
if (createHash("sha256").update(savingsSourceBytes).digest("hex") !== profiles.savingsSourceSha256)
  throw new Error("Savings source digest mismatch");
digest.update(savingsSourceBytes);
const savingsSourceDocument = record(savingsSource.document);
const savingsAbi = await loadKnowledgeReference(root, {
  moduleId: "contracts",
  resourceId: "abi.musd.savings-rate",
});
if (JSON.stringify(savingsSourceDocument.abi) !== JSON.stringify(savingsAbi.document))
  throw new Error("Savings source ABI differs from canonical ABI");
const savingsRuntime = string(savingsSourceDocument.deployed_bytecode);
if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(savingsRuntime)) throw new Error("invalid Savings runtime");
const savingsRuntimeSha256 = createHash("sha256")
  .update(Buffer.from(savingsRuntime.slice(2), "hex"))
  .digest("hex");
// Savings reader review builds a review candidate. This does not promote the proposed templates.
if (
  profiles.status !== "verified" ||
  profiles.supportStatus !== "proposed" ||
  !["pending-qualified-review", "accepted"].includes(string(profiles.reviewStatus))
) {
  throw new Error("unsupported dynamic interface lifecycle");
}
const templates: Record<string, unknown> = {};
for (const value of array(profiles.records)) {
  const profile = record(value);
  const role = string(profile.id);
  if (!["strategy", "converter", "gauge"].includes(role) || templates[role])
    throw new Error("invalid role profile");
  const ref = record(profile.sourceReference);
  const loaded = await loadKnowledgeReference(root, ref);
  const bytes = await readFile(loaded.path);
  digest.update(`${string(ref.moduleId)}:${string(ref.resourceId)}\n`).update(bytes);
  if (createHash("sha256").update(bytes).digest("hex") !== profile.sourceSha256)
    throw new Error("role source drift");
  const source = record(loaded.document);
  if (source.is_verified !== true) throw new Error("unverified explorer source");
  const code = string(source.deployed_bytecode);
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("invalid runtime code");
  const runtimeSha256 = createHash("sha256")
    .update(Buffer.from(code.slice(2), "hex"))
    .digest("hex");
  if (runtimeSha256 !== profile.runtimeSha256) throw new Error("runtime digest mismatch");
  const abi = array(source.abi).map(record);
  if (abi.length !== profile.abiEntryCount) throw new Error("full ABI count mismatch");
  const names =
    role === "strategy"
      ? ["token", "vault"]
      : role === "converter"
        ? ["musdSavingsRate", "musdToken", "maxSlippageBps"]
        : ["stakingToken", "voter", "rewardToken", "balanceOf", "totalSupply", "earned", "fees"];
  const readAbi = names.map((name) => {
    const matches = abi.filter(
      (entry) =>
        entry.type === "function" && entry.name === name && entry.stateMutability === "view",
    );
    if (matches.length !== 1) throw new Error(`missing or ambiguous read '${role}.${name}'`);
    return matches[0];
  });
  if (profile.proxy !== (role === "converter")) throw new Error("role proxy policy mismatch");
  templates[role] = { runtimeSha256, proxy: profile.proxy, readAbi };
}
if (Object.keys(templates).length !== 3) throw new Error("missing dynamic interface");
const hash = digest.digest("hex");
const output =
  `// Generated by scripts/generate-savings-package.ts. Do not edit.\n` +
  `// Canonical resources: Savings model/roles/reconciliation; Contracts dynamic interface profiles.\n` +
  `export const SAVINGS_INPUT_DIGEST = ${JSON.stringify(hash)};\n` +
  `export const SAVINGS_SCALE = ${scale}n;\n` +
  `export const SAVINGS_RUNTIME_SHA256 = ${JSON.stringify(savingsRuntimeSha256)};\n` +
  `export const SAVINGS_NETWORK = ${JSON.stringify(networkId)};\n` +
  `export const IMPLEMENTATION_SLOT = ${JSON.stringify(implementationSlot)} as const;\n` +
  `export const SAVINGS_ROOTS = ${JSON.stringify(roots, null, 2)} as const;\n` +
  `export const SAVINGS_EVIDENCE = ${JSON.stringify({ verifiedAt: model.verifiedAt, reviewAfter: model.reviewAfter, supportStatus: model.supportStatus, reviewStatus: profiles.reviewStatus }, null, 2)} as const;\n` +
  `export const SAVINGS_ROLE_TEMPLATES = ${JSON.stringify(templates, null, 2)} as const;\n`;
const path = resolve(root, "packages/protocols/musd-savings/src/model.generated.ts");
if (check.includes("--check")) {
  if ((await readFile(path, "utf8")) !== output)
    throw new Error("Savings generated inputs drifted");
} else await writeFile(path, output);
process.stdout.write(`Savings generated inputs current (${hash}).\n`);
