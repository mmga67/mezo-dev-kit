import { getNetwork } from "@mezo-dev-kit/chains";
import { ContractRegistryError } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { CoreReadError, createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadCall, CoherentReadResult } from "@mezo-dev-kit/core";
import {
  accrueLendingMarket,
  amount,
  calculateLendingHealth,
  lendingToAssets,
  uint,
} from "./accounting.ts";
import type { LendingMarketState } from "./accounting.ts";
import { LendingReadError } from "./errors.ts";
import { LENDING_MODEL as MODEL } from "./model.generated.ts";
import {
  address,
  attempt,
  available,
  blockTime,
  encode,
  readCall,
  sameAddress,
  tuple,
  unavailable,
  verifyRuntime,
} from "./reads.ts";
import type {
  LendingAbiValue,
  LendingCall,
  LendingReader,
  LendingReaderConfig,
  LendingSnapshot,
} from "./types.ts";

export function createLendingReader(config: LendingReaderConfig): Readonly<LendingReader> {
  if (
    !config?.codec ||
    typeof config.codec.encodeRead !== "function" ||
    typeof config.codec.decodeRead !== "function" ||
    !config.transport ||
    typeof config.transport.getCode !== "function" ||
    typeof config.transport.getStorage !== "function" ||
    typeof config.transport.getTokenBalance !== "function"
  )
    throw new LendingReadError("InvalidValue", "config");
  if (config.networkId !== MODEL.networkId)
    throw new LendingReadError("UnsupportedNetwork", "networkId");
  const network = getNetwork(config.networkId);
  const core = createCoreReadClient({
    network,
    registry: config.registry,
    transport: config.transport,
  });
  async function read(
    input: Parameters<LendingReader["read"]>[0],
  ): Promise<Readonly<LendingSnapshot>> {
    const account = address(input?.account, "account");
    const maxAge = uint(input.maxPriceAgeSeconds, "maxPriceAgeSeconds");
    await core.assertChain();
    const blockNumber = uint(
      input.blockNumber ?? (await config.transport.getBlockNumber()),
      "blockNumber",
    );
    const resolve = (contractId: keyof typeof MODEL.roots) =>
      config.registry.resolve({ contractId, networkId: network.id, blockNumber });
    const morpho = resolve("lending.morpho"),
      irm = resolve("lending.adaptive-curve-irm"),
      oracle = resolve("lending.musdc-btc-oracle"),
      skip = resolve("oracle.skip-btc-usd");
    const descriptions = new Map<string, LendingCall>();
    function call(
      id: string,
      contract: ResolvedContract,
      name: string,
      args: readonly LendingAbiValue[] = [],
      required = true,
    ): CoreReadCall {
      const description = readCall(contract.readAbi, name, args);
      descriptions.set(id, description);
      return { id, contractId: contract.contractId, data: encode(config, description), required };
    }
    // Both batches pin the caller's block and compare their returned hashes.
    const initial = await core.readCoherent({
      blockNumber,
      calls: [
        call("params", morpho, "idToMarketParams", [MODEL.marketId]),
        call("market", morpho, "market", [MODEL.marketId]),
        call("position", morpho, "position", [MODEL.marketId, account], false),
        call("feeRecipient", morpho, "feeRecipient", [], false),
        call("morpho", irm, "MORPHO"),
        call("feed", oracle, "priceFeed"),
        call("scale", oracle, "scaleFactor"),
        call("loanDecimals", oracle, "loanDecimals"),
        call("collateralDecimals", oracle, "collateralDecimals"),
        call("feedDecimals", skip, "decimals"),
      ],
    });
    function value(batch: CoherentReadResult, id: string): unknown {
      const item = batch.reads[id],
        description = descriptions.get(id);
      if (item?.status !== "available" || !description)
        throw new LendingReadError("ReadUnavailable", id);
      try {
        return config.codec.decodeRead({ ...description, data: item.value });
      } catch (cause) {
        throw new LendingReadError("InvalidValue", id, { cause });
      }
    }
    const { coordinate } = initial;
    const block = await config.transport.getBlock(blockNumber);
    if (
      block?.number !== blockNumber ||
      typeof block.hash !== "string" ||
      block.hash.toLowerCase() !== coordinate.blockHash.toLowerCase()
    )
      throw new LendingReadError("InconsistentCoordinate", "block");
    const asOf = blockTime(block.timestamp);
    const params = tuple(value(initial, "params"), 5, "marketParams");
    sameAddress(params[0], MODEL.loanToken, "loanToken");
    sameAddress(params[1], MODEL.collateralToken, "collateralToken");
    sameAddress(params[2], oracle.address, "oracle");
    sameAddress(params[3], irm.address, "irm");
    if (uint(params[4], "lltv") !== BigInt(MODEL.lltv))
      throw new LendingReadError("TopologyMismatch", "lltv");
    sameAddress(value(initial, "morpho"), morpho.address, "irm.MORPHO");
    sameAddress(value(initial, "feed"), skip.address, "oracle.priceFeed");
    const scale = uint(value(initial, "scale"), "scaleFactor"),
      loanDecimals = uint(value(initial, "loanDecimals"), "loanDecimals", 8),
      collateralDecimals = uint(value(initial, "collateralDecimals"), "collateralDecimals", 8),
      feedDecimals = uint(value(initial, "feedDecimals"), "feedDecimals", 8);
    if (
      scale !== BigInt(MODEL.oracle.scaleFactor) ||
      loanDecimals !== BigInt(MODEL.oracle.loanDecimals) ||
      collateralDecimals !== BigInt(MODEL.oracle.collateralDecimals) ||
      feedDecimals > 77n ||
      scale * 10n ** feedDecimals !==
        (BigInt(MODEL.constants.ORACLE_PRICE_SCALE) * 10n ** loanDecimals) /
          10n ** collateralDecimals
    )
      throw new LendingReadError("TopologyMismatch", "oracle scaling");
    const raw = tuple(value(initial, "market"), 6, "market").map((entry) =>
      uint(entry, "market", 128),
    );
    const storedMarket: LendingMarketState = Object.freeze({
      totalSupplyAssets: raw[0]!,
      totalSupplyShares: raw[1]!,
      totalBorrowAssets: raw[2]!,
      totalBorrowShares: raw[3]!,
      lastUpdate: raw[4]!,
      fee: raw[5]!,
    });
    // Zero-rate validation also rejects impossible totals, time, and fee bounds.
    accrueLendingMarket(storedMarket, 0n, asOf);
    await Promise.all([
      verifyRuntime(config, coordinate, morpho, "lending.morpho"),
      verifyRuntime(config, coordinate, irm, "lending.adaptive-curve-irm"),
      verifyRuntime(config, coordinate, oracle, "lending.musdc-btc-oracle"),
      verifyRuntime(config, coordinate, skip, "oracle.skip-btc-usd"),
    ]);
    const current = await core.readCoherent({
      blockNumber,
      calls: [
        call(
          "rate",
          irm,
          "borrowRateView",
          [
            [
              MODEL.loanToken,
              MODEL.collateralToken,
              oracle.address,
              irm.address,
              BigInt(MODEL.lltv),
            ],
            raw,
          ],
          false,
        ),
        call("price", oracle, "price", [], false),
        call("round", skip, "latestRoundData", [], false),
      ],
    });
    if (current.coordinate.blockHash.toLowerCase() !== coordinate.blockHash.toLowerCase())
      throw new LendingReadError("InconsistentCoordinate", "second batch");
    const borrowRate = attempt("borrowRate", () => uint(value(current, "rate"), "borrowRate"));
    const accruedMarket = attempt("accruedMarket", () => {
      if (asOf === storedMarket.lastUpdate || storedMarket.totalBorrowAssets === 0n)
        return accrueLendingMarket(storedMarket, 0n, asOf);
      if (borrowRate.status !== "available")
        throw new LendingReadError("ReadUnavailable", "borrowRate");
      return accrueLendingMarket(storedMarket, borrowRate.value, asOf);
    });
    const position = attempt("position", () => {
      const p = tuple(value(initial, "position"), 3, "position");
      const supplyShares = uint(p[0], "supplyShares"),
        borrowShares = uint(p[1], "borrowShares", 128),
        collateral = uint(p[2], "collateral", 128);
      if (
        supplyShares > storedMarket.totalSupplyShares ||
        borrowShares > storedMarket.totalBorrowShares
      )
        throw new LendingReadError("TopologyMismatch", "position totals");
      return {
        supplyShares: amount("Morpho-supply-shares", supplyShares),
        borrowShares: amount("Morpho-borrow-shares", borrowShares),
        collateral: amount("BTC-wei", collateral),
      };
    });
    const price = attempt("price", () => {
      const datum = uint(value(current, "price"), "oracle.price");
      const round = tuple(value(current, "round"), 5, "latestRoundData");
      uint(round[0], "roundId", 80);
      uint(round[2], "startedAt");
      uint(round[4], "answeredInRound", 80);
      const answer = uint(round[1], "answer"),
        publishedAt = uint(round[3], "updatedAt");
      if (datum === 0n || answer === 0n) throw new LendingReadError("InvalidValue", "price");
      if (datum !== uint(answer * scale, "normalizedPrice"))
        throw new LendingReadError("PriceDisagreement", "oracle/Skip");
      if (publishedAt === 0n) throw new LendingReadError("PriceMissingTime", "updatedAt");
      if (publishedAt > asOf) throw new LendingReadError("PriceFuture", "updatedAt");
      if (asOf - publishedAt > maxAge) throw new LendingReadError("PriceStale", "updatedAt");
      return {
        sourceClass: "protocol-oracle-state" as const,
        price: datum,
        publishedAt,
        asOf,
        maxAgeSeconds: maxAge,
      };
    });
    const supplyAssets = attempt("supplyAssets", () => {
      if (position.status !== "available" || accruedMarket.status !== "available")
        throw new LendingReadError("ReadUnavailable", "supplyAssets.inputs");
      let shares = position.value.supplyShares.baseUnits;
      if (accruedMarket.value.feeShares !== 0n) {
        const recipient = value(initial, "feeRecipient");
        // A zero fee recipient is valid on Morpho; it still receives the fee shares.
        if (typeof recipient !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(recipient))
          throw new LendingReadError("InvalidValue", "feeRecipient");
        if (recipient.toLowerCase() === account)
          shares = uint(shares + accruedMarket.value.feeShares, "fee recipient shares");
      }
      return amount(
        "mUSDC",
        lendingToAssets(
          shares,
          accruedMarket.value.totalSupplyAssets,
          accruedMarket.value.totalSupplyShares,
          "down",
        ),
      );
    });
    const debt = attempt("debt", () => {
      if (position.status !== "available")
        throw new LendingReadError("ReadUnavailable", "position");
      if (position.value.borrowShares.baseUnits === 0n) return amount("mUSDC-debt", 0n);
      if (accruedMarket.status !== "available")
        throw new LendingReadError("ReadUnavailable", "accruedMarket");
      return amount(
        "mUSDC-debt",
        lendingToAssets(
          position.value.borrowShares.baseUnits,
          accruedMarket.value.totalBorrowAssets,
          accruedMarket.value.totalBorrowShares,
          "up",
        ),
      );
    });
    const health = attempt("health", () => {
      if (debt.status !== "available" || position.status !== "available")
        throw new LendingReadError("ReadUnavailable", "health.inputs");
      if (debt.value.baseUnits === 0n)
        return { healthy: true, maxBorrowAssets: null, reason: "zero-debt" as const };
      if (price.status !== "available")
        throw new LendingReadError(price.error.code, price.error.field);
      return {
        ...calculateLendingHealth(
          position.value.collateral.baseUnits,
          price.value.price,
          BigInt(MODEL.lltv),
          debt.value.baseUnits,
        ),
        reason: "evaluated" as const,
      };
    });
    let tokenLiquidity: LendingSnapshot["tokenLiquidity"];
    try {
      tokenLiquidity = available(
        amount(
          "mUSDC",
          uint(
            await config.transport.getTokenBalance({
              ...coordinate,
              token: MODEL.loanToken,
              account: morpho.address,
            }),
            "tokenLiquidity",
          ),
        ),
      );
    } catch (error) {
      tokenLiquidity = unavailable(error, "tokenLiquidity");
    }
    await core.assertChain();
    const final = await config.transport.getBlock(blockNumber);
    if (
      final?.number !== blockNumber ||
      typeof final.hash !== "string" ||
      final.hash.toLowerCase() !== coordinate.blockHash.toLowerCase() ||
      final.timestamp !== asOf
    )
      throw new LendingReadError("InconsistentCoordinate", "final block");
    return Object.freeze({
      coordinate,
      asOf,
      account,
      marketId: MODEL.marketId,
      evidence: Object.freeze({
        inputDigest: MODEL.inputDigest,
        verifiedAt: MODEL.verifiedAt,
        reviewAfter: MODEL.reviewAfter,
      }),
      storedMarket,
      borrowRate,
      accruedMarket,
      position,
      price,
      supplyAssets,
      debt,
      health,
      tokenLiquidity,
      accountingLiquidity: amount(
        "mUSDC",
        storedMarket.totalSupplyAssets - storedMarket.totalBorrowAssets,
      ),
    });
  }
  return Object.freeze({
    read: async (input: Parameters<LendingReader["read"]>[0]) => {
      try {
        return await read(input);
      } catch (cause) {
        if (
          cause instanceof LendingReadError ||
          cause instanceof CoreReadError ||
          cause instanceof ContractRegistryError
        )
          throw cause;
        throw new LendingReadError("ReadUnavailable", "snapshot", { cause });
      }
    },
  });
}
