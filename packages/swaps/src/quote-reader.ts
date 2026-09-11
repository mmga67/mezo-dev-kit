import { getNetwork } from "@mezo-dev-kit/chains";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import { parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import { calculateBasicSwapFee } from "@mezo-dev-kit/pools";
import { SwapError, swapRequire, validateBasicSwapRoute } from "./reader.ts";
import type { BasicSwapQuote } from "./reader.ts";
import { validateCLSwapRoute } from "./cl-reader.ts";
import { clSwapBudget } from "./cl-quote-engine.ts";
import type { CLSwapQuote } from "./cl-types.ts";
import type {
  SwapQuoteCandidate,
  SwapQuoteCandidateResult,
  SwapQuoteFee,
  SwapQuoteReader,
  SwapQuoteReaderConfig,
  SwapQuoteRequest,
} from "./quote-types.ts";

function array(value: unknown): boolean {
  return Array.isArray(value);
}

function normalize(input: SwapQuoteRequest): Readonly<SwapQuoteRequest> {
  try {
    const tokenIn = parseAddress(input.tokenIn),
      tokenOut = parseAddress(input.tokenOut),
      account = parseAddress(input.account),
      amountIn = parseUint(input.amountIn),
      maxAgeBlocks = parseUint(input.maxAgeBlocks);
    swapRequire(
      tokenIn !== tokenOut &&
        [tokenIn, tokenOut, account].every((asset) => asset !== `0x${"0".repeat(40)}`) &&
        amountIn > 0n &&
        (input.eligibility === "all-quotes" || input.eligibility === "writer-compatible") &&
        array(input.candidates) &&
        input.candidates.length > 0 &&
        input.candidates.length <= 16,
      "InvalidInput",
      "one to 16 candidates, distinct assets, nonzero input/account and explicit eligibility required",
    );
    const ids = new Set<string>();
    const candidates = Array.from(input.candidates, (candidate): SwapQuoteCandidate => {
      swapRequire(
        typeof candidate.id === "string" &&
          /^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate.id) &&
          !ids.has(candidate.id) &&
          typeof candidate.required === "boolean" &&
          array(candidate.intermediateAssets) &&
          candidate.intermediateAssets.length <= 16 &&
          array(candidate.route) &&
          candidate.route.length > 0 &&
          candidate.route.length <= 3,
        "InvalidInput",
        "candidate identity, required flag or route bounds are invalid",
      );
      ids.add(candidate.id);
      const common = {
        id: candidate.id,
        required: candidate.required,
        intermediateAssets: Object.freeze(
          Array.from(candidate.intermediateAssets, (asset) => parseAddress(asset)),
        ),
      };
      let result: SwapQuoteCandidate;
      if (candidate.family === "basic") {
        result = {
          ...common,
          family: candidate.family,
          route: validateBasicSwapRoute(Array.from(candidate.route), common.intermediateAssets),
        };
      } else {
        swapRequire(
          candidate.family === "concentrated-liquidity",
          "InvalidInput",
          "unsupported quote family",
        );
        const budget = Object.freeze({ ...candidate.budget });
        clSwapBudget(budget);
        result = {
          ...common,
          family: candidate.family,
          budget,
          route: validateCLSwapRoute(Array.from(candidate.route), common.intermediateAssets),
        };
      }
      swapRequire(
        result.route[0]!.tokenIn === tokenIn && result.route.at(-1)!.tokenOut === tokenOut,
        "InvalidInput",
        "candidate asset pair differs from request",
      );
      return Object.freeze(result);
    });
    return Object.freeze({
      tokenIn,
      tokenOut,
      account,
      amountIn,
      maxAgeBlocks,
      ...(input.blockNumber === undefined ? {} : { blockNumber: parseUint(input.blockNumber) }),
      eligibility: input.eligibility,
      candidates: Object.freeze(candidates),
    });
  } catch (cause) {
    if (cause instanceof SwapError) throw cause;
    const error = new SwapError("InvalidInput", "malformed quote request");
    error.cause = cause;
    throw error;
  }
}

function sameCoordinate(actual: ReadCoordinate, expected: ReadCoordinate): boolean {
  return (
    actual.networkId === expected.networkId &&
    actual.chainId === expected.chainId &&
    actual.blockNumber === expected.blockNumber &&
    parseHash32(actual.blockHash) === expected.blockHash
  );
}

