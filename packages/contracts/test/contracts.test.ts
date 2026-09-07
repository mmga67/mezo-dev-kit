import { describe, expect, test } from "vitest";

import {
  ContractRegistryError,
  createContractRegistry,
  isContractId,
  listContractIds,
  resolveContract,
} from "../src/index.ts";
import { createContractRegistryFromData } from "../src/registry.ts";
import type {
  GeneratedAbiData,
  GeneratedContractsData,
  GeneratedDeploymentData,
} from "../src/generated-types.ts";
import type { ContractId } from "../src/index.ts";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const OLD_IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
const CURRENT_IMPLEMENTATION = "0x3333333333333333333333333333333333333333";

describe("Contracts registry", () => {
  test("resolves an accepted current deployment and read-only ABI at one coordinate", () => {
    const resolved = resolveContract({
      contractId: "musd.savings-rate",
      networkId: "mezo-mainnet",
      blockNumber: 12_000_000n,
    });

    expect(resolved.contractId).toBe("musd.savings-rate");
    expect(resolved.networkId).toBe("mezo-mainnet");
    expect(resolved.blockNumber).toBe(12_000_000n);
    expect(resolved.address).toMatch(/^0x[a-f0-9]{40}$/);
    expect(resolved.implementationAddress).toMatch(/^0x[a-f0-9]{40}$/);
    expect(resolved.readAbi.length).toBeGreaterThan(0);
    expect(resolved.abi.readEntryCount).toBe(resolved.readAbi.length);
    expect(resolved.evidence).toMatchObject({
      deploymentCatalogVerifiedAt: "2026-08-27T14:24:36.881Z",
      deploymentCatalogReviewAfter: "2026-09-22T00:00:00Z",
      abiCatalogVerifiedAt: "2026-08-27T14:24:36.881Z",
      abiCatalogReviewAfter: "2026-09-22T00:00:00Z",
    });
    expect(Object.isFrozen(resolved.readAbi)).toBe(true);
  });

  test("never exposes state-changing function entries from canonical ABIs", () => {
    const registry = createContractRegistry();
    for (const contractId of registry.listContractIds()) {
      const resolved = latestMainnetResolution(registry, contractId);
      if (!resolved) continue;
      for (const entry of resolved.readAbi) {
        if (entry.type === "function") {
          expect(["view", "pure"]).toContain(entry.stateMutability);
        } else {
          expect(["event", "error"]).toContain(entry.type);
        }
      }
    }
  });

  test("exports stable generated contract IDs without accepting arbitrary strings", () => {
    expect(listContractIds()).toContain("lending.morpho");
    expect(isContractId("vaults.usdc-lending-wrapper")).toBe(true);
    expect(isContractId("unreviewed.contract")).toBe(false);
    expect(
      captureError(() =>
        resolveContract({
          contractId: "unreviewed.contract" as ContractId,
          networkId: "mezo-mainnet",
          blockNumber: 12_000_000n,
        }),
      ),
    ).toMatchObject({ code: "UnknownContractId" });
  });

  test.for([
    { status: "verified-superseded", supportStatus: "historical", reviewStatus: "accepted" },
    { status: "verified-current", supportStatus: "proposed", reviewStatus: "accepted" },
    {
      status: "verified-current",
      supportStatus: "supported",
      reviewStatus: "pending-qualified-review",
    },
  ] as const)(
    "does not promote $status/$supportStatus/$reviewStatus deployment state",
    ({ status, supportStatus, reviewStatus }) => {
      const registry = createContractRegistryFromData(
        syntheticData({ deployment: { status, supportStatus, reviewStatus } }),
      );

      const error = captureError(() => registry.resolve(syntheticRequest(15n)));
      expect(error).toMatchObject({ code: "UnsupportedDeploymentState" });
      expect(error).toHaveProperty(
        "context.candidates",
        expect.arrayContaining([expect.objectContaining({ status, supportStatus, reviewStatus })]),
      );
    },
  );

  test("refuses to apply the current ABI to a historical proxy generation", () => {
    const registry = createContractRegistryFromData(syntheticData({ proxy: true }));

    expect(captureError(() => registry.resolve(syntheticRequest(5n)))).toMatchObject({
      code: "HistoricalGenerationUnsupported",
      context: { implementationAddress: OLD_IMPLEMENTATION },
    });
    expect(registry.resolve(syntheticRequest(15n)).implementationAddress).toBe(
      CURRENT_IMPLEMENTATION,
    );
  });

  test("fails closed on overlapping supported deployments", () => {
    const data = syntheticData();
    const registry = createContractRegistryFromData({
      ...data,
      deployments: [data.deployments[0]!, { ...data.deployments[0]!, id: "overlap" }],
    });

    expect(captureError(() => registry.resolve(syntheticRequest(15n)))).toMatchObject({
      code: "OverlappingDeployments",
    });
  });

  test("uses inclusive deployment starts and exclusive deployment ends", () => {
    const registry = createContractRegistryFromData(
      syntheticData({
        deployment: {
          deploymentFromBlock: "10",
          currentCodeFromBlock: "10",
          effectiveUntilExclusiveBlock: "20",
        },
      }),
    );

    expect(captureError(() => registry.resolve(syntheticRequest(9n)))).toMatchObject({
      code: "MissingDeployment",
    });
    expect(registry.resolve(syntheticRequest(10n)).deploymentFromBlock).toBe(10n);
    expect(registry.resolve(syntheticRequest(19n)).blockNumber).toBe(19n);
    expect(captureError(() => registry.resolve(syntheticRequest(20n)))).toMatchObject({
      code: "MissingDeployment",
    });
  });

  test("keeps absent, unsupported, and wrong-network ABIs unavailable", () => {
    const missing = createContractRegistryFromData({
      ...syntheticData(),
      abis: [],
    });
    expect(captureError(() => missing.resolve(syntheticRequest(15n)))).toMatchObject({
      code: "AbiUnavailable",
    });

    const unsupported = createContractRegistryFromData(
      syntheticData({ abi: { supportStatus: "proposed" } }),
    );
    expect(captureError(() => unsupported.resolve(syntheticRequest(15n)))).toMatchObject({
      code: "AbiUnavailable",
    });

    const wrongNetwork = createContractRegistryFromData(
      syntheticData({ abi: { intendedNetworkIds: ["mezo-testnet"] } }),
    );
    expect(captureError(() => wrongNetwork.resolve(syntheticRequest(15n)))).toMatchObject({
      code: "AbiUnavailable",
    });
  });

  test.for([
    { label: "negative bigint", blockNumber: -1n },
    { label: "number", blockNumber: 1 },
    { label: "string", blockNumber: "1" },
    { label: "null", blockNumber: null },
  ])("rejects invalid $label block coordinate", ({ blockNumber }) => {
    expect(() =>
      resolveContract({
        contractId: "musd.savings-rate",
        networkId: "mezo-mainnet",
        blockNumber: blockNumber as bigint,
      }),
    ).toThrowError(ContractRegistryError);
  });

  test("rejects malformed generated addresses during registry creation", () => {
    expect(
      captureError(() =>
        createContractRegistryFromData(
          syntheticData({ deployment: { address: "not-an-address" } }),
        ),
      ),
    ).toMatchObject({ code: "MalformedGeneratedContract" });
  });
});

