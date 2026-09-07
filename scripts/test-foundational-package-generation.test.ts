import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  assertGeneratedPackageCurrent,
  buildChainsPackageFile,
  buildContractsPackageFile,
  projectContractDocuments,
  projectNetworkDocument,
} from "./lib/foundational-package-generation.ts";
import type { AbiArtifactInput } from "./lib/foundational-package-generation.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ADDRESS = "0x1111111111111111111111111111111111111111";

interface FixtureCatalog extends Record<string, unknown> {
  records: Record<string, unknown>[];
}

describe("foundational package generation", () => {
  test("reproduces both committed package artifacts from exact canonical inputs", async () => {
    const [chains, contracts, currentChains, currentContracts] = await Promise.all([
      buildChainsPackageFile(repositoryRoot),
      buildContractsPackageFile(repositoryRoot),
      readFile(resolve(repositoryRoot, "packages/chains/src/data.generated.ts"), "utf8"),
      readFile(resolve(repositoryRoot, "packages/contracts/src/data.generated.ts"), "utf8"),
    ]);

    expect(currentChains).toBe(chains.output);
    expect(currentContracts).toBe(contracts.output);
    expect(chains.output).not.toMatch(/from\s+["'][^"']*knowledge\//);
    expect(contracts.output).not.toMatch(/from\s+["'][^"']*knowledge\//);
    expect(chains.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(contracts.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  test("makes generated drift a hard failure", () => {
    expect(() => {
      assertGeneratedPackageCurrent(
        "stale output",
        { digest: "a".repeat(64), output: "current output" },
        "Fixture",
      );
    }).toThrowError("Fixture generated data drifted");
  });

  test("validates network profile fields and lifecycle values before projection", () => {
    expect(projectNetworkDocument("fixture-network", networkRecord())).toMatchObject({
      id: "fixture-network",
      evmChainId: "31612",
      status: "verified",
      supportStatus: "supported",
      reviewStatus: "accepted",
    });
    expect(() =>
      projectNetworkDocument("fixture-network", networkRecord({ supportStatus: "automatic" })),
    ).toThrowError("supportStatus is unsupported");
    expect(() =>
      projectNetworkDocument(
        "fixture-network",
        networkRecord({
          values: networkValues({ cosmosChainId: null }),
        }),
      ),
    ).toThrowError("cosmos-evm profile is incomplete");
  });

  test("projects only read functions, events, and errors from canonical ABIs", () => {
    const artifact = abiArtifact();
    const projected = projectContractDocuments({
      deploymentDocument: deploymentCatalog(),
      abiCatalogDocument: abiCatalog(artifact),
      artifacts: [artifact],
    });

    expect(projected.abis[0]?.canonicalEntryCount).toBe(5);
    expect(projected.abis[0]?.readAbi).toEqual([
      expect.objectContaining({ type: "function", name: "read", stateMutability: "view" }),
      expect.objectContaining({ type: "function", name: "calculate", stateMutability: "pure" }),
      expect.objectContaining({ type: "event", name: "Observed" }),
    ]);
    expect(projected.abis[0]?.readAbi).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "write" })]),
    );
  });

  test("rejects a mismatched ABI digest before generated data can be emitted", () => {
    const artifact = abiArtifact();
    const catalog = abiCatalog(artifact);
    catalog.records[0]!.fileSha256 = "0".repeat(64);

    expect(() =>
      projectContractDocuments({
        deploymentDocument: deploymentCatalog(),
        abiCatalogDocument: catalog,
        artifacts: [artifact],
      }),
    ).toThrowError("ABI file digest differs from its catalog");
  });

  test("rejects an unaccepted canonical catalog before record projection", () => {
    const artifact = abiArtifact();
    const catalog = abiCatalog(artifact);
    catalog.reviewStatus = "pending-qualified-review";

    expect(() =>
      projectContractDocuments({
        deploymentDocument: deploymentCatalog(),
        abiCatalogDocument: catalog,
        artifacts: [artifact],
      }),
    ).toThrowError(
      "contract ABI catalog must be verified, supported, and accepted; received verified/supported/pending-qualified-review",
    );
  });

  test("rejects invalid deployment ranges and unknown ABI entry kinds", () => {
    const artifact = abiArtifact();
    expect(() =>
      projectContractDocuments({
        deploymentDocument: deploymentCatalog({
          validity: {
            deploymentFrom: { blockNumber: 10 },
            currentCodeFrom: { blockNumber: 10 },
            effectiveUntilExclusive: { blockNumber: 10 },
          },
        }),
        abiCatalogDocument: abiCatalog(artifact),
        artifacts: [artifact],
      }),
    ).toThrowError("deployment validity must end after it starts");

    const invalidDocument = [{ type: "unknown-entry-kind" }];
    const invalidBytes = Buffer.from(JSON.stringify(invalidDocument));
    const invalidArtifact: AbiArtifactInput = {
      ...artifact,
      bytes: invalidBytes,
      document: invalidDocument,
    };
    const invalidCatalog = abiCatalog(invalidArtifact);
    invalidCatalog.records[0]!.entryCount = 1;
    expect(() =>
      projectContractDocuments({
        deploymentDocument: deploymentCatalog(),
        abiCatalogDocument: invalidCatalog,
        artifacts: [invalidArtifact],
      }),
    ).toThrowError("ABI entry type is unsupported");
  });
});

function networkRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "fixture-network",
    environment: "mainnet",
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    verifiedAt: "2026-01-01T00:00:00Z",
    reviewAfter: null,
    limitations: [],
    values: networkValues(),
    ...overrides,
  };
}

function networkValues(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: "cosmos-evm",
    displayName: "Fixture",
    evmChainId: 31_612,
    cosmosChainId: "fixture_31612-1",
    nativeCurrency: {
      name: "Bitcoin",
      symbol: "BTC",
      decimals: 18,
      cosmosEvmDenom: "abtc",
    },
    explorer: { name: "Explorer", url: "https://example.test" },
    capabilities: {
      evm: true,
      evmJsonRpc: true,
      cosmosSdk: true,
      nodeCosmosRpc: true,
      consensusEngine: "CometBFT",
      gasCurrency: "native",
    },
    ...overrides,
  };
}

