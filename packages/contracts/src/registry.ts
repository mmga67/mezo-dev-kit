import { getNetwork } from "@mezo-dev-kit/chains";
import type { NetworkId } from "@mezo-dev-kit/chains";

import { GENERATED_CONTRACT_IDS, GENERATED_CONTRACTS_DATA } from "./data.generated.ts";
import { ContractRegistryError } from "./errors.ts";
import type {
  GeneratedAbiData,
  GeneratedContractsData,
  GeneratedDeploymentData,
  GeneratedJsonValue,
} from "./generated-types.ts";

export type ContractId = (typeof GENERATED_CONTRACT_IDS)[number];
export type ContractAddress = `0x${string}`;
export type ContractAbiEntry = Readonly<Record<string, GeneratedJsonValue>>;

export interface ContractResolutionInput {
  readonly contractId: ContractId;
  readonly networkId: NetworkId;
  readonly blockNumber: bigint;
}

export interface ResolvedContract {
  readonly contractId: ContractId;
  readonly networkId: NetworkId;
  readonly deploymentId: string;
  readonly address: ContractAddress;
  readonly blockNumber: bigint;
  readonly deploymentFromBlock: bigint;
  readonly currentCodeFromBlock: bigint;
  readonly contractType: string;
  readonly provenanceClass: string;
  readonly abiAppliesTo: string;
  readonly implementationAddress: ContractAddress | null;
  readonly readAbi: readonly ContractAbiEntry[];
  readonly abi: Readonly<{
    contractId: ContractId;
    canonicalEntryCount: number;
    readEntryCount: number;
    fileSha256: string;
    abiSha256: string;
    abiSemanticSha256: string;
  }>;
  readonly evidence: Readonly<{
    deploymentCatalogVerifiedAt: string;
    deploymentCatalogReviewAfter: string | null;
    abiCatalogVerifiedAt: string;
    abiCatalogReviewAfter: string | null;
  }>;
  readonly limitations: readonly string[];
}

export interface ContractRegistry {
  resolve(input: ContractResolutionInput): Readonly<ResolvedContract>;
  listContractIds(): readonly ContractId[];
}

interface RuntimeGeneration {
  readonly implementationAddress: ContractAddress;
  readonly effectiveFromBlock: bigint;
  readonly effectiveUntilExclusiveBlock: bigint | null;
}

interface RuntimeDeployment extends Omit<
  GeneratedDeploymentData,
  | "contractId"
  | "networkId"
  | "address"
  | "deploymentFromBlock"
  | "effectiveUntilExclusiveBlock"
  | "currentCodeFromBlock"
  | "currentImplementationAddress"
  | "implementationHistory"
> {
  readonly contractId: ContractId;
  readonly networkId: NetworkId;
  readonly address: ContractAddress;
  readonly deploymentFromBlock: bigint;
  readonly effectiveUntilExclusiveBlock: bigint | null;
  readonly currentCodeFromBlock: bigint;
  readonly currentImplementationAddress: ContractAddress | null;
  readonly implementationHistory: readonly RuntimeGeneration[];
}

interface RuntimeAbi extends Omit<GeneratedAbiData, "contractId" | "readAbi"> {
  readonly contractId: ContractId;
  readonly readAbi: readonly ContractAbiEntry[];
}

export function createContractRegistry(): Readonly<ContractRegistry> {
  return createContractRegistryFromData(GENERATED_CONTRACTS_DATA);
}

