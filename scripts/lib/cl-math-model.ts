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
  return { constants, tickMultipliers, sourceDigest: poolSourceDigest(bundle) };
}
