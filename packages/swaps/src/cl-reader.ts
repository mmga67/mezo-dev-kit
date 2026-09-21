import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { RpcTransport, ExecutionTargetResolver } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import { sortCLPoolKey } from "@mezo-dev-kit/pools";
import type { CLPoolReader } from "@mezo-dev-kit/pools";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import { swapRequire } from "./reader.ts";
import { clSwapBudget, quoteCLPool } from "./cl-quote-engine.ts";
import type { CLSwapHop, CLSwapQuoteInput, CLSwapPoolQuote, CLSwapReader } from "./cl-types.ts";
const zero = `0x${"0".repeat(40)}` as const;
function array(value: unknown): boolean {
  return Array.isArray(value);
}
/**
 * Normalize one to three contiguous, acyclic CL hops with approved intermediate assets.
 *
 * @remarks
 * Token identities and tick spacing are validated structurally. No RPC, pool discovery
 * or liquidity check occurs until a reader quotes the route.
 */
export function validateCLSwapRoute(
  route: readonly CLSwapHop[],
  intermediateAssets: readonly `0x${string}`[],
): readonly Readonly<CLSwapHop>[] {
  swapRequire(
    array(route) &&
      route.length > 0 &&
      route.length <= 3 &&
      array(intermediateAssets) &&
      intermediateAssets.length <= 16,
    "InvalidInput",
    "CL route needs one to three hops and a bounded intermediate allowlist",
  );
  const allowed = new Set(intermediateAssets.map((value) => parseAddress(value))),
    result = route.map((hop) => {
      const key = sortCLPoolKey({
        tokenA: hop.tokenIn,
        tokenB: hop.tokenOut,
        tickSpacing: hop.tickSpacing,
      });
      return Object.freeze({
        tokenIn: parseAddress(hop.tokenIn),
        tokenOut: parseAddress(hop.tokenOut),
        tickSpacing: key.tickSpacing,
      });
    });
  for (let i = 1; i < result.length; i++) {
    const previous = result[i - 1]!,
      current = result[i]!;
    swapRequire(
      previous.tokenOut === current.tokenIn && allowed.has(current.tokenIn),
      "InvalidInput",
      "CL route discontinuity or unapproved intermediate asset",
    );
  }
  const assets = [result[0]!.tokenIn, ...result.map((hop) => hop.tokenOut)];
  swapRequire(
    new Set(assets).size === assets.length,
    "InvalidInput",
    "cyclic CL routes unsupported",
  );
  return Object.freeze(result);
}
/**
 * Encode an exact-input CL path as token addresses separated by three-byte tick spacings.
 *
 * @remarks
 * The encoded discriminator is tick spacing, not a fee tier. This function validates
 * route shape using its own intermediate tokens; apply the application's allowlist
 * with validateCLSwapRoute before treating the route as eligible.
 */
export function encodeCLSwapPath(route: readonly CLSwapHop[]): `0x${string}` {
  const validated = validateCLSwapRoute(
    route,
    route.slice(1).map((hop) => hop.tokenIn),
  );
  return `0x${validated[0]!.tokenIn.slice(2)}${validated.map((hop) => hop.tickSpacing.toString(16).padStart(6, "0") + hop.tokenOut.slice(2)).join("")}`;
}
/**
 * Create exact-input CL quotes with explicit step, bitmap and tick-crossing budgets.
 *
 * @remarks
 * Caller-supplied hops are verified through Pools at one coordinate. Incomplete fills
 * and exhausted budgets reject rather than returning executable partial quotes.
 * The reader neither chooses routes nor relies on an implicit Quoter.
 */
