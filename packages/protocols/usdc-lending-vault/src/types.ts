import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAddress, ContractId, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreTransportReadRequest, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingCodec, LendingSnapshot, LendingTransport } from "@mezo-dev-kit/musdc-lending";
import type { VaultAmount, VaultPreviewState } from "./accounting.ts";
import type { VaultReadErrorCode } from "./errors.ts";
export type VaultTransportReadRequest = Omit<CoreTransportReadRequest, "contractId"> & {
  readonly contractId?: ContractId;
};
export interface VaultTransport extends Omit<LendingTransport, "read"> {
  read(request: Readonly<VaultTransportReadRequest>): unknown;
}
export interface VaultReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: VaultTransport;
  readonly codec: LendingCodec;
}
export type VaultReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: VaultReadErrorCode; field: string }>;
    }>;
export interface VaultGaugeState {
  readonly address: ContractAddress;
  readonly custody: VaultAmount<"vault-wrapper-receipts">;
  readonly totalStake: VaultAmount<"vault-wrapper-receipts">;
  readonly accountStake: VaultReadValue<VaultAmount<"vault-wrapper-receipts">>;
  readonly rewardToken: ContractAddress;
  readonly earnedRewards: VaultReadValue<VaultAmount<"gauge-reward-token">>;
  readonly redirectedRevenue: VaultReadValue<VaultAmount<"VaultV2-shares">>;
}
export interface VaultSnapshot {
  readonly coordinate: ReadCoordinate;
  readonly asOf: bigint;
  readonly account: ContractAddress;
  readonly vault: ContractAddress;
  readonly wrapper: ContractAddress;
  readonly adapter: ContractAddress;
  readonly evidence: Readonly<{ inputDigest: string; verifiedAt: string; reviewAfter: string }>;
  readonly underlyingMarket: Readonly<LendingSnapshot>;
  readonly vaultState: VaultReadValue<VaultPreviewState>;
  readonly adapterAssets: VaultReadValue<VaultAmount<"mUSDC">>;
  readonly allocationReconciled: VaultReadValue<boolean>;
  readonly idleLiquidity: VaultReadValue<VaultAmount<"mUSDC">>;
  readonly wrapperState: Readonly<{
    receiptSupply: VaultAmount<"vault-wrapper-receipts">;
    vaultShareBalance: VaultAmount<"VaultV2-shares">;
    accumulatedYield: VaultAmount<"VaultV2-shares">;
    userVaultShares: VaultAmount<"VaultV2-shares">;
    lastShareRatio: bigint;
  }>;
  readonly harvest: VaultReadValue<{
    yieldShares: VaultAmount<"VaultV2-shares">;
    newLastShareRatio: bigint;
    userVaultSharesAfterHarvest: VaultAmount<"VaultV2-shares">;
  }>;
  readonly walletReceipts: VaultReadValue<VaultAmount<"vault-wrapper-receipts">>;
  readonly walletVaultShares: VaultReadValue<VaultAmount<"VaultV2-shares">>;
  readonly gauge: VaultReadValue<VaultGaugeState>;
  readonly beneficialReceipts: VaultReadValue<VaultAmount<"vault-wrapper-receipts">>;
  readonly receiptClaim: VaultReadValue<VaultAmount<"VaultV2-shares">>;
  readonly receiptAssets: VaultReadValue<VaultAmount<"mUSDC">>;
  readonly previews: VaultReadValue<
    Readonly<{
      depositShares: VaultAmount<"VaultV2-shares">;
      mintAssets: VaultAmount<"mUSDC">;
      withdrawShares: VaultAmount<"VaultV2-shares">;
      redeemAssets: VaultAmount<"mUSDC">;
      inputAssets: VaultAmount<"mUSDC">;
      inputShares: VaultAmount<"VaultV2-shares">;
    }>
  >;
}
export interface VaultReader {
  read(input: {
    readonly account: ContractAddress;
    readonly blockNumber?: bigint;
    readonly maxPriceAgeSeconds: bigint;
    readonly previewAssets: bigint;
    readonly previewShares: bigint;
  }): Promise<Readonly<VaultSnapshot>>;
}