function latestMainnetResolution(
  registry: ReturnType<typeof createContractRegistry>,
  contractId: ContractId,
) {
  try {
    return registry.resolve({ contractId, networkId: "mezo-mainnet", blockNumber: 99_999_999n });
  } catch (error) {
    if (
      error instanceof ContractRegistryError &&
      ["MissingDeployment", "AbiUnavailable"].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

function syntheticRequest(blockNumber: bigint) {
  return {
    contractId: "musd.savings-rate" as const,
    networkId: "mezo-mainnet" as const,
    blockNumber,
  };
}

function syntheticData({
  deployment = {},
  abi = {},
  proxy = false,
}: {
  readonly deployment?: Partial<GeneratedDeploymentData>;
  readonly abi?: Partial<GeneratedAbiData>;
  readonly proxy?: boolean;
} = {}): GeneratedContractsData {
  const contractId = "musd.savings-rate";
  const baseDeployment: GeneratedDeploymentData = {
    id: `${contractId}@mezo-mainnet`,
    contractId,
    networkId: "mezo-mainnet",
    address: ADDRESS,
    contractType: proxy ? "transparent-proxy" : "direct",
    provenanceClass: "synthetic",
    deploymentFromBlock: "0",
    effectiveUntilExclusiveBlock: null,
    currentCodeFromBlock: proxy ? "10" : "0",
    currentImplementationAddress: proxy ? CURRENT_IMPLEMENTATION : null,
    implementationHistory: proxy
      ? [
          {
            implementationAddress: OLD_IMPLEMENTATION,
            effectiveFromBlock: "0",
            effectiveUntilExclusiveBlock: "10",
          },
          {
            implementationAddress: CURRENT_IMPLEMENTATION,
            effectiveFromBlock: "10",
            effectiveUntilExclusiveBlock: null,
          },
        ]
      : [],
    abiContractId: contractId,
    abiAppliesTo: proxy ? "current-implementation-through-proxy" : "direct-deployment",
    status: "verified-current",
    supportStatus: "supported",
    reviewStatus: "accepted",
    catalogVerifiedAt: "2026-01-01T00:00:00Z",
    catalogReviewAfter: "2027-01-01T00:00:00Z",
    limitations: ["Synthetic test fixture."],
    ...deployment,
  };
  const baseAbi: GeneratedAbiData = {
    contractId,
    intendedNetworkIds: ["mezo-mainnet"],
    provenanceClass: "synthetic",
    canonicalEntryCount: 2,
    readEntryCount: 2,
    fileSha256: "a".repeat(64),
    abiSha256: "b".repeat(64),
    abiSemanticSha256: "c".repeat(64),
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    catalogVerifiedAt: "2026-01-01T00:00:00Z",
    catalogReviewAfter: "2027-01-01T00:00:00Z",
    limitations: ["Synthetic test fixture."],
    readAbi: [
      { type: "function", name: "read", stateMutability: "view", inputs: [], outputs: [] },
      { type: "event", name: "Observed", inputs: [], anonymous: false },
    ],
    ...abi,
  };
  return { deployments: [baseDeployment], abis: [baseAbi] };
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected action to throw");
}