export function createCLSwapReader(config: {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
  readonly pools: CLPoolReader;
}): Readonly<CLSwapReader> {
  swapRequire(config.networkId === "mezo-mainnet", "InvalidInput", "CL swaps require mainnet");
  const { registry, transport, pools } = config,
    network = getNetwork(config.networkId),
    codec = createAbiCodec(),
    tokens = createTokenReader({ transport });
  return Object.freeze({
    async quote(input) {
      const route = validateCLSwapRoute(input.route, input.intermediateAssets),
        account = parseAddress(input.account),
        amountIn = parseUint(input.amountIn),
        maxAgeBlocks = parseUint(input.maxAgeBlocks),
        budget = Object.freeze({ ...input.budget });
      clSwapBudget(budget);
      swapRequire(
        account !== zero && amountIn > 0n && amountIn < 1n << 255n,
        "InvalidInput",
        "positive signed CL amount and nonzero account required",
      );
      const first = route[0]!,
        initial = await pools.read({
          account,
          key: sortCLPoolKey({
            tokenA: first.tokenIn,
            tokenB: first.tokenOut,
            tickSpacing: first.tickSpacing,
          }),
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
        }),
        coordinate = initial.coordinate;
      swapRequire(
        coordinate.chainId === network.evmChainId && coordinate.networkId === network.id,
        "InconsistentQuote",
        "CL quote network differs",
      );
      const router = registry.resolve({ ...coordinate, contractId: "mezo-earn.cl-swap-router" });
      await verifyContractRuntime({ contract: router, coordinate, transport });
      const factoryABI = router.readAbi.find(
        (row) => row.type === "function" && row.name === "factory",
      );
      swapRequire(factoryABI !== undefined, "UnavailableRoute", "CL router factory getter missing");
      const factory = parseAddress(
        codec.decodeFunction(
          factoryABI,
          await transport.read({
            ...coordinate,
            contractId: router.contractId,
            address: router.address,
            data: codec.encodeFunction(factoryABI, []),
          }),
        )[0],
      );
      const rows: Readonly<CLSwapPoolQuote>[] = [];
      let nextInput = amountIn;
      for (const [i, hop] of route.entries()) {
        const snapshot =
          i === 0
            ? initial
            : await pools.read({
                account,
                key: sortCLPoolKey({
                  tokenA: hop.tokenIn,
                  tokenB: hop.tokenOut,
                  tickSpacing: hop.tickSpacing,
                }),
                blockNumber: coordinate.blockNumber,
              });
        swapRequire(
          snapshot.coordinate.blockHash === coordinate.blockHash &&
            snapshot.coordinate.chainId === coordinate.chainId &&
            snapshot.coordinate.networkId === coordinate.networkId &&
            snapshot.factory.address === factory &&
            snapshot.account === account,
          "InconsistentQuote",
          "CL route pool coordinate or factory differs",
        );
        const row = await quoteCLPool({
          snapshot,
          amountIn: nextInput,
          zeroForOne: hop.tokenIn === snapshot.key.token0,
          budget,
          transport,
        });
        rows.push(row);
        nextInput = row.amountOut;
      }
      const last = rows.at(-1)!,
        lastHop = route.at(-1)!,
        inputBase = first.tokenIn === initial.key.token0 ? initial.token0 : initial.token1,
        outputBase =
          lastHop.tokenOut === last.snapshot.key.token0
            ? last.snapshot.token0
            : last.snapshot.token1;
      const [inputToken, outputToken, routerNativeBalance] = await Promise.all([
        tokens.read({ coordinate, account, target: inputBase.target, spender: router.address }),
        tokens.read({ coordinate, account, target: outputBase.target, spender: router.address }),
        transport.getBalance(router.address, coordinate).then(parseUint),
      ]);
      const final = await transport.getBlock(coordinate.blockNumber);
      swapRequire(
        final !== undefined &&
          final !== null &&
          parseHash32(final.hash) === coordinate.blockHash &&
          parseUint(await transport.getChainId()) === coordinate.chainId,
        "InconsistentQuote",
        "CL quote anchor changed",
      );
      return Object.freeze({
        sourceClass: "dex-execution-quote",
        providerId: initial.providerId,
        coordinate,
        timestamp: initial.timestamp,
        account,
        router,
        routerNativeBalance,
        route,
        intermediateAssets: Object.freeze(
          input.intermediateAssets.map((value) => parseAddress(value)),
        ),
        path: encodeCLSwapPath(route),
        amountIn,
        estimatedAmountOut: nextInput,
        amounts: Object.freeze([amountIn, ...rows.map((row) => row.amountOut)]),
        pools: Object.freeze(rows),
        inputToken,
        outputToken,
        maxAgeBlocks,
        budget,
        writeCompatible:
          rows.every((row) => row.snapshot.writeCompatible) &&
          routerNativeBalance === 0n &&
          ![router.address, ...rows.map((row) => row.snapshot.pool)].includes(account),
      });
    },
  } satisfies CLSwapReader);
}
/**
 * Resolve verified CL input-token targets for Core's separate approval lifecycle.
 *
 * @remarks
 * The configured route and account are reread at the requested coordinate. Resolution
 * must match the registered anchor and role; it does not authorize an arbitrary token.
 */
export function createCLSwapTargetResolver(config: {
  readonly reader: CLSwapReader;
  readonly input: Omit<CLSwapQuoteInput, "blockNumber">;
}): ExecutionTargetResolver {
  return async (input) => {
    const quote = await config.reader.quote({
      ...config.input,
      blockNumber: input.coordinate.blockNumber,
    });
    swapRequire(
      quote.writeCompatible &&
        quote.coordinate.blockHash === input.coordinate.blockHash &&
        quote.coordinate.chainId === input.coordinate.chainId &&
        quote.coordinate.networkId === input.coordinate.networkId &&
        input.contractId === quote.inputToken.target.contractId &&
        input.role === quote.inputToken.target.targetRole,
      "UnavailableRoute",
      "CL approval target or coordinate differs",
    );
    return quote.inputToken.target.address;
  };
}
