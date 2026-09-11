import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractId } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver, ReadCoordinate } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseMinimalProxyImplementation,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import { poolAddress, poolEntry, poolRequire } from "./basic.ts";
import { verifyPoolWriterAssets } from "./assets.ts";
import {
  calculateCLAmounts,
  calculateCLFees,
  getCLTickAtSqrtRatio,
  getCLTickSqrtRatio,
  getCLUsableTicks,
} from "./cl-math.ts";
import type {
  CLGaugeSnapshot,
  CLPoolKey,
  CLPoolReader,
  CLPoolReaderConfig,
  CLPosition,
  CLTick,
} from "./cl-types.ts";
const zero = parseAddress(`0x${"0".repeat(40)}`);
function boolean(value: unknown): boolean {
  poolRequire(typeof value === "boolean", "IdentityMismatch", "CL boolean response required");
  return value;
}
function signed(value: unknown, bits: number): bigint {
  poolRequire(
    typeof value === "bigint" &&
      value >= -(1n << BigInt(bits - 1)) &&
      value < 1n << BigInt(bits - 1),
    "IdentityMismatch",
    "CL signed value out of range",
  );
  return value;
}
export function sortCLPoolKey(input: {
  readonly tokenA: `0x${string}`;
  readonly tokenB: `0x${string}`;
  readonly tickSpacing: number;
}): Readonly<CLPoolKey> {
  const a = poolAddress(input.tokenA),
    b = poolAddress(input.tokenB);
  poolRequire(a !== b, "InvalidInput", "CL tokens must differ");
  getCLUsableTicks(input.tickSpacing);
  return Object.freeze({
    token0: a < b ? a : b,
    token1: a < b ? b : a,
    tickSpacing: input.tickSpacing,
  });
}
export function createCLPoolReader(config: CLPoolReaderConfig): Readonly<CLPoolReader> {
  poolRequire(config.networkId === "mezo-mainnet", "InvalidInput", "CL pools require mainnet");
  const { registry, transport } = config,
    network = getNetwork(config.networkId),
    codec = createAbiCodec(),
    tokens = createTokenReader({ transport });
  return Object.freeze({
    async read(input) {
      const account = poolAddress(input.account),
        key = sortCLPoolKey({
          tokenA: input.key.token0,
          tokenB: input.key.token1,
          tickSpacing: input.key.tickSpacing,
        }),
        suppliedIds = input.tokenIds ?? [],
        suppliedTicks = input.ticks ?? [];
      poolRequire(
        key.token0 === parseAddress(input.key.token0) &&
          key.token1 === parseAddress(input.key.token1),
        "InvalidInput",
        "CL key must be sorted",
      );
      poolRequire(
        Array.isArray(suppliedIds) &&
          suppliedIds.length <= 16 &&
          Array.isArray(suppliedTicks) &&
          suppliedTicks.length <= 32,
        "InvalidInput",
        "CL read budget exceeded",
      );
      const tokenIds = (suppliedIds as readonly bigint[]).map((id) => parseUint(id)),
        tickSet = new Set<number>(suppliedTicks);
      poolRequire(
        new Set(tokenIds).size === tokenIds.length &&
          tokenIds.every((id) => id > 0n) &&
          tickSet.size === suppliedTicks.length,
        "InvalidInput",
        "duplicate CL read inputs",
      );
      for (const tick of tickSet) getCLTickSqrtRatio(tick);
      poolRequire(
        parseUint(await transport.getChainId()) === network.evmChainId,
        "IdentityMismatch",
        "CL chain differs",
      );
      const blockNumber = parseUint(input.blockNumber ?? (await transport.getBlockNumber())),
        block = await transport.getBlock(blockNumber);
      poolRequire(block?.number === blockNumber, "IdentityMismatch", "CL block unavailable");
      const coordinate: Readonly<ReadCoordinate> = Object.freeze({
          networkId: network.id,
          chainId: network.evmChainId,
          blockNumber,
          blockHash: parseHash32(block.hash),
        }),
        timestamp = parseUint(await transport.getBlockTimestamp(coordinate));
      const resolve = (contractId: ContractId) => registry.resolve({ ...coordinate, contractId });
      const factory = resolve("mezo-earn.cl-factory"),
        implementation = resolve("mezo-earn.cl-pool-implementation"),
        manager = resolve("mezo-earn.cl-position-manager"),
        factoryRegistry = resolve("incentives.factory-registry"),
        voter = resolve("incentives.pools-voter"),
        gaugeFactory = resolve("incentives.cl-gauge-factory"),
        gaugeImplementation = resolve("incentives.cl-gauge-implementation");
      for (const contract of [
        factory,
        implementation,
        manager,
        factoryRegistry,
        voter,
        gaugeFactory,
        gaugeImplementation,
      ])
        await verifyContractRuntime({ contract, coordinate, transport });
      const call = async (
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
      ) => {
        const entry = poolEntry(abi, name);
        return codec.decodeFunction(
          entry,
          await transport.read({
            ...coordinate,
            address,
            contractId: factory.contractId,
            data: codec.encodeFunction(entry, args),
          }),
        );
      };
      const one = async (
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
      ) => (await call(address, abi, name, args))[0];
      const pool = parseAddress(
        await one(factory.address, factory.readAbi, "getPool", [
          key.token0,
          key.token1,
          BigInt(key.tickSpacing),
        ]),
      );
      poolRequire(pool !== zero, "UnavailablePool", "CL factory has no pool for this key");
      poolRequire(
        parseMinimalProxyImplementation(await transport.getCode(pool, coordinate)) ===
          implementation.address,
        "IdentityMismatch",
        "CL pool clone differs",
      );
      const poolAbi = implementation.readAbi;
      for (const [address, abi, getter, expected] of [
        [factory.address, factory.readAbi, "poolImplementation", implementation.address],
        [factory.address, factory.readAbi, "factoryRegistry", factoryRegistry.address],
        [factory.address, factory.readAbi, "voter", voter.address],
        [manager.address, manager.readAbi, "factory", factory.address],
        [pool, poolAbi, "factory", factory.address],
        [pool, poolAbi, "factoryRegistry", factoryRegistry.address],
        [pool, poolAbi, "token0", key.token0],
        [pool, poolAbi, "token1", key.token1],
        [gaugeFactory.address, gaugeFactory.readAbi, "implementation", gaugeImplementation.address],
        [gaugeFactory.address, gaugeFactory.readAbi, "voter", voter.address],
        [gaugeFactory.address, gaugeFactory.readAbi, "nft", manager.address],
      ] as const)
        poolRequire(
          parseAddress(await one(address, abi, getter)) === expected,
          "IdentityMismatch",
          `CL graph differs: ${getter}`,
        );
      poolRequire(
        boolean(await one(factory.address, factory.readAbi, "isPool", [pool])) &&
          Number(signed(await one(pool, poolAbi, "tickSpacing"), 24)) === key.tickSpacing,
        "IdentityMismatch",
        "CL factory recognition or spacing differs",
      );
      const factoryApproved = boolean(
          await one(factoryRegistry.address, factoryRegistry.readAbi, "isPoolFactoryApproved", [
            factory.address,
          ]),
        ),
        gaugeAddress = parseAddress(await one(pool, poolAbi, "gauge"));
      let gauge: Readonly<CLGaugeSnapshot> | null = null;
      const gaugeAbi = gaugeImplementation.readAbi;
      if (gaugeAddress !== zero) {
        poolRequire(
          parseMinimalProxyImplementation(await transport.getCode(gaugeAddress, coordinate)) ===
            gaugeImplementation.address &&
            boolean(
              await one(gaugeFactory.address, gaugeFactory.readAbi, "isGauge", [gaugeAddress]),
            ),
          "IdentityMismatch",
          "CL gauge clone or factory differs",
        );
        for (const [address, abi, getter, args, expected] of [
          [pool, poolAbi, "nft", [], manager.address],
          [gaugeAddress, gaugeAbi, "pool", [], pool],
          [gaugeAddress, gaugeAbi, "nft", [], manager.address],
          [gaugeAddress, gaugeAbi, "voter", [], voter.address],
          [gaugeAddress, gaugeAbi, "token0", [], key.token0],
          [gaugeAddress, gaugeAbi, "token1", [], key.token1],
          [voter.address, voter.readAbi, "gauges", [pool], gaugeAddress],
          [voter.address, voter.readAbi, "poolForGauge", [gaugeAddress], pool],
        ] as const)
          poolRequire(
            parseAddress(await one(address, abi, getter, args)) === expected,
            "IdentityMismatch",
            `CL gauge graph differs: ${getter}`,
          );
        const rewardToken = poolAddress(
          await one(gaugeFactory.address, gaugeFactory.readAbi, "rewardToken"),
        );
        poolRequire(
          parseAddress(await one(gaugeAddress, gaugeAbi, "rewardToken")) === rewardToken &&
            Number(signed(await one(gaugeAddress, gaugeAbi, "tickSpacing"), 24)) ===
              key.tickSpacing &&
            boolean(await one(voter.address, voter.readAbi, "isGauge", [gaugeAddress])),
          "IdentityMismatch",
          "CL gauge assets or recognition differ",
        );
        gauge = Object.freeze({
          address: gaugeAddress,
          factory: gaugeFactory.address,
          implementation: gaugeImplementation.address,
          voter: voter.address,
          rewardToken,
          alive: boolean(await one(voter.address, voter.readAbi, "isAlive", [gaugeAddress])),
          stakeCount: parseUint(await one(gaugeAddress, gaugeAbi, "stakedLength", [account])),
        });
      }
      const slot = await call(pool, poolAbi, "slot0");
      poolRequire(slot.length === 6, "IdentityMismatch", "CL slot0 shape differs");
      const sqrtPriceX96 = parseUint(slot[0], 160),
        tick = Number(signed(slot[1], 24)),
        ratioTick = getCLTickAtSqrtRatio(sqrtPriceX96);
      // A zero-for-one swap ending exactly on an initialized boundary stores tickNext-1.
      poolRequire(
        tick === ratioTick ||
          (tick === ratioTick - 1 && sqrtPriceX96 === getCLTickSqrtRatio(ratioTick)),
        "IdentityMismatch",
        "CL price and active tick differ",
      );
      const liquidity = parseUint(await one(pool, poolAbi, "liquidity"), 128),
        stakedLiquidity = parseUint(await one(pool, poolAbi, "stakedLiquidity"), 128);
      poolRequire(
        stakedLiquidity <= liquidity,
        "IdentityMismatch",
        "CL staked liquidity exceeds active liquidity",
      );
      const globalFee0X128 = parseUint(await one(pool, poolAbi, "feeGrowthGlobal0X128")),
        globalFee1X128 = parseUint(await one(pool, poolAbi, "feeGrowthGlobal1X128"));
      const rows = [];
      for (const tokenId of tokenIds) {
        const values = await call(manager.address, manager.readAbi, "positions", [tokenId]);
        poolRequire(
          values.length === 12 &&
            parseAddress(values[2]) === key.token0 &&
            parseAddress(values[3]) === key.token1 &&
            Number(signed(values[4], 24)) === key.tickSpacing,
          "IdentityMismatch",
          "CL position pool differs",
        );
        const tickLower = Number(signed(values[5], 24)),
          tickUpper = Number(signed(values[6], 24));
        getCLTickSqrtRatio(tickLower);
        getCLTickSqrtRatio(tickUpper);
        poolRequire(
          tickLower < tickUpper &&
            tickLower % key.tickSpacing === 0 &&
            tickUpper % key.tickSpacing === 0,
          "IdentityMismatch",
          "CL position range differs",
        );
        tickSet.add(tickLower);
        tickSet.add(tickUpper);
        rows.push({ tokenId, values, tickLower, tickUpper });
      }
      const ticks: CLTick[] = [];
      for (const value of [...tickSet].sort((a, b) => a - b)) {
        const row = await call(pool, poolAbi, "ticks", [BigInt(value)]);
        poolRequire(row.length === 10, "IdentityMismatch", "CL tick tuple differs");
        ticks.push(
          Object.freeze({
            tick: value,
            liquidityGross: parseUint(row[0], 128),
            liquidityNet: signed(row[1], 128),
            stakedLiquidityNet: signed(row[2], 128),
            feeGrowthOutside0X128: parseUint(row[3]),
            feeGrowthOutside1X128: parseUint(row[4]),
            initialized: boolean(row[9]),
          }),
        );
      }
      const positions: CLPosition[] = [];
      for (const row of rows) {
        const { tokenId, values, tickLower, tickUpper } = row,
          owner = poolAddress(await one(manager.address, manager.readAbi, "ownerOf", [tokenId])),
          approved = parseAddress(values[1]),
          staked = gauge !== null && owner === gauge.address,
          beneficialDepositor = !staked
            ? owner
            : boolean(await one(gaugeAddress, gaugeAbi, "stakedContains", [account, tokenId]))
              ? account
              : null;
        poolRequire(
          parseAddress(await one(manager.address, manager.readAbi, "getApproved", [tokenId])) ===
            approved,
          "IdentityMismatch",
          "CL NFT approval differs",
        );
        const lower = ticks.find((item) => item.tick === tickLower),
          upper = ticks.find((item) => item.tick === tickUpper);
        poolRequire(
          lower !== undefined && upper !== undefined,
          "IdentityMismatch",
          "CL tick history missing",
        );
        const positionLiquidity = parseUint(values[7], 128),
          lastInside0X128 = parseUint(values[8]),
          lastInside1X128 = parseUint(values[9]),
          tokensOwed0 = parseUint(values[10], 128),
          tokensOwed1 = parseUint(values[11], 128);
        poolRequire(
          positionLiquidity === 0n ||
            (lower.initialized &&
              upper.initialized &&
              positionLiquidity <= lower.liquidityGross &&
              positionLiquidity <= upper.liquidityGross),
          "IdentityMismatch",
          "CL position and initialized ticks differ",
        );
        const common = { liquidity: positionLiquidity, tick, tickLower, tickUpper, staked };
        positions.push(
          Object.freeze({
            tokenId,
            owner,
            approved,
            staked,
            beneficialDepositor,
            callerApproved:
              owner === account ||
              approved === account ||
              boolean(
                await one(manager.address, manager.readAbi, "isApprovedForAll", [owner, account]),
              ),
            tickLower,
            tickUpper,
            liquidity: positionLiquidity,
            lastInside0X128,
            lastInside1X128,
            tokensOwed0,
            tokensOwed1,
            fees0: calculateCLFees({
              ...common,
              globalX128: globalFee0X128,
              lowerOutsideX128: lower.feeGrowthOutside0X128,
              upperOutsideX128: upper.feeGrowthOutside0X128,
              lastInsideX128: lastInside0X128,
              tokensOwed: tokensOwed0,
            }),
            fees1: calculateCLFees({
              ...common,
              globalX128: globalFee1X128,
              lowerOutsideX128: lower.feeGrowthOutside1X128,
              upperOutsideX128: upper.feeGrowthOutside1X128,
              lastInsideX128: lastInside1X128,
              tokensOwed: tokensOwed1,
            }),
            principal: calculateCLAmounts({
              sqrtPriceX96,
              sqrtLowerX96: getCLTickSqrtRatio(tickLower),
              sqrtUpperX96: getCLTickSqrtRatio(tickUpper),
              liquidity: positionLiquidity,
              rounding: "down",
            }),
            gaugeReward:
              staked && beneficialDepositor === account
                ? parseUint(await one(gaugeAddress, gaugeAbi, "earned", [account, tokenId]))
                : null,
          }),
        );
      }
      const tokenInput = (address: `0x${string}`) => ({
        target: {
          contractId: factory.contractId,
          address,
          targetRole: address === key.token0 ? "cl-token-0" : "cl-token-1",
        },
        account,
        spender: manager.address,
        coordinate,
      });
      const [token0, token1] = await Promise.all([
        tokens.read(tokenInput(key.token0)),
        tokens.read(tokenInput(key.token1)),
      ]);
      const snapshot = {
        writeCompatible: await verifyPoolWriterAssets({
          registry,
          transport,
          coordinate,
          tokens: [token0, token1],
        }),
        coordinate,
        timestamp,
        providerId: transport.id,
        account,
        key,
        factory,
        implementation,
        manager,
        factoryRegistry,
        factoryApproved,
        pool,
        gauge,
        sqrtPriceX96,
        tick,
        unlocked: boolean(slot[5]),
        liquidity,
        stakedLiquidity,
        maxLiquidityPerTick: parseUint(await one(pool, poolAbi, "maxLiquidityPerTick"), 128),
        fee: parseUint(await one(pool, poolAbi, "fee"), 24),
        unstakedFee: parseUint(
          await one(factory.address, factory.readAbi, "getUnstakedFee", [pool]),
          24,
        ),
        globalFee0X128,
        globalFee1X128,
        token0,
        token1,
        poolBalance0: parseUint(await one(key.token0, getTokenInterface(), "balanceOf", [pool])),
        poolBalance1: parseUint(await one(key.token1, getTokenInterface(), "balanceOf", [pool])),
        nativeBalance: parseUint(await transport.getBalance(account, coordinate)),
        managerNativeBalance: parseUint(await transport.getBalance(manager.address, coordinate)),
        nftSupply: parseUint(await one(manager.address, manager.readAbi, "totalSupply")),
        ownedCount: parseUint(await one(manager.address, manager.readAbi, "balanceOf", [account])),
        ticks: Object.freeze(ticks),
        positions: Object.freeze(positions),
      };
      poolRequire(
        parseUint(await transport.getChainId()) === coordinate.chainId &&
          parseHash32((await transport.getBlock(blockNumber))?.hash) === coordinate.blockHash,
        "IdentityMismatch",
        "CL snapshot anchor changed",
      );
      return Object.freeze(snapshot);
    },
  } satisfies CLPoolReader);
}
/** Approval token targets remain bound to the verified CL pool and writer asset generation. */
export function createCLPositionTargetResolver(config: {
  readonly reader: CLPoolReader;
  readonly key: CLPoolKey;
  readonly account: `0x${string}`;
}): ExecutionTargetResolver {
  const key = Object.freeze({ ...config.key }),
    account = poolAddress(config.account);
  return async (input) => {
    poolRequire(
      input.contractId === "mezo-earn.cl-factory" &&
        ["cl-token-0", "cl-token-1"].includes(input.role),
      "IdentityMismatch",
      "unknown CL approval role",
    );
    const snapshot = await config.reader.read({
      account,
      key,
      blockNumber: input.coordinate.blockNumber,
    });
    poolRequire(
      snapshot.writeCompatible &&
        snapshot.coordinate.blockHash === input.coordinate.blockHash &&
        snapshot.coordinate.chainId === input.coordinate.chainId &&
        snapshot.coordinate.networkId === input.coordinate.networkId,
      "IdentityMismatch",
      "CL approval target generation or coordinate differs",
    );
    return input.role === "cl-token-0" ? snapshot.key.token0 : snapshot.key.token1;
  };
}
