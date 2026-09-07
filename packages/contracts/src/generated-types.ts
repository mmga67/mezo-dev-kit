export type GeneratedEvidenceStatus =
  | "candidate"
  | "unverified"
  | "verified"
  | "conflicting"
  | "superseded"
  | "verified-current"
  | "verified-superseded";

export type GeneratedSupportStatus =
  "none" | "proposed" | "supported" | "historical" | "deprecated" | "docs-only";

export type GeneratedReviewStatus =
  | "unreviewed"
  | "pending-architecture-review"
  | "pending-qualified-review"
  | "accepted"
  | "rejected";

export type GeneratedJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly GeneratedJsonValue[]
  | { readonly [key: string]: GeneratedJsonValue };

export interface GeneratedDeploymentData {
  readonly id: string;
  readonly contractId: string;
  readonly networkId: string;
  readonly address: string;
  readonly contractType: string;
  readonly provenanceClass: string;
  readonly deploymentFromBlock: string;
  readonly effectiveUntilExclusiveBlock: string | null;
  readonly currentCodeFromBlock: string;
  readonly currentImplementationAddress: string | null;
  readonly implementationHistory: readonly Readonly<{
    implementationAddress: string;
    effectiveFromBlock: string;
    effectiveUntilExclusiveBlock: string | null;
  }>[];
  readonly abiContractId: string;
  readonly abiAppliesTo: string;
  readonly status: GeneratedEvidenceStatus;
  readonly supportStatus: GeneratedSupportStatus;
  readonly reviewStatus: GeneratedReviewStatus;
  readonly catalogVerifiedAt: string;
  readonly catalogReviewAfter: string | null;
  readonly limitations: readonly string[];
}

export interface GeneratedAbiData {
  readonly contractId: string;
  readonly intendedNetworkIds: readonly string[];
  readonly provenanceClass: string;
  readonly canonicalEntryCount: number;
  readonly readEntryCount: number;
  readonly fileSha256: string;
  readonly abiSha256: string;
  readonly abiSemanticSha256: string;
  readonly status: GeneratedEvidenceStatus;
  readonly supportStatus: GeneratedSupportStatus;
  readonly reviewStatus: GeneratedReviewStatus;
  readonly catalogVerifiedAt: string;
  readonly catalogReviewAfter: string | null;
  readonly limitations: readonly string[];
  readonly readAbi: readonly Readonly<Record<string, GeneratedJsonValue>>[];
}

export interface GeneratedContractsData {
  readonly deployments: readonly GeneratedDeploymentData[];
  readonly abis: readonly GeneratedAbiData[];
}
