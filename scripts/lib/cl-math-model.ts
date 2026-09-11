import { loadPoolSourceBundle, poolSourceDigest, selectPoolSource } from "./pool-source.ts";
import { object, text } from "./json.ts";

/** Project numerical TickMath coefficients from the retained, digest-verified source. */
export async function clMathModel(
  root: string,
  record: unknown,
): Promise<{
  constants: Record<string, unknown>;
  tickMultipliers: readonly string[];
  sourceDigest: string;
  swapFeeScale: string;
  swapSourceDigest: string;
}> {
  const model = object(record, "CL math"),
    constants = object(model.constants, "CL constants");
  if (model.status !== "verified" || model.reviewStatus !== "accepted")
    throw new Error("CL math requires accepted canonical inputs");
  const bundle = await loadPoolSourceBundle(root, "mezo-earn.cl-position-manager"),
    source = selectPoolSource(bundle, "contracts/slipstream/core/libraries/TickMath.sol");
  const first =
    /uint256 ratio = absTick & 0x1 != 0\s*\? (0x[0-9a-f]+)\s*:\s*0x100000000000000000000000000000000;/.exec(
      source,
    )?.[1];
  if (!first) throw new Error("TickMath initial coefficient unavailable");
  const tickMultipliers = [first];
  for (const match of source.matchAll(
    /if \(absTick & (0x[0-9a-f]+) != 0\)\s*ratio = \(ratio \* (0x[0-9a-f]+)\) >> 128;/g,
  )) {
    if (BigInt(match[1] ?? "0") !== 1n << BigInt(tickMultipliers.length) || !match[2])
      throw new Error("TickMath coefficient order differs");
    tickMultipliers.push(match[2]);
  }
  if (
    tickMultipliers.length !== 20 ||
    !source.includes(`MIN_TICK = ${String(constants.minTick)};`) ||
    !source.includes("MAX_TICK = -MIN_TICK;") ||
    constants.maxTick !== -Number(constants.minTick) ||
    !source.includes(`MIN_SQRT_RATIO = ${text(constants.minSqrtRatioX96, "minimum ratio")};`) ||
    !new RegExp(`MAX_SQRT_RATIO =\\s*${text(constants.maxSqrtRatioX96, "maximum ratio")};`).test(
      source,
    ) ||
    BigInt(text(constants.Q96, "Q96")) !== 1n << 96n ||
    BigInt(text(constants.Q128, "Q128")) !== 1n << 128n
  )
    throw new Error("TickMath source and accepted model differ");
  const poolBundle = await loadPoolSourceBundle(root, "mezo-earn.cl-pool-implementation");
  const swapMath = selectPoolSource(poolBundle, "contracts/slipstream/core/libraries/SwapMath.sol");
  const pool = selectPoolSource(poolBundle, "contracts/slipstream/core/CLPool.sol");
  const feeScale = /uint256\(amountRemaining\),\s*(\d+e\d+) - feePips,/.exec(swapMath)?.[1];
  if (!feeScale || !/unstakedFee\(\),\s*1_000_000/.test(pool) || Number(feeScale) !== 1_000_000)
    throw new Error("CL swap and fee split scales differ");
  return {
    constants,
    tickMultipliers,
    sourceDigest: poolSourceDigest(bundle),
    swapFeeScale: String(Number(feeScale)),
    swapSourceDigest: poolSourceDigest(poolBundle),
  };
}
