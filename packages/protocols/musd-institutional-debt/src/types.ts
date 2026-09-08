import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type {
  InstitutionalAccumulator,
  InstitutionalHealth,
  InstitutionalPositionDebt,
} from "./accounting.ts";

export type EnclaveGeneration = "original" | "second";
export type InstitutionalPositionStatus =
  "nonExistent" | "active" | "closedByRepayment" | "closedByLiquidation";
export interface InstitutionalReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}
export interface InstitutionalPledge {
  readonly tokenId: bigint;
  readonly owner: `0x${string}`;
  readonly positionId: `0x${string}`;
  readonly amount: bigint;
  readonly end: bigint;
  readonly isPermanent: boolean;
  readonly boost: bigint;
}
export interface InstitutionalPosition {
  readonly positionId: `0x${string}`;
  readonly status: InstitutionalPositionStatus;
  readonly enclave: `0x${string}`;
  readonly borrower: `0x${string}`;
  readonly originator: `0x${string}`;
  readonly principal: bigint;
  readonly storedInterest: bigint;
  readonly storedOriginatorFee: bigint;
  readonly lastUpdateTimestamp: bigint;
  readonly interestRateBps: bigint;
  readonly originatorFeeRateBps: bigint;
  readonly warningCr: bigint;
  readonly minimumCr: bigint;
  readonly debt: Readonly<InstitutionalPositionDebt>;
  readonly collateral: bigint;
  readonly pledges: readonly Readonly<InstitutionalPledge>[];
  readonly enclaveRoleGranted: boolean;
  readonly health:
    | Readonly<{ state: "available"; value: Readonly<InstitutionalHealth> }>
    | Readonly<{ state: "unavailable"; reason: "price-call-failed" | "nonpositive-price" }>;
}
export interface InstitutionalTotals {
  readonly totalPrincipal: bigint;
  readonly totalMintedDebt: bigint;
  readonly totalDebtBurned: bigint;
  readonly totalInterestMinted: bigint;
  readonly totalOriginatorFeeMinted: bigint;
  readonly totalFeesStored: bigint;
  readonly totalFeeSettled: bigint;
  readonly interest: Readonly<InstitutionalAccumulator>;
  readonly combinedFees: Readonly<InstitutionalAccumulator>;
  readonly accruedInterest: bigint;
  readonly accruedCombinedFees: bigint;
  readonly outstandingDebt: bigint;
}
export interface InstitutionalSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly providerId: string;
  readonly manager: `0x${string}`;
  readonly musd: `0x${string}`;
  readonly veBtc: `0x${string}`;
  readonly priceFeed: `0x${string}`;
  readonly pcv: `0x${string}`;
  readonly paused: boolean;
  readonly mintCap: bigint;
  readonly maxCombinedRateBps: bigint;
  readonly maxPledgedVeBtc: bigint;
  readonly minimumMinimumCr: bigint;
  readonly price:
    | Readonly<{ state: "available"; amount: bigint; decimals: 18 }>
    | Readonly<{ state: "unavailable"; reason: "price-call-failed" | "nonpositive-price" }>;
  readonly totals: Readonly<InstitutionalTotals>;
  readonly positions: readonly Readonly<InstitutionalPosition>[];
  readonly positionCoverage: "requested-ids-only";
}
export interface EnclaveTarget {
  readonly address: `0x${string}`;
  readonly selector: `0x${string}`;
}
export interface EnclaveUtxo {
  readonly txHash: `0x${string}`;
  readonly outputIndex: bigint;
  readonly outputValueSatoshis: bigint;
}
export interface EnclaveSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly providerId: string;
  readonly generation: EnclaveGeneration;
  readonly address: `0x${string}`;
  readonly account: `0x${string}`;
  readonly btc: `0x${string}`;
  readonly veBtc: `0x${string}`;
  readonly assetsBridge: `0x${string}`;
  readonly roles: readonly Readonly<{ name: string; role: `0x${string}`; granted: boolean }>[];
  readonly targets: readonly Readonly<EnclaveTarget & { allowed: boolean }>[];
  readonly targetCoverage: "requested-pairs-only";
  readonly utxos:
    | Readonly<{ state: "not-requested" }>
    | Readonly<{ state: "recorded"; entries: readonly Readonly<EnclaveUtxo>[] }>;
}
export interface InstitutionalReader {
  read(input: {
    readonly positionIds: readonly `0x${string}`[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<InstitutionalSnapshot>>;
  readEnclave(input: {
    readonly generation: EnclaveGeneration;
    readonly account: `0x${string}`;
    readonly targets: readonly EnclaveTarget[];
    readonly maxUtxos?: number;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<EnclaveSnapshot>>;
}