export function createContractRegistryFromData(
  data: GeneratedContractsData,
): Readonly<ContractRegistry> {
  const deployments = data.deployments.map(toRuntimeDeployment);
  const abis = data.abis.map(toRuntimeAbi);
  assertUnique(
    deployments.map(({ id }) => id),
    "deployment ID",
  );
  assertUnique(
    abis.map(({ contractId }) => contractId),
    "ABI contract ID",
  );
  const abiByContractId = new Map(abis.map((abi) => [abi.contractId, abi]));

  function listContractIds(): readonly ContractId[] {
    return Object.freeze([...GENERATED_CONTRACT_IDS]);
  }

  function resolve(input: ContractResolutionInput): Readonly<ResolvedContract> {
    if (!input || typeof input !== "object") {
      throw new ContractRegistryError(
        "InvalidContractInput",
        "contract resolution input is required",
        {},
      );
    }
    const contractId = validateContractId(input.contractId);
    const network = getNetwork(input.networkId);
    const blockNumber = validateBlockNumber(input.blockNumber);
    const coordinateMatches = deployments.filter(
      (deployment) =>
        deployment.contractId === contractId &&
        deployment.networkId === network.id &&
        deployment.deploymentFromBlock <= blockNumber &&
        (deployment.effectiveUntilExclusiveBlock === null ||
          blockNumber < deployment.effectiveUntilExclusiveBlock),
    );
    if (coordinateMatches.length === 0) {
      throw new ContractRegistryError(
        "MissingDeployment",
        "no deployment covers the requested coordinate",
        { contractId, networkId: network.id, blockNumber: blockNumber.toString() },
      );
    }
    const supported = coordinateMatches.filter(isSupportedDeployment);
    if (supported.length === 0) {
      throw new ContractRegistryError(
        "UnsupportedDeploymentState",
        "the deployment at the requested coordinate is not supported",
        {
          contractId,
          networkId: network.id,
          blockNumber: blockNumber.toString(),
          candidates: coordinateMatches.map(({ id, status, supportStatus, reviewStatus }) => ({
            id,
            status,
            supportStatus,
            reviewStatus,
          })),
        },
      );
    }
    if (supported.length !== 1) {
      throw new ContractRegistryError(
        "OverlappingDeployments",
        "multiple supported deployments cover the requested coordinate",
        {
          contractId,
          networkId: network.id,
          blockNumber: blockNumber.toString(),
          deploymentIds: supported.map(({ id }) => id),
        },
      );
    }
    const deployment = supported[0];
    if (!deployment) throw new Error("supported deployment selection failed");
    const implementationAddress = selectImplementation(deployment, blockNumber);
    const abi = abiByContractId.get(deployment.contractId);
    if (!abi || !isSupportedAbi(abi) || !abi.intendedNetworkIds.includes(network.id)) {
      throw new ContractRegistryError(
        "AbiUnavailable",
        "a supported read ABI is unavailable for the resolved deployment",
        {
          contractId,
          networkId: network.id,
          deploymentId: deployment.id,
          abiStatus: abi?.status ?? null,
          abiSupportStatus: abi?.supportStatus ?? null,
          abiReviewStatus: abi?.reviewStatus ?? null,
        },
      );
    }
    return Object.freeze({
      contractId,
      networkId: network.id,
      deploymentId: deployment.id,
      address: deployment.address,
      blockNumber,
      deploymentFromBlock: deployment.deploymentFromBlock,
      currentCodeFromBlock: deployment.currentCodeFromBlock,
      contractType: deployment.contractType,
      provenanceClass: deployment.provenanceClass,
      abiAppliesTo: deployment.abiAppliesTo,
      implementationAddress,
      readAbi: abi.readAbi,
      abi: Object.freeze({
        contractId: abi.contractId,
        canonicalEntryCount: abi.canonicalEntryCount,
        readEntryCount: abi.readEntryCount,
        fileSha256: abi.fileSha256,
        abiSha256: abi.abiSha256,
        abiSemanticSha256: abi.abiSemanticSha256,
      }),
      evidence: Object.freeze({
        deploymentCatalogVerifiedAt: deployment.catalogVerifiedAt,
        deploymentCatalogReviewAfter: deployment.catalogReviewAfter,
        abiCatalogVerifiedAt: abi.catalogVerifiedAt,
        abiCatalogReviewAfter: abi.catalogReviewAfter,
      }),
      limitations: Object.freeze([...deployment.limitations, ...abi.limitations]),
    });
  }

  return Object.freeze({ resolve, listContractIds });
}

const defaultRegistry = createContractRegistry();

export function resolveContract(input: ContractResolutionInput): Readonly<ResolvedContract> {
  return defaultRegistry.resolve(input);
}

export function listContractIds(): readonly ContractId[] {
  return defaultRegistry.listContractIds();
}

export function isContractId(value: unknown): value is ContractId {
  return typeof value === "string" && (GENERATED_CONTRACT_IDS as readonly string[]).includes(value);
}

function validateContractId(value: unknown): ContractId {
  if (typeof value !== "string" || value.length === 0) {
    throw new ContractRegistryError(
      "InvalidContractInput",
      "contractId must be a non-empty string",
      { receivedType: typeof value },
    );
  }
  if (!isContractId(value)) {
    throw new ContractRegistryError("UnknownContractId", `unknown contract '${value}'`, {
      contractId: value,
    });
  }
  return value;
}

function validateBlockNumber(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new ContractRegistryError(
      "InvalidContractInput",
      "blockNumber must be a non-negative bigint",
      { field: "blockNumber", receivedType: typeof value },
    );
  }
  return value;
}