function abiArtifact(): AbiArtifactInput {
  const document = [
    { type: "function", name: "read", stateMutability: "view", inputs: [], outputs: [] },
    { type: "function", name: "calculate", stateMutability: "pure", inputs: [], outputs: [] },
    { type: "function", name: "write", stateMutability: "nonpayable", inputs: [], outputs: [] },
    { type: "event", name: "Observed", inputs: [], anonymous: false },
    { type: "constructor", stateMutability: "nonpayable", inputs: [] },
  ];
  const bytes = Buffer.from(JSON.stringify(document));
  return {
    contractId: "fixture.contract",
    resourceId: "abi.fixture.contract",
    bytes,
    document,
  };
}

function abiCatalog(artifact: AbiArtifactInput): FixtureCatalog {
  return {
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    verifiedAt: "2026-01-01T00:00:00Z",
    reviewAfter: "2027-01-01T00:00:00Z",
    records: [
      {
        id: "fixture.contract",
        contractId: "fixture.contract",
        intendedNetworkIds: ["mezo-mainnet"],
        provenanceClass: "synthetic",
        artifactReference: { moduleId: "contracts", resourceId: "abi.fixture.contract" },
        entryCount: 5,
        fileSha256: createHash("sha256").update(artifact.bytes).digest("hex"),
        abiSha256: "a".repeat(64),
        abiSemanticSha256: "b".repeat(64),
        status: "verified",
        supportStatus: "supported",
        reviewStatus: "accepted",
        limitations: [],
      },
    ],
  };
}

function deploymentCatalog(
  deploymentOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "verified",
    supportStatus: "supported",
    reviewStatus: "accepted",
    verifiedAt: "2026-01-01T00:00:00Z",
    reviewAfter: "2027-01-01T00:00:00Z",
    records: [
      {
        id: "fixture.contract@mezo-mainnet",
        contractId: "fixture.contract",
        networkId: "mezo-mainnet",
        address: ADDRESS,
        contractType: "direct",
        provenanceClass: "synthetic",
        validity: {
          deploymentFrom: { blockNumber: 1 },
          currentCodeFrom: { blockNumber: 1 },
          effectiveUntilExclusive: null,
        },
        proxy: null,
        abi: {
          catalogReference: {
            moduleId: "contracts",
            resourceId: "contract-abis",
            recordId: "fixture.contract",
          },
          appliesTo: "direct-deployment",
        },
        status: "verified-current",
        supportStatus: "supported",
        reviewStatus: "accepted",
        limitations: [],
        ...deploymentOverrides,
      },
    ],
  };
}
