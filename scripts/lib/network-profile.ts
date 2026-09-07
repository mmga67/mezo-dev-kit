function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function assertString(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultNetworkLabel(network: unknown): string {
  return isRecord(network) && typeof network.id === "string" ? network.id : "network";
}

export function assertNetworkCapabilityProfile(
  network: unknown,
  label = defaultNetworkLabel(network),
): void {
  assert(isRecord(network), `${label} must be an object`);
  const values = network.values;
  assert(isRecord(values), `${label} values must be an object`);
  assert(
    typeof values.profile === "string" && ["evm", "cosmos-evm"].includes(values.profile),
    `${label} capability profile is invalid`,
  );
  const capabilities = values.capabilities;
  assert(isRecord(capabilities), `${label} capabilities must be an object`);
  assert(capabilities.evm === true, `${label} must explicitly declare EVM capability`);
  assert(
    capabilities.evmJsonRpc === true,
    `${label} must explicitly declare EVM JSON-RPC capability`,
  );
  assert(capabilities.gasCurrency === "native", `${label} gas currency must be explicit`);
  if (values.profile === "cosmos-evm") {
    assertString(values.cosmosChainId, `${label} Cosmos chain ID`);
    const nativeCurrency = values.nativeCurrency;
    assert(isRecord(nativeCurrency), `${label} native currency must be an object`);
    assertString(nativeCurrency.cosmosEvmDenom, `${label} Cosmos EVM denomination`);
    assert(capabilities.cosmosSdk === true, `${label} must declare Cosmos SDK capability`);
    assert(capabilities.nodeCosmosRpc === true, `${label} must declare node Cosmos RPC capability`);
    assertString(capabilities.consensusEngine, `${label} consensus engine`);
    return;
  }
  assert(
    values.cosmosChainId === undefined,
    `${label} EVM profile cannot invent a Cosmos chain ID`,
  );
  const nativeCurrency = values.nativeCurrency;
  assert(
    !isRecord(nativeCurrency) || nativeCurrency.cosmosEvmDenom === undefined,
    `${label} EVM profile cannot invent a Cosmos denomination`,
  );
  for (const capability of ["cosmosSdk", "nodeCosmosRpc", "consensusEngine"]) {
    assert(
      capabilities[capability] === undefined,
      `${label} EVM profile cannot declare ${capability}`,
    );
  }
}
