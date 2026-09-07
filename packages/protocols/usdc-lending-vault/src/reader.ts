import { getNetwork } from "@mezo-dev-kit/chains";
import { ContractRegistryError } from "@mezo-dev-kit/contracts";
import { CoreReadError, createCoreReadClient } from "@mezo-dev-kit/core";
import { createLendingReader, LendingReadError } from "@mezo-dev-kit/musdc-lending";
import type { LendingAbiValue } from "@mezo-dev-kit/musdc-lending";
import {
  amount,
  calculateVaultHarvest,
  previewVaultConversion,
  uint,
  wrapperToVaultShares,
} from "./accounting.ts";
import { VaultReadError } from "./errors.ts";
import { VAULT_MODEL as MODEL } from "./model.generated.ts";
import { address, attempt, optional, readValue, same, tuple } from "./reads.ts";
import { verifyRole } from "./reads.ts";
import type { VaultReader, VaultReaderConfig, VaultSnapshot } from "./types.ts";

export function createVaultReader(config: VaultReaderConfig): Readonly<VaultReader> {
  if (config?.networkId !== MODEL.networkId)
    throw new VaultReadError("UnsupportedNetwork", "networkId");
  const lending = createLendingReader(config);
  const core = createCoreReadClient({
    network: getNetwork(config.networkId),
    registry: config.registry,
    transport: config.transport,
  });
  async function read(input: Parameters<VaultReader["read"]>[0]): Promise<Readonly<VaultSnapshot>> {
    const account = address(input?.account, "account"),
      previewAssets = uint(input.previewAssets, "previewAssets"),
      previewShares = uint(input.previewShares, "previewShares");
    await core.assertChain();
    const blockNumber = uint(
      input.blockNumber ?? (await config.transport.getBlockNumber()),
      "blockNumber",
    );
    const resolve = (contractId: Parameters<typeof config.registry.resolve>[0]["contractId"]) =>
      config.registry.resolve({ contractId, networkId: config.networkId, blockNumber });
    const wrapper = resolve("vaults.usdc-lending-wrapper"),
      adapter = resolve("vaults.usdc-lending-market-adapter"),
      morpho = resolve("lending.morpho"),
      voter = resolve("incentives.pools-voter");
    const underlyingMarket = await lending.read({
      account: adapter.address,
      blockNumber,
      maxPriceAgeSeconds: input.maxPriceAgeSeconds,
    });
    const { coordinate, asOf } = underlyingMarket;
    if (underlyingMarket.marketId !== MODEL.marketId)
      throw new VaultReadError("TopologyMismatch", "marketId");
    const slot = await config.transport.getStorage({
      ...coordinate,
      address: wrapper.address,
      slot: MODEL.implementationSlot,
    });
    if (
      typeof slot !== "string" ||
      !/^0x0{24}[0-9a-fA-F]{40}$/.test(slot) ||
      !wrapper.implementationAddress
    )
      throw new VaultReadError("InvalidValue", "wrapper implementation");
    same(`0x${slot.slice(-40)}`, wrapper.implementationAddress, "wrapper implementation");
    await Promise.all([
      verifyRole(config, coordinate, wrapper.implementationAddress, "receipt-wrapper"),
      verifyRole(config, coordinate, adapter.address, "morpho-market-adapter"),
    ]);
    const w = (name: string, args: readonly LendingAbiValue[] = []) =>
      readValue(config, coordinate, wrapper.address, wrapper.readAbi, name, args);
    const a = (name: string, args: readonly LendingAbiValue[] = []) =>
      readValue(config, coordinate, adapter.address, adapter.readAbi, name, args);
    const [vaultRaw, gaugeRaw, yieldToken, parentVault, asset, morphoRaw, marketCount, marketId] =
      await Promise.all([
        w("vault"),
        w("gauge"),
        w("yieldToken"),
        a("parentVault"),
        a("asset"),
        a("morpho"),
        a("marketIdsLength"),
        a("marketIds", [0n]),
      ]);
    const vault = address(vaultRaw, "vault"),
      gaugeAddress = address(gaugeRaw, "gauge");
    same(yieldToken, vault, "yieldToken");
    same(parentVault, vault, "parentVault");
    same(asset, MODEL.loanToken, "adapter asset");
    same(morphoRaw, morpho.address, "adapter morpho");
    if (
      uint(marketCount, "marketIdsLength") !== 1n ||
      typeof marketId !== "string" ||
      marketId.toLowerCase() !== MODEL.marketId
    )
      throw new VaultReadError("TopologyMismatch", "adapter market set");
    if (account === gaugeAddress || account === wrapper.address || account === adapter.address)
      throw new VaultReadError("InvalidValue", "account is protocol custody");
    await verifyRole(config, coordinate, vault, "vault-v2");
    const v = (name: string, args: readonly LendingAbiValue[] = []) =>
      readValue(config, coordinate, vault, MODEL.profiles["vault-v2"].readAbi, name, args);
    const [vaultAsset, adaptersLength, firstAdapter, liquidityAdapter, virtualRaw] =
      await Promise.all([
        v("asset"),
        v("adaptersLength"),
        v("adapters", [0n]),
        v("liquidityAdapter"),
        v("virtualShares"),
      ]);
    same(vaultAsset, MODEL.loanToken, "vault asset");
    same(firstAdapter, adapter.address, "vault adapter");
    same(liquidityAdapter, adapter.address, "liquidity adapter");
    if (uint(adaptersLength, "adaptersLength") !== 1n)
      throw new VaultReadError("TopologyMismatch", "adapter queue");
    const virtualShares = uint(virtualRaw, "virtualShares");
    if (virtualShares !== 10n ** (18n - BigInt(MODEL.assetDecimals)))
      throw new VaultReadError("TopologyMismatch", "virtualShares");
    const [supplyRaw, balanceRaw, yieldRaw, lastRaw] = await Promise.all([
      w("totalSupply"),
      v("balanceOf", [wrapper.address]),
      w("accumulatedYield"),
      w("lastShareRatio"),
    ]);
    const supply = uint(supplyRaw, "receiptSupply"),
      balance = uint(balanceRaw, "wrapper vault shares"),
      accumulated = uint(yieldRaw, "accumulatedYield"),
      lastShareRatio = uint(lastRaw, "lastShareRatio");
    if (accumulated > balance)
      throw new VaultReadError("TopologyMismatch", "yield exceeds custody");
    const userShares = balance - accumulated;
    const [vaultState, adapterAssets, idleLiquidity, walletReceipts, walletVaultShares, gauge] =
      await Promise.all([
        optional("vaultState", async () => {
          const [totalSupplyRaw, accrual, totalAssets] = await Promise.all([
            v("totalSupply"),
            v("accrueInterestView"),
            v("totalAssets"),
          ]);
          const result = tuple(accrual, 3, "accrueInterestView");
          const newTotalAssets = uint(result[0], "newTotalAssets");
          if (uint(totalAssets, "totalAssets") !== newTotalAssets)
            throw new VaultReadError("TopologyMismatch", "accrued totalAssets");
          const totalSupply = uint(totalSupplyRaw, "vault totalSupply");
          if (balance > totalSupply)
            throw new VaultReadError("TopologyMismatch", "wrapper shares exceed vault supply");
          return {
            newTotalAssets,
            totalSupply,
            performanceFeeShares: uint(result[1], "performanceFeeShares"),
            managementFeeShares: uint(result[2], "managementFeeShares"),
            virtualShares,
          };
        }),
        optional("adapterAssets", async () =>
          amount("mUSDC", uint(await a("realAssets"), "adapter realAssets")),
        ),
        optional("idleLiquidity", async () =>
          amount(
            "mUSDC",
            uint(
              await config.transport.getTokenBalance({
                ...coordinate,
                token: MODEL.loanToken,
                account: vault,
              }),
              "idleLiquidity",
            ),
          ),
        ),
        optional("walletReceipts", async () => {
          const value = uint(await w("balanceOf", [account]), "walletReceipts");
          if (value > supply)
            throw new VaultReadError("TopologyMismatch", "wallet receipts exceed supply");
          return amount("vault-wrapper-receipts", value);
        }),
        optional("walletVaultShares", async () =>
          amount("VaultV2-shares", uint(await v("balanceOf", [account]), "walletVaultShares")),
        ),
        optional("gauge", async () => {
          await verifyRole(config, coordinate, gaugeAddress, "vault-gauge");
          const g = (name: string, args: readonly LendingAbiValue[] = []) =>
            readValue(
              config,
              coordinate,
              gaugeAddress,
              MODEL.profiles["vault-gauge"].readAbi,
              name,
              args,
            );
          const [stakingToken, gaugeVoter, rewardTokenRaw, gaugeTotal, custodyRaw, voterGauge] =
            await Promise.all([
              g("stakingToken"),
              g("voter"),
              g("rewardToken"),
              g("totalSupply"),
              w("balanceOf", [gaugeAddress]),
              readValue(config, coordinate, voter.address, voter.readAbi, "gauges", [
                wrapper.address,
              ]),
            ]);
          same(stakingToken, wrapper.address, "gauge staking token");
          same(gaugeVoter, voter.address, "gauge voter");
          same(voterGauge, gaugeAddress, "voter gauge");
          const rewardToken = address(rewardTokenRaw, "rewardToken"),
            totalStake = uint(gaugeTotal, "gauge totalStake"),
            custody = uint(custodyRaw, "gauge custody");
          if (custody < totalStake || custody > supply)
            throw new VaultReadError("TopologyMismatch", "gauge custody");
          const [accountStake, earnedRewards, redirectedRevenue] = await Promise.all([
            optional("accountStake", async () => {
              const value = uint(await g("balanceOf", [account]), "gauge account stake");
              if (value > totalStake) throw new VaultReadError("TopologyMismatch", "account stake");
              return amount("vault-wrapper-receipts", value);
            }),
            optional("earnedRewards", async () =>
              amount("gauge-reward-token", uint(await g("earned", [account]), "earnedRewards")),
            ),
            optional("redirectedRevenue", async () =>
              amount("VaultV2-shares", uint(await g("fees"), "gauge fees")),
            ),
          ]);
          return {
            address: gaugeAddress,
            custody: amount("vault-wrapper-receipts", custody),
            totalStake: amount("vault-wrapper-receipts", totalStake),
            accountStake,
            rewardToken,
            earnedRewards,
            redirectedRevenue,
          };
        }),
      ]);
    if (
      vaultState.status === "available" &&
      walletVaultShares.status === "available" &&
      walletVaultShares.value.baseUnits + balance > vaultState.value.totalSupply
    )
      throw new VaultReadError("TopologyMismatch", "vault share ownership exceeds supply");
    const allocationReconciled = await optional("allocationReconciled", async () => {
      const position = underlyingMarket.position,
        assets = underlyingMarket.supplyAssets;
      if (
        position.status !== "available" ||
        assets.status !== "available" ||
        adapterAssets.status !== "available"
      )
        throw new VaultReadError("ReadUnavailable", "allocation inputs");
      const ownedShares = uint(await a("supplyShares", [MODEL.marketId]), "adapter supplyShares");
      if (
        position.value.supplyShares.baseUnits !== ownedShares ||
        position.value.borrowShares.baseUnits !== 0n ||
        position.value.collateral.baseUnits !== 0n ||
        assets.value.baseUnits !== adapterAssets.value.baseUnits
      )
        throw new VaultReadError("TopologyMismatch", "adapter Morpho position");
      return true;
    });
    const harvest = await optional("harvest", async () => {
      if (vaultState.status !== "available")
        throw new VaultReadError("ReadUnavailable", "vaultState");
      const ratio = uint(await v("convertToAssets", [10n ** 18n]), "current share ratio");
      if (ratio !== previewVaultConversion(vaultState.value, "redeem", 10n ** 18n))
        throw new VaultReadError("TopologyMismatch", "current share ratio");
      const value = calculateVaultHarvest({
        userVaultShares: userShares,
        currentRatio: ratio,
        lastShareRatio,
        gaugeSet: true,
      });
      return {
        yieldShares: amount("VaultV2-shares", value.yieldShares),
        newLastShareRatio: value.newLastShareRatio,
        userVaultSharesAfterHarvest: amount("VaultV2-shares", userShares - value.yieldShares),
      };
    });
    const beneficialReceipts = attempt("beneficialReceipts", () => {
      if (
        walletReceipts.status !== "available" ||
        gauge.status !== "available" ||
        gauge.value.accountStake.status !== "available"
      )
        throw new VaultReadError("ReadUnavailable", "receipt ownership");
      const owned = uint(walletReceipts.value.baseUnits + gauge.value.accountStake.value.baseUnits);
      if (owned > supply || walletReceipts.value.baseUnits + gauge.value.custody.baseUnits > supply)
        throw new VaultReadError("TopologyMismatch", "receipt ownership exceeds supply");
      return amount("vault-wrapper-receipts", owned);
    });
    const receiptClaim = attempt("receiptClaim", () => {
      if (beneficialReceipts.status !== "available" || harvest.status !== "available")
        throw new VaultReadError("ReadUnavailable", "receipt claim inputs");
      return amount(
        "VaultV2-shares",
        wrapperToVaultShares(
          beneficialReceipts.value.baseUnits,
          supply,
          harvest.value.userVaultSharesAfterHarvest.baseUnits,
        ),
      );
    });
    const receiptAssets = attempt("receiptAssets", () => {
      if (receiptClaim.status !== "available" || vaultState.status !== "available")
        throw new VaultReadError("ReadUnavailable", "receipt assets inputs");
      return amount(
        "mUSDC",
        previewVaultConversion(vaultState.value, "redeem", receiptClaim.value.baseUnits),
      );
    });
    const previews = await optional("previews", async () => {
      if (vaultState.status !== "available")
        throw new VaultReadError("ReadUnavailable", "vaultState");
      const raw = await Promise.all([
        v("previewDeposit", [previewAssets]),
        v("previewMint", [previewShares]),
        v("previewWithdraw", [previewAssets]),
        v("previewRedeem", [previewShares]),
      ]);
      const operations = ["deposit", "mint", "withdraw", "redeem"] as const;
      for (const [i, operation] of operations.entries())
        if (
          uint(raw[i], operation) !==
          previewVaultConversion(
            vaultState.value,
            operation,
            operation === "deposit" || operation === "withdraw" ? previewAssets : previewShares,
          )
        )
          throw new VaultReadError("TopologyMismatch", `${operation} preview`);
      return {
        depositShares: amount("VaultV2-shares", uint(raw[0])),
        mintAssets: amount("mUSDC", uint(raw[1])),
        withdrawShares: amount("VaultV2-shares", uint(raw[2])),
        redeemAssets: amount("mUSDC", uint(raw[3])),
        inputAssets: amount("mUSDC", previewAssets),
        inputShares: amount("VaultV2-shares", previewShares),
      };
    });
    await core.assertChain();
    const final = await config.transport.getBlock(blockNumber);
    if (
      final?.number !== blockNumber ||
      typeof final.hash !== "string" ||
      final.hash.toLowerCase() !== coordinate.blockHash.toLowerCase() ||
      final.timestamp !== asOf
    )
      throw new VaultReadError("InconsistentCoordinate", "final block");
    return Object.freeze({
      coordinate,
      asOf,
      account,
      vault,
      wrapper: wrapper.address,
      adapter: adapter.address,
      evidence: Object.freeze({
        inputDigest: MODEL.inputDigest,
        verifiedAt: MODEL.verifiedAt,
        reviewAfter: MODEL.reviewAfter,
      }),
      underlyingMarket,
      vaultState,
      adapterAssets,
      allocationReconciled,
      idleLiquidity,
      wrapperState: Object.freeze({
        receiptSupply: amount("vault-wrapper-receipts", supply),
        vaultShareBalance: amount("VaultV2-shares", balance),
        accumulatedYield: amount("VaultV2-shares", accumulated),
        userVaultShares: amount("VaultV2-shares", userShares),
        lastShareRatio,
      }),
      harvest,
      walletReceipts,
      walletVaultShares,
      gauge,
      beneficialReceipts,
      receiptClaim,
      receiptAssets,
      previews,
    });
  }
  return Object.freeze({
    read: async (input: Parameters<VaultReader["read"]>[0]) => {
      try {
        return await read(input);
      } catch (cause) {
        if (
          cause instanceof VaultReadError ||
          cause instanceof LendingReadError ||
          cause instanceof CoreReadError ||
          cause instanceof ContractRegistryError
        )
          throw cause;
        throw new VaultReadError("ReadUnavailable", "snapshot", { cause });
      }
    },
  });
}
