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
/**
 * Explicit mainnet registry and RPC dependencies for Enclave custody and debt reads; no partner
 * signer is included.
 */
export interface InstitutionalReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}
/**
 * Position-specific pledged collateral record; pledge accounting is distinct from total Enclave
 * token custody.
 */
export interface InstitutionalPledge {
  readonly tokenId: bigint;
  readonly owner: `0x${string}`;
  readonly positionId: `0x${string}`;
  readonly amount: bigint;
  readonly end: bigint;
  readonly isPermanent: boolean;
  readonly boost: bigint;
}
/**
 * Verified position identity, authority and debt/pledge accounting at the snapshot coordinate.
 */
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
/**
 * Aggregate principal/fee accounting. Aggregate floors may differ from summing individually
 * rounded position fees.
 */
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
/**
 * Anchored manager totals and the explicitly requested position set. The set need not enumerate
 * every position.
 */
export interface InstitutionalSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
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
/**
 * Explicit target/selector pair for an Enclave permission check; no permission is inferred for
 * unrequested calls.
 */
export interface EnclaveTarget {
  readonly address: `0x${string}`;
  readonly selector: `0x${string}`;
}
/**
 * Bounded custody UTXO evidence. Preserve outpoint and amount identity; list coverage is
 * separate from custody completeness.
 */
export interface EnclaveUtxo {
  readonly txHash: `0x${string}`;
  readonly outputIndex: bigint;
  readonly outputValueSatoshis: bigint;
}
/**
 * One-generation Enclave authority, custody and bounded UTXO observations; no transaction
 * execution is implied.
 */
export interface EnclaveSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
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
/**
 * Bounded signer-free manager/position and Enclave reads; incomplete history or optional price
 * failure remains explicit.
 */
export interface InstitutionalReader {
  /**
   * Read aggregate debt and the bounded explicit position-ID set at one coordinate; optional
   * price failure leaves health unavailable.
   */
  read(input: {
    readonly positionIds: readonly `0x${string}`[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<InstitutionalSnapshot>>;
  /**
   * Inspect the selected Enclave generation, account permissions and bounded UTXOs for explicit
   * target/selector pairs.
   */
  readEnclave(input: {
    readonly generation: EnclaveGeneration;
    readonly account: `0x${string}`;
    readonly targets: readonly EnclaveTarget[];
    readonly maxUtxos?: number;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<EnclaveSnapshot>>;
}
