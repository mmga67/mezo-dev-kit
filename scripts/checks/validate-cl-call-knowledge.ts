import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { object, objects, text, type JsonObject } from "../lib/json.ts";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";
import { loadPoolSourceBundle, selectPoolSource } from "../lib/pool-source.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(moduleId: string, resourceId: string): Promise<JsonObject> {
  return object(
    (await loadKnowledgeReference(repositoryRoot, { moduleId, resourceId })).value,
    resourceId,
  );
}

async function validateReferences(model: JsonObject): Promise<void> {
  if (
    model.supportStatus !== "none" ||
    !["pending-qualified-review", "accepted"].includes(text(model.reviewStatus, "call review"))
  ) {
    throw new Error("CL explanatory knowledge must preserve the separate writer/review boundary");
  }
  for (const reference of objects(model.workflowReferences, "workflow references")) {
    await loadKnowledgeReference(repositoryRoot, reference);
  }
}

const positions = await load("protocols/pools", "pools-cl-position-calls");
const claims = await load("protocols/incentives", "incentives-cl-claims");
await validateReferences(positions);
await validateReferences(claims);
const mint = object(positions.mint, "mint semantics");
const mintAbi = objects(
  (await loadKnowledgeReference(repositoryRoot, mint.abiReference)).value,
  "position ABI",
);
const mintFunction = mintAbi.find(
  (entry) => entry.type === "function" && entry.name === mint.functionName,
);
const parameter = object(mint.parameter, "mint parameter");
const tuple = objects(mintFunction?.inputs, "mint inputs")[0];
const components = objects(tuple?.components, "mint tuple");
if (!components.some((entry) => entry.name === parameter.name && entry.type === parameter.type)) {
  throw new Error("mint parameter semantics no longer match the canonical ABI");
}
for (const key of ["zero", "nonzero", "existingPool", "inputs"]) text(mint[key], `mint.${key}`);
const positionSource = selectPoolSource(
  await loadPoolSourceBundle(repositoryRoot, text(mint.contractId, "position contract ID")),
);
const factorySource = selectPoolSource(
  await loadPoolSourceBundle(repositoryRoot, "mezo-earn.cl-factory"),
);
// Source equality pins the complete implementation. These checks also bind the
// explanatory branches to their ABI parameter and the retained source locators.
if (
  !positionSource.includes("if (params.sqrtPriceX96 != 0)") ||
  !factorySource.includes("require(getPool[token0][token1][tickSpacing] == address(0))")
) {
  throw new Error("review the CL mint branch semantics against changed source");
}

const claimAbi = objects(
  (await loadKnowledgeReference(repositoryRoot, claims.abiReference)).value,
  "CL gauge ABI",
);
const gaugeSource = selectPoolSource(
  await loadPoolSourceBundle(repositoryRoot, text(claims.contractId, "gauge contract ID")),
);
const calls = objects(claims.calls, "CL claim overloads");
if (calls.length !== 2 || new Set(calls.map((call) => call.inputType)).size !== 2) {
  throw new Error("CL claims must distinguish both overloads");
}
for (const call of calls) {
  const inputType = text(call.inputType, "claim input type");
  const signature = text(call.signature, "claim signature");
  if (
    signature !== `getReward(${inputType})` ||
    !claimAbi.some((entry) => {
      if (entry.type !== "function" || entry.name !== "getReward") return false;
      const inputs = objects(entry.inputs, "claim inputs");
      return inputs.length === 1 && inputs[0]?.type === inputType;
    })
  )
    throw new Error(`claim signature ${signature} does not match the canonical ABI`);
  const start = gaugeSource.indexOf(`function getReward(${inputType} `);
  const end = gaugeSource.indexOf("\n    }", start);
  const body = gaugeSource.slice(start, end);
  const authorization = text(call.authorization, "claim authorization");
  const reason = text(call.revertReason, "claim revert reason");
  if (start < 0 || end < 0 || !body.includes(`require(${authorization}, "${reason}")`)) {
    throw new Error(`claim authorization does not match ${signature}`);
  }
  for (const key of ["caller", "recipient", "coverage"]) text(call[key], `claim.${key}`);
}
text(claims.settlement, "claim settlement");
for (const model of [mint, claims]) {
  for (const evidence of objects(model.evidence, "source evidence")) {
    const reference = object(evidence.sourceReference, "source reference");
    const resolved = await loadKnowledgeReference(repositoryRoot, reference);
    if (resolved.resource.role !== "artifact")
      throw new Error("call evidence must resolve to source artifacts");
    text(evidence.locator, "source locator");
  }
}
process.stdout.write(
  "Validated CL mint/claim ABI, source branches, authorization, references and writer boundaries.\n",
);