function selectImplementation(
  deployment: RuntimeDeployment,
  blockNumber: bigint,
): ContractAddress | null {
  if (deployment.implementationHistory.length === 0) {
    if (blockNumber < deployment.currentCodeFromBlock) {
      throw historicalGenerationError(deployment, blockNumber, null);
    }
    return null;
  }
  const generations = deployment.implementationHistory.filter(
    (generation) =>
      generation.effectiveFromBlock <= blockNumber &&
      (generation.effectiveUntilExclusiveBlock === null ||
        blockNumber < generation.effectiveUntilExclusiveBlock),
  );
  if (generations.length !== 1) {
    throw new ContractRegistryError(
      "MalformedGeneratedContract",
      "implementation history does not uniquely cover the requested coordinate",
      {
        deploymentId: deployment.id,
        blockNumber: blockNumber.toString(),
        generationCount: generations.length,
      },
    );
  }
  const generation = generations[0];
  if (!generation) throw new Error("implementation generation selection failed");
  if (
    generation.implementationAddress !== deployment.currentImplementationAddress ||
    generation.effectiveUntilExclusiveBlock !== null
  ) {
    throw historicalGenerationError(deployment, blockNumber, generation.implementationAddress);
  }
  return generation.implementationAddress;
}

function historicalGenerationError(
  deployment: RuntimeDeployment,
  blockNumber: bigint,
  implementationAddress: ContractAddress | null,
): ContractRegistryError {
  return new ContractRegistryError(
    "HistoricalGenerationUnsupported",
    "the canonical read ABI does not apply to the historical implementation generation",
    {
      deploymentId: deployment.id,
      contractId: deployment.contractId,
      networkId: deployment.networkId,
      blockNumber: blockNumber.toString(),
      implementationAddress,
      currentCodeFromBlock: deployment.currentCodeFromBlock.toString(),
    },
  );
}

function toRuntimeDeployment(value: GeneratedDeploymentData): Readonly<RuntimeDeployment> {
  if (!isContractId(value.contractId)) {
    throw malformed(value.id, "deployment contractId is not generated");
  }
  const network = getNetwork(value.networkId);
  const deploymentFromBlock = generatedBlock(value.deploymentFromBlock, value.id);
  const effectiveUntilExclusiveBlock = generatedOptionalBlock(
    value.effectiveUntilExclusiveBlock,
    value.id,
  );
  const currentCodeFromBlock = generatedBlock(value.currentCodeFromBlock, value.id);
  const implementationHistory = value.implementationHistory.map((generation) =>
    Object.freeze({
      implementationAddress: generatedAddress(generation.implementationAddress, value.id),
      effectiveFromBlock: generatedBlock(generation.effectiveFromBlock, value.id),
      effectiveUntilExclusiveBlock: generatedOptionalBlock(
        generation.effectiveUntilExclusiveBlock,
        value.id,
      ),
    }),
  );
  return Object.freeze({
    ...value,
    contractId: value.contractId,
    networkId: network.id,
    address: generatedAddress(value.address, value.id),
    deploymentFromBlock,
    effectiveUntilExclusiveBlock,
    currentCodeFromBlock,
    currentImplementationAddress:
      value.currentImplementationAddress === null
        ? null
        : generatedAddress(value.currentImplementationAddress, value.id),
    implementationHistory: Object.freeze(implementationHistory),
    limitations: Object.freeze([...value.limitations]),
  });
}

function toRuntimeAbi(value: GeneratedAbiData): Readonly<RuntimeAbi> {
  if (!isContractId(value.contractId)) {
    throw malformed(value.contractId, "ABI contractId is not generated");
  }
  const readAbi = Object.freeze(
    value.readAbi.map((entry) => deepFreeze(entry) as ContractAbiEntry),
  );
  if (readAbi.length !== value.readEntryCount) {
    throw malformed(value.contractId, "read ABI entry count differs from metadata");
  }
  return Object.freeze({
    ...value,
    contractId: value.contractId,
    intendedNetworkIds: Object.freeze([...value.intendedNetworkIds]),
    limitations: Object.freeze([...value.limitations]),
    readAbi,
  });
}

function generatedBlock(value: string, ownerId: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw malformed(ownerId, "block is invalid");
  return BigInt(value);
}

function generatedOptionalBlock(value: string | null, ownerId: string): bigint | null {
  return value === null ? null : generatedBlock(value, ownerId);
}

function generatedAddress(value: string, ownerId: string): ContractAddress {
  if (!/^0x[a-f0-9]{40}$/.test(value)) throw malformed(ownerId, "address is invalid");
  return value as ContractAddress;
}

function isSupportedDeployment(value: RuntimeDeployment): boolean {
  return (
    value.status === "verified-current" &&
    value.supportStatus === "supported" &&
    value.reviewStatus === "accepted"
  );
}

function isSupportedAbi(value: RuntimeAbi): boolean {
  return (
    value.status === "verified" &&
    value.supportStatus === "supported" &&
    value.reviewStatus === "accepted"
  );
}

function malformed(ownerId: string, message: string): ContractRegistryError {
  return new ContractRegistryError("MalformedGeneratedContract", message, { ownerId });
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw malformed(value, `duplicate ${label}`);
    seen.add(value);
  }
}

function deepFreeze(value: GeneratedJsonValue): GeneratedJsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, deepFreeze(nested)])),
    );
  }
  return value;
}
