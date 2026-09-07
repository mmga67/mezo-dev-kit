import { GENERATED_CHAINS_DATA, GENERATED_NETWORK_IDS } from "./data.generated.ts";
import { ChainRegistryError } from "./errors.ts";
import type { GeneratedNetworkData } from "./generated-types.ts";

export type NetworkId = (typeof GENERATED_NETWORK_IDS)[number];
export type NetworkProfile = "evm" | "cosmos-evm";
export type NetworkEnvironment = "mainnet" | "testnet";

export interface Network {
  readonly id: NetworkId;
  readonly environment: NetworkEnvironment;
  readonly profile: NetworkProfile;
  readonly displayName: string;
  readonly evmChainId: bigint;
  readonly cosmosChainId: string | null;
  readonly nativeCurrency: Readonly<{
    name: string;
    symbol: string;
    decimals: number;
    cosmosEvmDenom: string | null;
  }>;
  readonly explorer: Readonly<{ name: string; url: string }>;
  readonly capabilities: Readonly<{
    evm: true;
    evmJsonRpc: true;
    cosmosSdk: boolean;
    nodeCosmosRpc: boolean;
    consensusEngine: string | null;
    gasCurrency: "native";
  }>;
  readonly status: GeneratedNetworkData["status"];
  readonly supportStatus: GeneratedNetworkData["supportStatus"];
  readonly reviewStatus: GeneratedNetworkData["reviewStatus"];
  readonly verifiedAt: string | null;
  readonly reviewAfter: string | null;
  readonly limitations: readonly string[];
}

export interface ChainRegistry {
  getNetwork(networkId: unknown): Readonly<Network>;
  listNetworks(): readonly Readonly<Network>[];
}

export function createChainRegistry(): Readonly<ChainRegistry> {
  return createChainRegistryFromData(GENERATED_CHAINS_DATA.networks);
}

export function createChainRegistryFromData(
  generatedNetworks: readonly GeneratedNetworkData[],
): Readonly<ChainRegistry> {
  const networks = generatedNetworks.map(toNetwork);
  const byId = new Map(networks.map((network) => [network.id, network]));
  if (byId.size !== networks.length) {
    throw new ChainRegistryError(
      "MalformedGeneratedNetwork",
      "generated network identities are duplicated",
      { recordCount: networks.length, uniqueCount: byId.size },
    );
  }

  function getNetwork(networkId: unknown): Readonly<Network> {
    if (typeof networkId !== "string" || networkId.length === 0) {
      throw new ChainRegistryError("InvalidNetworkId", "networkId must be a non-empty string", {
        receivedType: typeof networkId,
      });
    }
    const network = byId.get(networkId as NetworkId);
    if (!network) {
      throw new ChainRegistryError("InvalidNetworkId", `unknown network '${networkId}'`, {
        networkId,
      });
    }
    assertSupported(network);
    return network;
  }

  function listNetworks(): readonly Readonly<Network>[] {
    return Object.freeze(networks.filter(isSupported));
  }

  return Object.freeze({ getNetwork, listNetworks });
}

const defaultRegistry = createChainRegistry();

export function getNetwork(networkId: unknown): Readonly<Network> {
  return defaultRegistry.getNetwork(networkId);
}

export function listNetworks(): readonly Readonly<Network>[] {
  return defaultRegistry.listNetworks();
}

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (GENERATED_NETWORK_IDS as readonly string[]).includes(value);
}

function toNetwork(value: GeneratedNetworkData): Readonly<Network> {
  let evmChainId: bigint;
  try {
    evmChainId = BigInt(value.evmChainId);
  } catch (error) {
    throw new ChainRegistryError(
      "MalformedGeneratedNetwork",
      "generated EVM chain ID is invalid",
      { networkId: value.id, evmChainId: value.evmChainId },
      { cause: error },
    );
  }
  if (evmChainId <= 0n || !isNetworkId(value.id)) {
    throw new ChainRegistryError(
      "MalformedGeneratedNetwork",
      "generated network identity is invalid",
      { networkId: value.id, evmChainId: value.evmChainId },
    );
  }
  return Object.freeze({
    ...value,
    id: value.id,
    evmChainId,
    limitations: Object.freeze([...value.limitations]),
    nativeCurrency: Object.freeze({ ...value.nativeCurrency }),
    explorer: Object.freeze({ ...value.explorer }),
    capabilities: Object.freeze({ ...value.capabilities }),
  });
}

function isSupported(network: Network): boolean {
  return (
    network.status === "verified" &&
    network.supportStatus === "supported" &&
    network.reviewStatus === "accepted"
  );
}

function assertSupported(network: Network): void {
  if (isSupported(network)) return;
  throw new ChainRegistryError(
    "UnsupportedNetworkState",
    `network '${network.id}' is not in a supported lifecycle state`,
    {
      networkId: network.id,
      status: network.status,
      supportStatus: network.supportStatus,
      reviewStatus: network.reviewStatus,
    },
  );
}
