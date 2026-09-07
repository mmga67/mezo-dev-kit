import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAbiEntry, ContractAddress, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadTransport, HexData, ReadCoordinate } from "@mezo-dev-kit/core";

import type { SavingsAmount, SavingsYield } from "./accounting.ts";
import type { SavingsReadErrorCode } from "./errors.ts";

type Awaitable<T> = T | Promise<T>;

export interface SavingsCall {
  readonly abi: readonly ContractAbiEntry[];
  readonly functionName: string;
  readonly args: readonly ContractAddress[];
}
/** The application supplies its reviewed ABI library through this small port. */
export interface SavingsReadCodec {
  encodeRead(call: SavingsCall): HexData;
  decodeRead(call: SavingsCall & { readonly data: unknown }): unknown;
}
export interface SavingsTransportReadRequest extends ReadCoordinate {
  readonly address: ContractAddress;
  readonly data: HexData;
}
export interface SavingsReadTransport extends Omit<CoreReadTransport, "read"> {
  read(request: Readonly<SavingsTransportReadRequest>): Awaitable<unknown>;
  getCode(request: Readonly<ReadCoordinate & { address: ContractAddress }>): Awaitable<unknown>;
  getStorage(
    request: Readonly<ReadCoordinate & { address: ContractAddress; slot: HexData }>,
  ): Awaitable<unknown>;
}
export interface SavingsReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: SavingsReadTransport;
  readonly codec: SavingsReadCodec;
}
export type SavingsReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: SavingsReadErrorCode; field: string }>;
    }>;
export interface SavingsWallet {
  readonly principalReceipts: SavingsAmount<"sMUSD">;
  readonly yield: SavingsYield;
}
export interface SavingsStrategy {
  readonly address: ContractAddress;
  readonly vault: ContractAddress;
  readonly token: ContractAddress;
}
export interface SavingsConverter {
  readonly address: ContractAddress;
  readonly implementationAddress: ContractAddress;
  readonly savings: ContractAddress;
  readonly musdToken: ContractAddress;
  readonly maxSlippageBps: bigint;
}
export interface SavingsGauge {
  readonly address: ContractAddress;
  readonly stakingToken: ContractAddress;
  readonly rewardToken: ContractAddress;
  readonly voter: ContractAddress;
  readonly beneficialReceipts: SavingsAmount<"sMUSD">;
  readonly custodyReceipts: SavingsAmount<"sMUSD">;
  readonly totalStakedReceipts: SavingsAmount<"sMUSD">;
  /** Reward token identity is read from this gauge; no implicit MEZO assumption. */
  readonly earnedRewards: SavingsReadValue<SavingsAmount<"gauge-reward-token">>;
  /** This belongs to voters, not the account's Savings yield. */
  readonly cachedVoterRevenue: SavingsReadValue<SavingsAmount<"MUSD">>;
}
export interface SavingsSnapshot {
  readonly coordinate: ReadCoordinate;
  readonly account: ContractAddress;
  readonly savings: ContractAddress;
  readonly evidence: Readonly<{
    inputDigest: string;
    verifiedAt: string;
    reviewAfter: string;
    supportStatus: "proposed";
    reviewStatus: string;
  }>;
  readonly global: Readonly<{
    principalSupply: SavingsAmount<"sMUSD">;
    pendingYield: SavingsAmount<"MUSD">;
    yieldIndex: bigint;
    gaugeYieldClaimCap: SavingsAmount<"MUSD">;
  }>;
  readonly wallet: SavingsReadValue<SavingsWallet>;
  readonly strategy: SavingsReadValue<SavingsStrategy>;
  readonly converter: SavingsReadValue<SavingsConverter>;
  readonly gauge: SavingsReadValue<SavingsGauge>;
  readonly beneficialPrincipal: SavingsReadValue<SavingsAmount<"sMUSD">>;
}
export interface SavingsReader {
  read(input: {
    readonly account: ContractAddress;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<SavingsSnapshot>>;
}
