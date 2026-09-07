import { describe, expect, test } from "vitest";

import {
  ChainRegistryError,
  createChainRegistry,
  getNetwork,
  isNetworkId,
  listNetworks,
} from "../src/index.ts";
import { createChainRegistryFromData } from "../src/registry.ts";
import type { GeneratedNetworkData } from "../src/generated-types.ts";

describe("Chains registry", () => {
  test("returns accepted identities with distinct EVM and Cosmos IDs", () => {
    const mezo = getNetwork("mezo-mainnet");
    const ethereum = getNetwork("ethereum-mainnet");

    expect(mezo).toMatchObject({
      profile: "cosmos-evm",
      evmChainId: 31_612n,
      cosmosChainId: "mezo_31612-1",
      supportStatus: "supported",
      reviewStatus: "accepted",
    });
    expect(ethereum).toMatchObject({
      profile: "evm",
      evmChainId: 1n,
      cosmosChainId: null,
    });
    expect(Object.hasOwn(mezo, "rpcUrl")).toBe(false);
    expect(Object.isFrozen(mezo)).toBe(true);
    expect(Object.isFrozen(mezo.nativeCurrency)).toBe(true);
  });

  test("lists only supported accepted network identities", () => {
    expect(listNetworks().map(({ id }) => id)).toEqual([
      "base-mainnet",
      "ethereum-mainnet",
      "mezo-mainnet",
      "mezo-testnet",
    ]);
    expect(createChainRegistry().listNetworks()).toHaveLength(4);
  });

  test.for([undefined, null, "", "unknown-network", 31_612])(
    "rejects invalid network identity %j",
    (networkId) => {
      expect(() => getNetwork(networkId)).toThrowError(ChainRegistryError);
    },
  );

  test("recognizes only generated stable IDs", () => {
    expect(isNetworkId("mezo-mainnet")).toBe(true);
    expect(isNetworkId("mezo_31612-1")).toBe(false);
    expect(isNetworkId(31_612n)).toBe(false);
  });

  test.for([
    { status: "candidate", supportStatus: "supported", reviewStatus: "accepted" },
    { status: "verified", supportStatus: "proposed", reviewStatus: "accepted" },
    {
      status: "verified",
      supportStatus: "supported",
      reviewStatus: "pending-qualified-review",
    },
  ] as const)(
    "does not promote $status/$supportStatus/$reviewStatus lifecycle state",
    ({ status, supportStatus, reviewStatus }) => {
      const registry = createChainRegistryFromData([
        syntheticNetwork({ status, supportStatus, reviewStatus }),
      ]);

      expect(captureError(() => registry.getNetwork("mezo-mainnet"))).toMatchObject({
        code: "UnsupportedNetworkState",
        context: { status, supportStatus, reviewStatus },
      });
      expect(registry.listNetworks()).toEqual([]);
    },
  );

  test("rejects malformed generated chain IDs", () => {
    expect(
      captureError(() =>
        createChainRegistryFromData([syntheticNetwork({ evmChainId: "not-an-integer" })]),
      ),
    ).toMatchObject({ code: "MalformedGeneratedNetwork" });
  });
});

function syntheticNetwork(overrides: Partial<GeneratedNetworkData> = {}): GeneratedNetworkData {
  return {
    id: "mezo-mainnet",
    environment: "mainnet",
    profile: "cosmos-evm",
    displayName: "Synthetic Mezo",
    evmChainId: "31612",
    cosmosChainId: "mezo_31612-1",
    nativeCurrency: {
      name: "Synthetic Bitcoin",
      symbol: "sBTC",
      decimals: 18,
      cosmosEvmDenom: "asbtc",
    },
    explorer: { name: "Synthetic Explorer", url: "https://example.invalid" },
    capabilities: {
      evm: true,
      evmJsonRpc: true,
      cosmosSdk: true,
      nodeCosmosRpc: true,
      consensusEngine: "SyntheticBFT",
      gasCurrency: "native",
    },
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    verifiedAt: "2026-01-01T00:00:00Z",
    reviewAfter: null,
    limitations: ["Synthetic test fixture."],
    ...overrides,
  };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected action to throw");
}
