import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { calculateBasicSwapFee, sortBasicPoolKey } from "@mezo-dev-kit/pools";
import type { BasicPoolReader, BasicPoolSnapshot } from "@mezo-dev-kit/pools";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";

export type SwapErrorCode =
  | "InvalidInput"
  | "UnavailableRoute"
  | "InconsistentQuote"
  | "BoundExceeded"
  | "ApprovalRequired"
  | "ReconciliationMismatch";
export class SwapError extends Error {
  readonly code: SwapErrorCode;
  constructor(code: SwapErrorCode, message: string) {
    super(message);
    this.name = "SwapError";
    this.code = code;
  }
}
export function swapRequire(
  condition: boolean,
  code: SwapErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new SwapError(code, message);
}
export interface BasicSwapHop {
  readonly tokenIn: `0x${string}`;
  readonly tokenOut: `0x${string}`;
  readonly stable: boolean;
}
export interface BasicSwapQuoteInput {
  readonly route: readonly BasicSwapHop[];
  readonly intermediateAssets: readonly `0x${string}`[];
  readonly account: `0x${string}`;
  readonly amountIn: bigint;
  readonly maxAgeBlocks: bigint;
  readonly blockNumber?: bigint;
}
export interface BasicSwapQuote {
  readonly sourceClass: "dex-execution-quote";
  readonly providerId: string;
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly route: readonly Readonly<BasicSwapHop>[];
  readonly intermediateAssets: readonly `0x${string}`[];
  readonly account: `0x${string}`;
  readonly router: `0x${string}`;
  readonly amountIn: bigint;
  readonly amounts: readonly bigint[];
  readonly estimatedAmountOut: bigint;
  readonly maxAgeBlocks: bigint;
  readonly inputToken: Readonly<TokenSnapshot>;
  readonly outputToken: Readonly<TokenSnapshot>;
  readonly pools: readonly Readonly<BasicPoolSnapshot>[];
  readonly writeCompatible: boolean;
}
export interface BasicSwapReader {
  quote(input: BasicSwapQuoteInput): Promise<Readonly<BasicSwapQuote>>;
}
function array(value: unknown): boolean {
  return Array.isArray(value);
}
export function validateBasicSwapRoute(
  route: readonly BasicSwapHop[],
  intermediateAssets: readonly `0x${string}`[],
): readonly Readonly<BasicSwapHop>[] {
  swapRequire(
    array(route) &&
      route.length > 0 &&
      route.length <= 3 &&
      array(intermediateAssets) &&
      intermediateAssets.length <= 16,
    "InvalidInput",
    "basic route requires one to three hops and a bounded intermediate allowlist",
  );
  const allowed = new Set(intermediateAssets.map((address) => parseAddress(address)));
  const result = route.map((hop) => {
    const key = sortBasicPoolKey({ tokenA: hop.tokenIn, tokenB: hop.tokenOut, stable: hop.stable });
    return Object.freeze({
      tokenIn: parseAddress(hop.tokenIn),
      tokenOut: parseAddress(hop.tokenOut),
      stable: key.stable,
    });
  });
  for (let index = 1; index < result.length; index++) {
    const previous = result[index - 1]!,
      current = result[index]!;
    swapRequire(
      previous.tokenOut === current.tokenIn && allowed.has(current.tokenIn),
      "InvalidInput",
      "route is discontinuous or intermediate asset is not allowed",
    );
  }
  const assets = [result[0]!.tokenIn, ...result.map((hop) => hop.tokenOut)];
  swapRequire(
    new Set(assets).size === assets.length,
    "InvalidInput",
    "cyclic basic routes are unsupported",
  );
  return Object.freeze(result);
}
export function basicRouteArguments(
  quote: BasicSwapQuote,
): readonly (readonly [`0x${string}`, `0x${string}`, boolean, `0x${string}`])[] {
  return quote.route.map(
    (hop, index) => [hop.tokenIn, hop.tokenOut, hop.stable, quote.pools[index]!.factory] as const,
  );
}
export function createBasicSwapReader(config: {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
  readonly pools: BasicPoolReader;
}): Readonly<BasicSwapReader> {
  swapRequire(
    config.networkId === "mezo-mainnet",
    "InvalidInput",
    "basic swaps currently require mainnet",
  );
  const network = getNetwork(config.networkId),
    codec = createAbiCodec();
  return Object.freeze({
    async quote(input) {
      const route = validateBasicSwapRoute(input.route, input.intermediateAssets);
      const intermediateAssets = Object.freeze(
        [...new Set(input.intermediateAssets.map((value) => parseAddress(value)))].sort(),
      );
      const account = parseAddress(input.account),
        amountIn = parseUint(input.amountIn),
        maxAgeBlocks = parseUint(input.maxAgeBlocks);
      swapRequire(
        account !== `0x${"0".repeat(40)}` && amountIn > 0n,
        "InvalidInput",
        "nonzero account and exact input amount required",
      );
      const blockNumber = parseUint(input.blockNumber ?? (await config.transport.getBlockNumber()));
      const pools = await Promise.all(
        route.map((hop) =>
          config.pools.read({
            key: sortBasicPoolKey({
              tokenA: hop.tokenIn,
              tokenB: hop.tokenOut,
              stable: hop.stable,
            }),
            account,
            blockNumber,
          }),
        ),
      );
      const first = pools[0]!,
        last = pools.at(-1)!;
      for (const pool of pools)
        swapRequire(
          pool.coordinate.networkId === network.id &&
            pool.coordinate.chainId === network.evmChainId &&
            pool.coordinate.blockNumber === blockNumber &&
            pool.coordinate.blockHash === first.coordinate.blockHash &&
            pool.router === first.router &&
            !pool.paused &&
            pool.reserve0 > 0n &&
            pool.reserve1 > 0n &&
            pool.poolBalance0 === pool.reserve0 &&
            pool.poolBalance1 === pool.reserve1 &&
            calculateBasicSwapFee({ amountIn: 0n, feeBps: pool.feeBps }) === 0n,
          "UnavailableRoute",
          "route pool is inconsistent, paused, empty or has unaccounted balances",
        );
      for (const [index, pool] of pools.entries()) {
        const hop = route[index]!,
          key = sortBasicPoolKey({ tokenA: hop.tokenIn, tokenB: hop.tokenOut, stable: hop.stable });
        swapRequire(
          pool.key.token0 === key.token0 &&
            pool.key.token1 === key.token1 &&
            pool.key.stable === key.stable &&
            pool.account === account &&
            pool.token0.target.address === key.token0 &&
            pool.token1.target.address === key.token1 &&
            pool.token0.account === account &&
            pool.token1.account === account &&
            pool.token0.spender === pool.router &&
            pool.token1.spender === pool.router,
          "InconsistentQuote",
          "route pool key or token account differs",
        );
      }
      const router = config.registry.resolve({
        contractId: "mezo-earn.router",
        networkId: network.id,
        blockNumber,
      });
      swapRequire(router.address === first.router, "InconsistentQuote", "quote router differs");
      const abi = router.readAbi.find(
        (entry) => entry.type === "function" && entry.name === "getAmountsOut",
      );
      const values = codec.decodeFunction(
        abi,
        await config.transport.read({
          ...first.coordinate,
          address: router.address,
          contractId: router.contractId,
          data: codec.encodeFunction(abi, [
            amountIn,
            route.map((hop, index) => [
              hop.tokenIn,
              hop.tokenOut,
              hop.stable,
              pools[index]!.factory,
            ]),
          ]),
        }),
      );
      const raw = values[0];
      swapRequire(
        Array.isArray(raw) && raw.length === route.length + 1,
        "InconsistentQuote",
        "quote amount shape differs",
      );
      const amounts = raw.map((value) => parseUint(value));
      swapRequire(
        amounts[0] === amountIn && amounts.every((amount) => amount > 0n),
        "UnavailableRoute",
        "quote is zero, partial or has a different input",
      );
      const final = await config.transport.getBlock(blockNumber);
      swapRequire(
        final?.hash === first.coordinate.blockHash &&
          parseUint(await config.transport.getChainId()) === network.evmChainId,
        "InconsistentQuote",
        "quote coordinate changed",
      );
      return Object.freeze({
        sourceClass: "dex-execution-quote",
        providerId: config.transport.id,
        coordinate: first.coordinate,
        timestamp: first.timestamp,
        route,
        intermediateAssets,
        account,
        router: router.address,
        amountIn,
        amounts: Object.freeze(amounts),
        estimatedAmountOut: amounts.at(-1)!,
        maxAgeBlocks,
        inputToken: route[0]!.tokenIn === first.key.token0 ? first.token0 : first.token1,
        outputToken: route.at(-1)!.tokenOut === last.key.token0 ? last.token0 : last.token1,
        pools: Object.freeze(pools),
        writeCompatible: pools.every((pool) => pool.writeCompatible),
      });
    },
  } satisfies BasicSwapReader);
}
/** Compare only one coherent request; no gas-cost or trading-policy assumption. */
export function rankBasicSwapQuotes(quotes: readonly BasicSwapQuote[]): readonly BasicSwapQuote[] {
  swapRequire(
    array(quotes) && quotes.length > 0 && quotes.length <= 64,
    "InvalidInput",
    "one to 64 quotes required",
  );
  const first = quotes[0]!;
  for (const quote of quotes)
    swapRequire(
      quote.coordinate.networkId === first.coordinate.networkId &&
        quote.coordinate.chainId === first.coordinate.chainId &&
        quote.coordinate.blockNumber === first.coordinate.blockNumber &&
        quote.coordinate.blockHash === first.coordinate.blockHash &&
        quote.account === first.account &&
        quote.amountIn === first.amountIn &&
        quote.maxAgeBlocks === first.maxAgeBlocks &&
        quote.inputToken.target.address === first.inputToken.target.address &&
        quote.inputToken.decimals === first.inputToken.decimals &&
        quote.outputToken.target.address === first.outputToken.target.address &&
        quote.outputToken.decimals === first.outputToken.decimals &&
        parseUint(quote.estimatedAmountOut) > 0n,
      "InconsistentQuote",
      "quotes have different assets, units, policy or coordinates",
    );
  for (const quote of quotes) {
    const route = validateBasicSwapRoute(quote.route, quote.intermediateAssets);
    swapRequire(
      quote.sourceClass === "dex-execution-quote" &&
        quote.writeCompatible === true &&
        route.length === quote.pools.length &&
        quote.amounts.length === route.length + 1 &&
        quote.amounts.every((amount: unknown) => parseUint(amount) > 0n) &&
        quote.amounts[0] === quote.amountIn &&
        quote.amounts.at(-1) === quote.estimatedAmountOut &&
        quote.inputToken.target.address === route[0]!.tokenIn &&
        quote.outputToken.target.address === route.at(-1)!.tokenOut,
      "UnavailableRoute",
      "ranking requires complete writer-compatible quotes",
    );
    for (const [index, pool] of quote.pools.entries()) {
      const hop = route[index]!,
        key = sortBasicPoolKey({ tokenA: hop.tokenIn, tokenB: hop.tokenOut, stable: hop.stable });
      swapRequire(
        pool.writeCompatible === true &&
          pool.key.token0 === key.token0 &&
          pool.key.token1 === key.token1 &&
          pool.key.stable === key.stable &&
          !pool.paused &&
          pool.reserve0 > 0n &&
          pool.reserve1 > 0n &&
          pool.poolBalance0 === pool.reserve0 &&
          pool.poolBalance1 === pool.reserve1 &&
          pool.account === quote.account &&
          pool.router === quote.router &&
          pool.coordinate.blockHash === quote.coordinate.blockHash &&
          pool.coordinate.blockNumber === quote.coordinate.blockNumber &&
          pool.coordinate.chainId === quote.coordinate.chainId &&
          pool.coordinate.networkId === quote.coordinate.networkId,
        "UnavailableRoute",
        "ranking pool identity or liquidity differs",
      );
    }
  }
  return Object.freeze(
    [...quotes].sort((a, b) =>
      a.estimatedAmountOut > b.estimatedAmountOut
        ? -1
        : a.estimatedAmountOut < b.estimatedAmountOut
          ? 1
          : JSON.stringify(a.route) < JSON.stringify(b.route)
            ? -1
            : JSON.stringify(a.route) > JSON.stringify(b.route)
              ? 1
              : 0,
    ),
  );
}
