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

export interface GeneratedNetworkData {
  readonly id: string;
  readonly environment: "mainnet" | "testnet";
  readonly profile: "evm" | "cosmos-evm";
  readonly displayName: string;
  readonly evmChainId: string;
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
  readonly status: GeneratedEvidenceStatus;
  readonly supportStatus: GeneratedSupportStatus;
  readonly reviewStatus: GeneratedReviewStatus;
  readonly verifiedAt: string | null;
  readonly reviewAfter: string | null;
  readonly limitations: readonly string[];
}

export interface GeneratedChainsData {
  readonly networks: readonly GeneratedNetworkData[];
}
