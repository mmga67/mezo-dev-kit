import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface, resolveBasicPoolInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseMinimalProxyImplementation,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import type { BasicPoolKey, BasicPoolReader, BasicPoolReaderConfig } from "./types.ts";
import { POOL_MODEL } from "./model.generated.ts";
import { calculateBasicPoolFees } from "./fees.ts";

export type PoolErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "UnavailablePool"
  | "UnsafeState"
  | "BoundExceeded"
  | "ReconciliationMismatch";
export class PoolError extends Error {
  readonly code: PoolErrorCode;
  constructor(code: PoolErrorCode, message: string) {
    super(message);
    this.name = "PoolError";
    this.code = code;
  }
}
export function poolRequire(
  condition: boolean,
  code: PoolErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new PoolError(code, message);
}
export function poolAddress(value: unknown): `0x${string}` {
  const address = parseAddress(value);
  poolRequire(address !== `0x${"0".repeat(40)}`, "InvalidInput", "zero pool address input");
  return address;
}
export function sortBasicPoolKey(input: {
  readonly tokenA: `0x${string}`;
  readonly tokenB: `0x${string}`;
  readonly stable: boolean;
}): Readonly<BasicPoolKey> {
  const a = poolAddress(input.tokenA),
    b = poolAddress(input.tokenB);
  poolRequire(
    a !== b && typeof input.stable === "boolean",
    "InvalidInput",
    "pool requires distinct assets and explicit stable flag",
  );
  return Object.freeze({ token0: a < b ? a : b, token1: a < b ? b : a, stable: input.stable });
}
export function poolEntry(
  abi: readonly ContractAbiEntry[],
  name: string,
  types?: readonly string[],
): ContractAbiEntry {
  const entries = abi.filter(
    (entry) =>
      entry.type === "function" &&
      entry.name === name &&
      (types === undefined ||
        (Array.isArray(entry.inputs) &&
          JSON.stringify(
            entry.inputs.map((value: unknown) =>
              value && typeof value === "object" && "type" in value ? value.type : null,
            ),
          ) === JSON.stringify(types))),
  );
  poolRequire(
    entries.length === 1 && entries[0] !== undefined,
    "IdentityMismatch",
    `missing or ambiguous pool interface: ${name}`,
  );
  return entries[0];
}
export function createBasicPoolReader(config: BasicPoolReaderConfig): Readonly<BasicPoolReader> {
  poolRequire(
    config.networkId === "mezo-mainnet",
    "InvalidInput",
    "basic pools currently require mainnet",
  );
  const network = getNetwork(config.networkId),
    { transport, registry } = config,
    codec = createAbiCodec(),
    tokens = createTokenReader({ transport });
  const poolProfile = resolveBasicPoolInterface({ networkId: network.id, role: "pool" }),
    registryProfile = resolveBasicPoolInterface({
      networkId: network.id,
      role: "factory-registry",
    });
  return Object.freeze({
    async read(input) {
      const key = sortBasicPoolKey({
          tokenA: input.key.token0,
          tokenB: input.key.token1,
          stable: input.key.stable,
        }),
        account = poolAddress(input.account);
      poolRequire(
        key.token0 === parseAddress(input.key.token0) &&
          key.token1 === parseAddress(input.key.token1),
        "InvalidInput",
        "key must be in token0/token1 order",
      );
      poolRequire(
        parseUint(await transport.getChainId()) === network.evmChainId,
        "IdentityMismatch",
        "pool chain mismatch",
      );
      const blockNumber = parseUint(input.blockNumber ?? (await transport.getBlockNumber())),
        block = await transport.getBlock(blockNumber);
      poolRequire(block?.number === blockNumber, "IdentityMismatch", "pool block unavailable");
      const coordinate = Object.freeze({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber,
        blockHash: parseHash32(block.hash),
      });
      const factoryRoot = registry.resolve({
          networkId: network.id,
          contractId: "mezo-earn.pool-factory",
          blockNumber,
        }),
        routerRoot = registry.resolve({
          networkId: network.id,
          contractId: "mezo-earn.router",
          blockNumber,
        });
      await Promise.all([
        verifyContractRuntime({ contract: factoryRoot, coordinate, transport }),
        verifyContractRuntime({ contract: routerRoot, coordinate, transport }),
      ]);
      async function read(
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
        types?: readonly string[],
      ) {
        const entry = poolEntry(abi, name, types);
        return codec.decodeFunction(
          entry,
          await transport.read({
            ...coordinate,
            address,
            contractId: factoryRoot.contractId,
            data: codec.encodeFunction(entry, args),
          }),
        );
      }
      async function runtime(address: `0x${string}`, expected: string) {
        const code = parseHexData(await transport.getCode(address, coordinate));
        poolRequire(
          createHash("sha256")
            .update(Buffer.from(code.slice(2), "hex"))
            .digest("hex") === expected,
          "IdentityMismatch",
          "pool dependency runtime differs",
        );
      }
      const [defaultFactory, implementationValues, registryValues, poolValues, timestamp] =
        await Promise.all([
          read(routerRoot.address, routerRoot.readAbi, "defaultFactory"),
          read(factoryRoot.address, factoryRoot.readAbi, poolProfile.getter),
          read(routerRoot.address, routerRoot.readAbi, registryProfile.getter),
          read(
            factoryRoot.address,
            factoryRoot.readAbi,
            "getPool",
            [key.token0, key.token1, key.stable],
            ["address", "address", "bool"],
          ),
          transport.getBlockTimestamp(coordinate),
        ]);
      const factory = factoryRoot.address,
        router = routerRoot.address,
        implementation = poolAddress(implementationValues[0]),
        factoryRegistry = poolAddress(registryValues[0]);
      poolRequire(
        parseAddress(defaultFactory[0]) === factory,
        "IdentityMismatch",
        "router default factory differs",
      );
      const pool = parseAddress(poolValues[0]);
      poolRequire(pool !== `0x${"0".repeat(40)}`, "UnavailablePool", "pool does not exist");
      await Promise.all([
        runtime(implementation, poolProfile.runtimeSha256),
        runtime(factoryRegistry, registryProfile.runtimeSha256),
      ]);
      poolRequire(
        parseMinimalProxyImplementation(await transport.getCode(pool, coordinate)) ===
          implementation,
        "IdentityMismatch",
        "pool clone implementation differs",
      );
      const [
        approved,
        member,
        predicted,
        poolFactory,
        token0Value,
        token1Value,
        stable,
        paused,
        fee,
        reserves,
        supply,
        custody,
        fees,
      ] = await Promise.all([
        read(factoryRegistry, registryProfile.abi, "isPoolFactoryApproved", [factory]),
        read(factory, factoryRoot.readAbi, "isPool", [pool]),
        read(router, routerRoot.readAbi, "poolFor", [key.token0, key.token1, key.stable, factory]),
        read(pool, poolProfile.abi, "factory"),
        read(pool, poolProfile.abi, "token0"),
        read(pool, poolProfile.abi, "token1"),
        read(pool, poolProfile.abi, "stable"),
        read(factory, factoryRoot.readAbi, "isPaused"),
        read(factory, factoryRoot.readAbi, "getFee", [pool, key.stable]),
        read(pool, poolProfile.abi, "getReserves"),
        read(pool, poolProfile.abi, "totalSupply"),
        read(pool, poolProfile.abi, "balanceOf", [pool]),
        read(pool, poolProfile.abi, "poolFees"),
      ]);
      poolRequire(
        approved[0] === true &&
          member[0] === true &&
          parseAddress(predicted[0]) === pool &&
          parseAddress(poolFactory[0]) === factory &&
          parseAddress(token0Value[0]) === key.token0 &&
          parseAddress(token1Value[0]) === key.token1 &&
          stable[0] === key.stable &&
          typeof paused[0] === "boolean",
        "IdentityMismatch",
        "pool discovery or topology differs",
      );
      const tokenInput = (address: `0x${string}`, targetRole: string) => ({
        coordinate,
        account,
        spender: router,
        target: { contractId: factoryRoot.contractId, address, targetRole },
      });
      const [token0, token1, lp, balance0, balance1] = await Promise.all([
        tokens.read(tokenInput(key.token0, "basic-token-0")),
        tokens.read(tokenInput(key.token1, "basic-token-1")),
        tokens.read(tokenInput(pool, "basic-lp")),
        read(key.token0, getTokenInterface(), "balanceOf", [pool]),
        read(key.token1, getTokenInterface(), "balanceOf", [pool]),
      ]);
      const musd = registry.resolve({
        networkId: network.id,
        contractId: "musd.token",
        blockNumber,
      });
      const writeCompatible = [key.token0, key.token1].every(
        (address) => address === musd.address || address === POOL_MODEL.musdc.address,
      );
      if (writeCompatible) {
        await Promise.all([
          verifyContractRuntime({ contract: musd, coordinate, transport }),
          runtime(POOL_MODEL.musdc.address, POOL_MODEL.musdc.addressCodeSha256),
          runtime(
            POOL_MODEL.musdc.implementationAddress,
            POOL_MODEL.musdc.implementationCodeSha256,
          ),
        ]);
        poolRequire(
          parseHash32(
            await transport.getStorage(
              POOL_MODEL.musdc.address,
              POOL_MODEL.musdc.implementationSlot,
              coordinate,
            ),
          ) === `0x${"0".repeat(24)}${POOL_MODEL.musdc.implementationAddress.slice(2)}`,
          "IdentityMismatch",
          "mUSDC implementation changed",
        );
        poolRequire(
          lp.decimals === 18n &&
            token0.decimals === (key.token0 === musd.address ? 18n : 6n) &&
            token1.decimals === (key.token1 === musd.address ? 18n : 6n),
          "IdentityMismatch",
          "writer asset precision changed",
        );
      }
      const feeValues = await Promise.all(
        ["index0", "index1", "supplyIndex0", "supplyIndex1", "claimable0", "claimable1"].map(
          (name, index) => read(pool, poolProfile.abi, name, index < 2 ? [] : [account]),
        ),
      );
      const feeState = calculateBasicPoolFees({
        balance: lp.balance,
        index0: parseUint(feeValues[0]?.[0]),
        index1: parseUint(feeValues[1]?.[0]),
        supplyIndex0: parseUint(feeValues[2]?.[0]),
        supplyIndex1: parseUint(feeValues[3]?.[0]),
        claimable0: parseUint(feeValues[4]?.[0]),
        claimable1: parseUint(feeValues[5]?.[0]),
      });
      const final = await transport.getBlock(blockNumber);
      poolRequire(
        final?.hash === coordinate.blockHash &&
          parseUint(await transport.getChainId()) === network.evmChainId,
        "IdentityMismatch",
        "pool coordinate changed",
      );
      return Object.freeze({
        coordinate,
        timestamp,
        providerId: transport.id,
        key,
        account,
        router,
        factory,
        factoryRegistry,
        implementation,
        pool,
        poolFees: poolAddress(fees[0]),
        fees: feeState,
        paused: paused[0],
        feeBps: parseUint(fee[0]),
        reserve0: parseUint(reserves[0]),
        reserve1: parseUint(reserves[1]),
        reserveTimestamp: parseUint(reserves[2]),
        poolBalance0: parseUint(balance0[0]),
        poolBalance1: parseUint(balance1[0]),
        totalSupply: parseUint(supply[0]),
        poolLpBalance: parseUint(custody[0]),
        writeCompatible,
        token0,
        token1,
        lp,
      });
    },
  } satisfies BasicPoolReader);
}
/** Bind approval/LP destinations to one selected pool key and account. */
export function createBasicPoolTargetResolver(config: {
  readonly reader: BasicPoolReader;
  readonly key: BasicPoolKey;
  readonly account: `0x${string}`;
}): ExecutionTargetResolver {
  const key = Object.freeze({ ...config.key }),
    account = poolAddress(config.account);
  return async (input) => {
    poolRequire(
      input.contractId === "mezo-earn.pool-factory" &&
        ["basic-lp", "basic-token-0", "basic-token-1"].includes(input.role),
      "IdentityMismatch",
      "unknown basic pool execution role",
    );
    const snapshot = await config.reader.read({
      key,
      account,
      blockNumber: input.coordinate.blockNumber,
    });
    poolRequire(
      snapshot.coordinate.blockHash === input.coordinate.blockHash &&
        snapshot.coordinate.chainId === input.coordinate.chainId &&
        snapshot.coordinate.networkId === input.coordinate.networkId,
      "IdentityMismatch",
      "pool role coordinate differs",
    );
    return input.role === "basic-lp"
      ? snapshot.pool
      : input.role === "basic-token-0"
        ? snapshot.key.token0
        : snapshot.key.token1;
  };
}
