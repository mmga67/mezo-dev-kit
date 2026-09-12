import { getNetwork } from "@mezo-dev-kit/chains";
import {
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
import type { Address, Hash32 } from "@mezo-dev-kit/evm";
import { ContractRegistryError } from "./errors.ts";
import { HISTORICAL_CONTRACT_EVIDENCE } from "./historical.generated.ts";
import { isContractId } from "./registry.ts";
import type { ContractAbiEntry, ContractId, ContractResolutionInput } from "./registry.ts";
import type { NetworkId } from "@mezo-dev-kit/chains";

/** Internal generator contract, deliberately separate from current deployment data. */
export interface GeneratedHistoricalEvidence {
  readonly generationId: string;
  readonly contractId: string;
  readonly networkId: string;
  readonly address: string;
  readonly implementationAddress: string | null;
  readonly implementationSlot: string | null;
  readonly executionVersion: number | null;
  readonly provenanceClass: string;
  readonly coverage: readonly {
    readonly fromBlock: string;
    readonly untilExclusiveBlock: string;
    readonly blockHash: string;
  }[];
  readonly runtimeBytecode: string;
  readonly readAbi: readonly ContractAbiEntry[];
  readonly calldataAbi: readonly ContractAbiEntry[];
  readonly abiSha256: string;
  readonly sourceSha256: string;
  readonly buildSha256: string;
  readonly observationsSha256: string;
  readonly verifiedAt: string;
  readonly status: string;
  readonly supportStatus: string;
  readonly reviewStatus: string;
  readonly limitations: readonly string[];
}

/** Evidence for one historical observation coordinate; never a writer-qualified target. */
export interface HistoricalContractEvidence {
  readonly kind: "historical-contract-evidence";
  readonly generationId: string;
  readonly contractId: ContractId;
  readonly networkId: NetworkId;
  readonly address: Address;
  readonly coordinate: Readonly<{ blockNumber: bigint; blockHash: Hash32 }>;
  /** Observation coverage, not claimed installation/activation heights. */
  readonly coverage: Readonly<{ fromBlock: bigint; untilExclusiveBlock: bigint }>;
  readonly runtime: Readonly<{
    codeAddress: Address;
    codeHash: Hash32;
    implementationAddress: Address | null;
    implementationSlot: Hash32 | null;
    executionVersion: number | null;
    provenanceClass: string;
  }>;
  readonly readAbi: readonly ContractAbiEntry[];
  /** For decoding observed calldata only; confers no operation or submission support. */
  readonly calldataAbi: readonly ContractAbiEntry[];
  readonly evidence: Readonly<{
    status: "verified";
    supportStatus: "proposed";
    reviewStatus: "pending-qualified-review";
    verifiedAt: string;
    abiSha256: string;
    sourceSha256: string;
    buildSha256: string;
    observationsSha256: string;
  }>;
  readonly limitations: readonly string[];
}

export function resolveHistoricalContractEvidence(
  input: ContractResolutionInput,
): Readonly<HistoricalContractEvidence> {
  return resolveHistoricalEvidenceFromData(input, HISTORICAL_CONTRACT_EVIDENCE);
}

/** Internal validation seam, excluded from package exports. Artifact digests are checked at generation. */
export function resolveHistoricalEvidenceFromData(
  input: ContractResolutionInput,
  records: readonly GeneratedHistoricalEvidence[],
): Readonly<HistoricalContractEvidence> {
  if (
    !input ||
    !isContractId(input.contractId) ||
    typeof input.blockNumber !== "bigint" ||
    input.blockNumber < 0n
  )
    throw new ContractRegistryError(
      "InvalidContractInput",
      "a known contract and non-negative bigint block are required",
      {},
    );
  const network = getNetwork(input.networkId),
    block = parseUnsignedInteger(input.blockNumber);
  const matches = records.flatMap((row) =>
    row.contractId === input.contractId && row.networkId === network.id
      ? row.coverage
          .filter(
            (span) => BigInt(span.fromBlock) <= block && block < BigInt(span.untilExclusiveBlock),
          )
          .map((span) => ({ row, span }))
      : [],
  );
  if (matches.length === 0)
    throw new ContractRegistryError(
      "HistoricalEvidenceUnavailable",
      "no historical evidence covers this coordinate",
      { ...input },
    );
  if (matches.length !== 1)
    throw new ContractRegistryError(
      "OverlappingDeployments",
      "historical evidence overlaps at this coordinate",
      { ...input },
    );
  const match = matches[0];
  if (!match) throw new Error("historical selection failed");
  const { row, span } = match;
  if (
    row.status !== "verified" ||
    row.supportStatus !== "proposed" ||
    row.reviewStatus !== "pending-qualified-review"
  )
    throw new ContractRegistryError(
      "UnsupportedDeploymentState",
      "historical evidence lifecycle is not eligible for private observation",
      { generationId: row.generationId },
    );
  const address = parseAddress(row.address),
    implementationAddress =
      row.implementationAddress === null ? null : parseAddress(row.implementationAddress);
  // Recursive copy prevents a caller from mutating the module's shared generated ABI.
  const freezeAbi = (entries: readonly ContractAbiEntry[]) => deepFreeze(structuredClone(entries));
  return Object.freeze({
    kind: "historical-contract-evidence",
    generationId: row.generationId,
    contractId: input.contractId,
    networkId: network.id,
    address,
    coordinate: Object.freeze({ blockNumber: block, blockHash: parseHash32(span.blockHash) }),
    coverage: Object.freeze({
      fromBlock: BigInt(span.fromBlock),
      untilExclusiveBlock: BigInt(span.untilExclusiveBlock),
    }),
    runtime: Object.freeze({
      codeAddress: implementationAddress ?? address,
      codeHash: keccak256(parseHexData(row.runtimeBytecode)),
      implementationAddress,
      implementationSlot:
        row.implementationSlot === null ? null : parseHash32(row.implementationSlot),
      executionVersion: row.executionVersion,
      provenanceClass: row.provenanceClass,
    }),
    readAbi: freezeAbi(row.readAbi),
    calldataAbi: freezeAbi(row.calldataAbi),
    evidence: Object.freeze({
      status: "verified",
      supportStatus: "proposed",
      reviewStatus: "pending-qualified-review",
      verifiedAt: row.verifiedAt,
      abiSha256: row.abiSha256,
      sourceSha256: row.sourceSha256,
      buildSha256: row.buildSha256,
      observationsSha256: row.observationsSha256,
    }),
    limitations: Object.freeze([...row.limitations]),
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
