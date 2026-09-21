import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAddress, ContractId, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreTransportReadRequest, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingCodec, LendingSnapshot, LendingTransport } from "@mezo-dev-kit/musdc-lending";
import type { VaultAmount, VaultPreviewState } from "./accounting.ts";
import type { VaultReadErrorCode } from "./errors.ts";
export type VaultTransportReadRequest = Omit<CoreTransportReadRequest, "contractId"> & {
  readonly contractId?: ContractId;
};
/**
 * Lending-compatible transport extended for dynamically discovered vault roles at an exact
 * coordinate.
 */
export interface VaultTransport extends Omit<LendingTransport, "read"> {
  /**
   * Read an exact coordinate and target, including discovered roles without a static contract
   * ID; return untrusted provider output.
   */
  read(request: Readonly<VaultTransportReadRequest>): unknown;
}
/**
 * Explicit vault/lending registry, transport and codec ports; no provider URL or signer is
 * inferred.
 */
export interface VaultReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: VaultTransport;
  readonly codec: LendingCodec;
}
/**
 * Available value or explicit optional failure. Failed previews and missing balances are not
 * represented by zero.
 */
export type VaultReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: VaultReadErrorCode; field: string }>;
    }>;
/**
 * Gauge receipt custody, beneficial stake and separate streamed rewards. Redirected vault-share
 * revenue is not account principal.
 */
export interface VaultGaugeState {
  readonly address: ContractAddress;
  readonly custody: VaultAmount<"vault-wrapper-receipts">;
  readonly totalStake: VaultAmount<"vault-wrapper-receipts">;
  readonly accountStake: VaultReadValue<VaultAmount<"vault-wrapper-receipts">>;
  readonly rewardToken: ContractAddress;
  readonly earnedRewards: VaultReadValue<VaultAmount<"gauge-reward-token">>;
  readonly redirectedRevenue: VaultReadValue<VaultAmount<"VaultV2-shares">>;
}
/**
 * Coherent vault/lending/wrapper/gauge state with availability per component. Keep asset, share
 * and receipt values separate.
 */
export interface VaultSnapshot {
  readonly coordinate: ReadCoordinate;
  /**
   * Unix seconds of the selected block, shared with the underlying lending snapshot.
   */
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
/**
 * Signer-free vault inspection with explicit preview asset/share inputs and price-age policy.
 */
export interface VaultReader {
  /**
   * Read vault/lending/wrapper/gauge state and preview the supplied asset/share quantities at
   * one block under the price-age policy.
   */
  read(input: {
    readonly account: ContractAddress;
    readonly blockNumber?: bigint;
    readonly maxPriceAgeSeconds: bigint;
    readonly previewAssets: bigint;
    readonly previewShares: bigint;
  }): Promise<Readonly<VaultSnapshot>>;
}