function validateQuote(
  quote: BasicSwapQuote | CLSwapQuote,
  candidate: SwapQuoteCandidate,
  request: SwapQuoteRequest,
  coordinate: ReadCoordinate,
  timestamp: bigint,
): void {
  const route: readonly (BasicSwapQuote["route"][number] | CLSwapQuote["route"][number])[] =
    quote.route;
  swapRequire(
    sameCoordinate(quote.coordinate, coordinate) &&
      quote.timestamp === timestamp &&
      quote.sourceClass === "dex-execution-quote" &&
      typeof quote.providerId === "string" &&
      quote.providerId.length > 0 &&
      quote.account === request.account &&
      quote.amountIn === request.amountIn &&
      quote.maxAgeBlocks === request.maxAgeBlocks &&
      quote.inputToken.target.address === request.tokenIn &&
      quote.outputToken.target.address === request.tokenOut &&
      parseUint(quote.inputToken.decimals) <= 255n &&
      parseUint(quote.outputToken.decimals) <= 255n &&
      typeof quote.writeCompatible === "boolean" &&
      array(route) &&
      route.length === candidate.route.length &&
      Array.from(route, (hop, index) => {
        const expected = candidate.route[index]!;
        return (
          parseAddress(hop.tokenIn) === expected.tokenIn &&
          parseAddress(hop.tokenOut) === expected.tokenOut &&
          ("stable" in expected
            ? "stable" in hop && hop.stable === expected.stable
            : "tickSpacing" in hop && hop.tickSpacing === expected.tickSpacing)
        );
      }).every(Boolean) &&
      Array.isArray(quote.pools) &&
      quote.pools.length === candidate.route.length &&
      Array.isArray(quote.amounts) &&
      quote.amounts.length === candidate.route.length + 1 &&
      Array.from(quote.amounts, (amount) => parseUint(amount) > 0n).every(Boolean) &&
      quote.amounts[0] === request.amountIn &&
      quote.amounts.at(-1) === quote.estimatedAmountOut,
    "InconsistentQuote",
    "candidate returned different identity, units, amounts or coordinate",
  );
}

function fees(
  quote: BasicSwapQuote | CLSwapQuote,
  family: SwapQuoteCandidate["family"],
): readonly SwapQuoteFee[] {
  const pools: readonly (BasicSwapQuote["pools"][number] | CLSwapQuote["pools"][number])[] =
    quote.pools;
  return Object.freeze(
    Array.from(pools, (item, index) => {
      const pool = "snapshot" in item ? item.snapshot : item;
      const hop = quote.route[index]!,
        token = hop.tokenIn === pool.key.token0 ? pool.token0 : pool.token1;
      swapRequire(
        sameCoordinate(pool.coordinate, quote.coordinate) &&
          pool.account === quote.account &&
          token.target.address === hop.tokenIn &&
          [pool.key.token0, pool.key.token1].includes(hop.tokenOut) &&
          parseUint(token.decimals) <= 255n,
        "InconsistentQuote",
        "fee pool identity, units or coordinate differs",
      );
      let amount: bigint;
      if (family === "basic") {
        swapRequire("feeBps" in item, "InconsistentQuote", "basic fee snapshot required");
        amount = calculateBasicSwapFee({ amountIn: quote.amounts[index]!, feeBps: item.feeBps });
      } else {
        swapRequire(
          "feeAmount" in item &&
            item.amountIn === quote.amounts[index] &&
            item.amountOut === quote.amounts[index + 1],
          "InconsistentQuote",
          "CL fee traversal amounts differ",
        );
        amount = parseUint(item.feeAmount);
        swapRequire(
          amount < item.amountIn,
          "InconsistentQuote",
          "CL fee must be below gross input",
        );
      }
      return Object.freeze({
        pool: parseAddress(pool.pool),
        token: parseAddress(hop.tokenIn),
        decimals: token.decimals,
        amount,
      });
    }),
  );
}

