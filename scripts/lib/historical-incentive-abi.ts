import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects } from "./json.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const semantic = (abi: unknown) =>
  sha(
    JSON.stringify(
      objects(abi, "ABI")
        .map((e) => JSON.stringify(canonical(e)))
        .sort(),
    ),
  );

/** Qualify a retained full ABI against accepted source/runtime evidence and its closed interval. */
export async function validateHistoricalIncentiveAbi(
  root: string,
  reference: unknown,
  deploymentValue: unknown,
  currentAbiValue: unknown,
  observedImplementation: string,
): Promise<void> {
  const deployment = object(deploymentValue, "deployment");
  const currentAbi = object(currentAbiValue, "current ABI");
  const loaded = await loadKnowledgeReference(root, reference);
  const catalog = object(loaded.document, "historical ABI catalog");
  const binding = object(loaded.value, "historical ABI binding");
  assert.equal(catalog.kind, "historical-contract-abi-bindings");
  assert.equal(catalog.reviewStatus, "accepted");
  assert.equal(binding.status, "verified-historical");
  assert.equal(binding.supportStatus, "historical");
  assert.equal(binding.reviewStatus, "accepted");
  for (const key of ["contractId", "networkId", "address"])
    assert.equal(binding[key], deployment[key], `historical ABI ${key} differs`);
  assert.equal(binding.deploymentId, deployment.id);
  const generation = object(binding.generationRange, "generation");
  assert.equal(generation.implementationAddress, observedImplementation);
  assert.notEqual(generation.effectiveUntilExclusive, null, "historical generation must be closed");
  assert(
    objects(object(deployment.proxy, "proxy").implementationHistory, "history").some((g) =>
      isDeepStrictEqual(g, generation),
    ),
    "historical ABI range differs from deployment history",
  );
  const abi = object(binding.abi, "historical ABI metadata");
  assert.equal(abi.contractId, deployment.contractId);
  assert.equal(abi.reviewStatus, "accepted");
  const artifact = await loadKnowledgeReference(root, abi.artifactReference);
  assert.equal(
    sha(await readFile(artifact.path)),
    abi.fileSha256,
    "historical ABI file digest differs",
  );
  assert.equal(
    sha(JSON.stringify(canonical(artifact.value))),
    abi.abiSha256,
    "historical ABI canonical digest differs",
  );
  assert.equal(
    semantic(artifact.value),
    abi.abiSemanticSha256,
    "historical ABI semantic digest differs",
  );
  assert.equal(objects(artifact.value, "ABI").length, abi.entryCount);
  const evidence = await loadKnowledgeReference(root, binding.evidenceReference);
  assert.equal(object(evidence.document, "evidence").reviewStatus, "accepted");
  const observation = object(evidence.value, "observation");
  assert.equal(observation.deploymentId, deployment.id);
  assert.equal(observation.networkId, deployment.networkId);
  assert.equal(
    object(observation.proxy, "historical proxy").currentImplementationAddress,
    observedImplementation,
  );
  assert.equal(
    object(object(observation.explorer, "explorer").activeContract, "active contract")
      .abiSemanticSha256,
    abi.abiSemanticSha256,
  );
  assert.equal(
    object(observation.runtime, "observed runtime").implementationCodeSha256,
    object(binding.runtime, "retained runtime").implementationCodeSha256,
  );
  assert.equal(object(observation.reproduction, "reproduction").abiDerivedFromExactBuild, true);
  // These historical fixtures exercise the preserved operational ABI, never initializers.
  const current = await loadKnowledgeReference(root, currentAbi.artifactReference);
  const operational = (value: unknown) =>
    objects(value, "ABI").filter((e) => e.name !== "initialize" && e.name !== "initializeV2");
  assert.equal(
    semantic(operational(artifact.value)),
    semantic(operational(current.value)),
    "historical and current operational ABIs differ",
  );
}
