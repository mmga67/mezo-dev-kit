import { parseUint } from "@mezo-dev-kit/evm";

/** Application slippage policy in basis points; never silently round the minimum to zero. */
export function minimumAfterSlippage(estimate: bigint, basisPoints: bigint): bigint {
  parseUint(estimate);
  parseUint(basisPoints);
  if (basisPoints >= 10_000n) throw new RangeError("Slippage must be below 100 percent");
  const minimum = (estimate * (10_000n - basisPoints)) / 10_000n;
  if (minimum === 0n) throw new RangeError("Amount is too small for a nonzero output minimum");
  return minimum;
}
