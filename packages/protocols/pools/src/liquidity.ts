import { parseUint } from "@mezo-dev-kit/evm";
import { poolRequire } from "./basic.ts";
import type {
  BasicLiquidityAction,
  BasicLiquidityBounds,
  BasicLiquidityForecast,
  BasicPoolSnapshot,
} from "./types.ts";

/** Current basic Router/Pool integer sequence for already initialized pools. */
export function forecastBasicLiquidity(
  snapshot: BasicPoolSnapshot,
  action: BasicLiquidityAction,
  bounds: BasicLiquidityBounds,
): Readonly<BasicLiquidityForecast> {
  poolRequire(
    snapshot.writeCompatible === true,
    "UnavailablePool",
    "pool assets are outside current writer compatibility",
  );
  const reserve0 = parseUint(snapshot.reserve0),
    reserve1 = parseUint(snapshot.reserve1),
    supply = parseUint(snapshot.totalSupply);
  for (const value of [
    bounds.minAmount0,
    bounds.minAmount1,
    bounds.minLiquidity,
    bounds.deadline,
    bounds.maxDeadlineSeconds,
    bounds.maxBlockAge,
    snapshot.timestamp,
  ])
    parseUint(value);
  poolRequire(
    reserve0 > 0n && reserve1 > 0n && supply > 0n,
    "UnavailablePool",
    "liquidity writer requires an initialized nonempty pool",
  );
  poolRequire(
    parseUint(snapshot.poolBalance0) === reserve0 &&
      parseUint(snapshot.poolBalance1) === reserve1 &&
      parseUint(snapshot.poolLpBalance) === 0n,
    "UnsafeState",
    "pool reserves or LP custody contain unexplained funds",
  );
  poolRequire(
    bounds.minAmount0 > 0n &&
      bounds.minAmount1 > 0n &&
      bounds.deadline > snapshot.timestamp &&
      bounds.deadline - snapshot.timestamp <= bounds.maxDeadlineSeconds &&
      bounds.maxDeadlineSeconds > 0n,
    "InvalidInput",
    "explicit nonzero minimums and bounded future deadline required",
  );
  const mulDiv = (a: bigint, b: bigint, denominator: bigint) => parseUint(a * b) / denominator;
  let amount0: bigint, amount1: bigint, liquidity: bigint;
  if (action.kind === "add") {
    const desired0 = parseUint(action.amount0Desired),
      desired1 = parseUint(action.amount1Desired);
    poolRequire(
      desired0 >= bounds.minAmount0 && desired1 >= bounds.minAmount1 && bounds.minLiquidity > 0n,
      "InvalidInput",
      "desired amounts or minimum LP output invalid",
    );
    const optimal1 = mulDiv(desired0, reserve1, reserve0);
    amount0 = optimal1 <= desired1 ? desired0 : mulDiv(desired1, reserve0, reserve1);
    amount1 = optimal1 <= desired1 ? optimal1 : desired1;
    const l0 = mulDiv(amount0, supply, reserve0),
      l1 = mulDiv(amount1, supply, reserve1);
    liquidity = l0 < l1 ? l0 : l1;
    // Approve desired maxima; a later reserve ratio can select another split.
    poolRequire(
      parseUint(snapshot.token0.balance) >= desired0 &&
        parseUint(snapshot.token1.balance) >= desired1,
      "BoundExceeded",
      "insufficient desired token balances",
    );
    poolRequire(liquidity >= bounds.minLiquidity, "BoundExceeded", "LP estimate below minimum");
  } else {
    poolRequire(action.kind === "remove", "InvalidInput", "unsupported basic liquidity action");
    liquidity = parseUint(action.liquidity);
    poolRequire(
      bounds.minLiquidity === 0n &&
        liquidity > 0n &&
        liquidity <= parseUint(snapshot.lp.balance) &&
        liquidity < supply,
      "InvalidInput",
      "invalid LP withdrawal or bounds",
    );
    amount0 = mulDiv(liquidity, reserve0, supply);
    amount1 = mulDiv(liquidity, reserve1, supply);
  }
  poolRequire(
    liquidity > 0n && amount0 >= bounds.minAmount0 && amount1 >= bounds.minAmount1,
    "BoundExceeded",
    "liquidity estimate below token minimums",
  );
  const sign = action.kind === "add" ? 1n : -1n;
  return Object.freeze({
    kind: action.kind,
    amount0,
    amount1,
    liquidity,
    nextReserve0: parseUint(reserve0 + sign * amount0),
    nextReserve1: parseUint(reserve1 + sign * amount1),
    nextTotalSupply: parseUint(supply + sign * liquidity),
  });
}
