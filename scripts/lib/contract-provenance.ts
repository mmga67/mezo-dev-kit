export const CONTRACT_PROVENANCE_CLASSES = Object.freeze([
  "official-artifact-fully-verified-deployment",
  "deployed-executable-reproduction",
  "official-client-precompile-source",
  "official-deployment-repository-live-configuration",
]);

const provenanceClasses = new Set(CONTRACT_PROVENANCE_CLASSES);

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordLabel(record: unknown, property: string, fallback: string): string {
  if (!isRecord(record)) return fallback;
  const value = record[property];
  return typeof value === "string" ? value : fallback;
}

function assertUnique(values: readonly unknown[], label: string): void {
  assert(new Set(values).size === values.length, `${label} must not contain duplicates`);
}

function artifactNetworks(artifact: unknown, label: string): string[] {
  assert(isRecord(artifact), `${label} must be an object`);
  const hasNetworkId = typeof artifact.networkId === "string";
  const hasNetworkIds = Array.isArray(artifact.networkIds);
  assert(
    hasNetworkId !== hasNetworkIds,
    `${label} must declare exactly one of networkId or networkIds`,
  );
  const networks = hasNetworkId ? [artifact.networkId] : artifact.networkIds;
  assert(Array.isArray(networks), `${label} network scope must be an array`);
  assert(networks.length > 0, `${label} network scope must not be empty`);
  assert(
    networks.every((network) => typeof network === "string"),
    `${label} network scope must contain strings`,
  );
  assertUnique(networks, `${label} network scope`);
  return networks;
}

export function assertAbiProvenance(
  record: unknown,
  label = recordLabel(record, "contractId", "ABI record"),
): void {
  assert(isRecord(record), `${label} must be an object`);
  assert(
    typeof record.provenanceClass === "string" && provenanceClasses.has(record.provenanceClass),
    `${label} has an invalid provenance class`,
  );
  assert(
    Array.isArray(record.intendedNetworkIds) && record.intendedNetworkIds.length > 0,
    `${label} intended network scope must not be empty`,
  );
  assert(
    record.intendedNetworkIds.every((network) => typeof network === "string"),
    `${label} intended network scope must contain strings`,
  );
  assertUnique(record.intendedNetworkIds, `${label} intended network scope`);
  assert(
    Array.isArray(record.sourceArtifacts) && record.sourceArtifacts.length > 0,
    `${label} source artifact list must not be empty`,
  );
  if (record.provenanceClass === "official-artifact-fully-verified-deployment") {
    assert(
      record.sourceArtifacts.length >= 2,
      `${label} official-artifact class requires at least two network artifacts`,
    );
  }
  const coveredNetworks = record.sourceArtifacts.flatMap((artifact, index) =>
    artifactNetworks(artifact, `${label} source artifact ${index}`),
  );
  if (record.provenanceClass === "official-artifact-fully-verified-deployment") {
    assertUnique(coveredNetworks, `${label} source artifact network coverage`);
  }
  assert(
    [...new Set(coveredNetworks)].sort().join("\0") ===
      [...record.intendedNetworkIds].sort().join("\0"),
    `${label} source artifacts must exactly cover the intended network scope`,
  );
}

export function assertDeploymentProvenance(
  record: unknown,
  label = recordLabel(record, "id", "deployment record"),
): void {
  assert(isRecord(record), `${label} must be an object`);
  assert(
    typeof record.provenanceClass === "string" && provenanceClasses.has(record.provenanceClass),
    `${label} has an invalid provenance class`,
  );
  const evidence = record.provenanceEvidence;
  if (record.provenanceClass === "official-artifact-fully-verified-deployment") {
    assert(
      typeof record.contractType === "string" &&
        ["direct", "transparent-proxy", "erc1967-proxy"].includes(record.contractType),
      `${label} official-artifact class requires a direct or ERC-1967 proxy deployment`,
    );
    return;
  }
  if (record.provenanceClass === "deployed-executable-reproduction") {
    const reproduction = isRecord(evidence) ? evidence.reproduction : undefined;
    assert(isRecord(reproduction), `${label} reproduction evidence is required`);
    assert(
      reproduction.creationExecutableMatch === true,
      `${label} creation executable must match`,
    );
    assert(reproduction.runtimeExecutableMatch === true, `${label} runtime executable must match`);
    assert(
      reproduction.abiDerivedFromExactBuild === true,
      `${label} ABI must derive from the exact build`,
    );
    return;
  }
  if (record.provenanceClass === "official-client-precompile-source") {
    assert(
      record.contractType === "precompile",
      `${label} client-precompile class requires contractType precompile`,
    );
    const clientPrecompile = isRecord(evidence) ? evidence.clientPrecompile : undefined;
    assert(isRecord(clientPrecompile), `${label} client precompile evidence is required`);
    return;
  }
  const liveConfiguration = isRecord(evidence) ? evidence.liveConfiguration : undefined;
  assert(isRecord(liveConfiguration), `${label} live configuration evidence is required`);
  if (record.contractType === "erc1967-proxy") {
    const proxy = record.proxy;
    assert(isRecord(proxy), `${label} proxy metadata is required`);
    assert(proxy.standard === "eip-1967-uups", `${label} UUPS proxy standard is required`);
    assert(proxy.adminSlot === null, `${label} UUPS proxy must not declare an admin slot`);
    assert(proxy.adminAddress === null, `${label} UUPS proxy must not declare a proxy admin`);
  }
}