/** Compare a bounded candidate set through existing source-verified reader ports. */
export function createSwapQuoteReader(config: SwapQuoteReaderConfig): Readonly<SwapQuoteReader> {
  swapRequire(config.networkId === "mezo-mainnet", "InvalidInput", "quote sets require mainnet");
  const { transport, basic, concentratedLiquidity } = config,
    network = getNetwork(config.networkId);
  return Object.freeze({
    async quote(input) {
      const request = normalize(input);
      const chainId = parseUint(await transport.getChainId()),
        initialHead = parseUint(await transport.getBlockNumber()),
        blockNumber = request.blockNumber ?? initialHead;
      swapRequire(
        chainId === network.evmChainId,
        "InconsistentQuote",
        "quote transport chain differs",
      );
      swapRequire(
        blockNumber <= initialHead && initialHead - blockNumber <= request.maxAgeBlocks,
        "BoundExceeded",
        "quote block is future or stale",
      );
      const block = await transport.getBlock(blockNumber);
      swapRequire(
        block !== null && block !== undefined && parseUint(block.number) === blockNumber,
        "InconsistentQuote",
        "quote block is unavailable or differs",
      );
      const coordinate = Object.freeze({
          networkId: network.id,
          chainId,
          blockNumber,
          blockHash: parseHash32(block.hash),
        }),
        timestamp = parseUint(await transport.getBlockTimestamp(coordinate));
      const results: SwapQuoteCandidateResult[] = [];
      let attempted = 0;
      for (const candidate of request.candidates) {
        const identity = { id: candidate.id, required: candidate.required };
        const reader = candidate.family === "basic" ? basic : concentratedLiquidity;
        if (reader === undefined) {
          results.push(
            Object.freeze({
              ...identity,
              status: "failed",
              issue: Object.freeze({
                code: "ReaderUnavailable",
                message: "no reader configured for this candidate family",
              }),
            }),
          );
          continue;
        }
        attempted++;
        let stage: "QuoteUnavailable" | "InvalidQuote" = "QuoteUnavailable";
        try {
          const common = {
            account: request.account,
            amountIn: request.amountIn,
            maxAgeBlocks: request.maxAgeBlocks,
            blockNumber,
            intermediateAssets: candidate.intermediateAssets,
          };
          const result =
            candidate.family === "basic"
              ? {
                  family: candidate.family,
                  quote: await basic!.quote({ ...common, route: candidate.route }),
                }
              : {
                  family: candidate.family,
                  quote: await concentratedLiquidity!.quote({
                    ...common,
                    route: candidate.route,
                    budget: candidate.budget,
                  }),
                };
          stage = "InvalidQuote";
          validateQuote(result.quote, candidate, request, coordinate, timestamp);
          const feeList = fees(result.quote, result.family);
          results.push(
            Object.freeze({
              ...identity,
              ...result,
              fees: feeList,
              status:
                request.eligibility === "writer-compatible" && !result.quote.writeCompatible
                  ? "ineligible"
                  : "quoted",
            }),
          );
        } catch (cause) {
          results.push(
            Object.freeze({
              ...identity,
              status: "failed",
              issue: Object.freeze({
                code: stage,
                message:
                  stage === "InvalidQuote"
                    ? "reader result failed quote-set validation"
                    : "candidate reader failed",
                cause,
              }),
            }),
          );
        }
      }
      const quoted = results.filter((result) => result.status !== "failed"),
        first = quoted[0]?.quote;
      for (const result of quoted)
        swapRequire(
          result.quote.inputToken.decimals === first!.inputToken.decimals &&
            result.quote.outputToken.decimals === first!.outputToken.decimals,
          "InconsistentQuote",
          "candidate token decimals disagree",
        );
      const finalHead = parseUint(await transport.getBlockNumber()),
        finalBlock = await transport.getBlock(blockNumber),
        finalChain = parseUint(await transport.getChainId());
      swapRequire(
        finalChain === chainId &&
          finalBlock !== null &&
          finalBlock !== undefined &&
          parseUint(finalBlock.number) === blockNumber &&
          parseHash32(finalBlock.hash) === coordinate.blockHash &&
          finalHead >= initialHead,
        "InconsistentQuote",
        "quote coordinate or chain changed during evaluation",
      );
      swapRequire(
        finalHead - blockNumber <= request.maxAgeBlocks,
        "BoundExceeded",
        "quote expired during evaluation",
      );
      const eligible = quoted
        .filter((result) => result.status === "quoted")
        .sort((a, b) =>
          a.quote.estimatedAmountOut > b.quote.estimatedAmountOut
            ? -1
            : a.quote.estimatedAmountOut < b.quote.estimatedAmountOut
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0,
        );
      const failed = results.length - quoted.length,
        requiredFailures = results.filter(
          (result) => result.required && result.status !== "quoted",
        ).length,
        ranked = Object.freeze(eligible.map((result) => result.id));
      return Object.freeze({
        state:
          requiredFailures > 0
            ? "incomplete"
            : ranked.length === 0
              ? "unavailable"
              : eligible.length < results.length
                ? "partial"
                : "complete",
        coordinate,
        timestamp,
        observedHead: finalHead,
        expiresAfterBlock: blockNumber + request.maxAgeBlocks,
        rankingPolicy: "highest-estimated-output",
        eligibility: request.eligibility,
        candidates: Object.freeze(results),
        ranked,
        best: requiredFailures > 0 ? null : (ranked[0] ?? null),
        coverage: Object.freeze({
          scope: "provided-candidates-only",
          requested: results.length,
          attempted,
          quoted: quoted.length,
          eligible: eligible.length,
          failed,
          requiredFailures,
        }),
        priceImpact: Object.freeze({
          status: "unavailable",
          reason: "no-validated-marginal-price-reference",
        }),
        gas: Object.freeze({ status: "not-estimated", rankingAdjustment: "none" }),
        currencyConversion: "none",
      });
    },
  } satisfies SwapQuoteReader);
}
