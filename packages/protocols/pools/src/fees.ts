import { parseUint } from "@mezo-dev-kit/evm";
import { poolRequire } from "./basic.ts";
import { POOL_MODEL } from "./model.generated.ts";

export interface BasicPoolFeeInput {
  readonly balance: bigint;
  readonly index0: bigint;
  readonly index1: bigint;
  readonly supplyIndex0: bigint;
  readonly supplyIndex1: bigint;
  readonly claimable0: bigint;
  readonly claimable1: bigint;
}
export interface BasicPoolFees extends BasicPoolFeeInput {
  readonly pending0: bigint;
  readonly pending1: bigint;
}

/** Gross input fee removed before basic-pool invariant evaluation. */
export function calculateBasicSwapFee(input: {
  readonly amountIn: bigint;
  readonly feeBps: bigint;
}): bigint {
  const amount = parseUint(input.amountIn),
    fee = parseUint(input.feeBps),
    denominator = BigInt(POOL_MODEL.swapFeeDenominator);
  poolRequire(fee < denominator, "UnsafeState", "basic swap fee must be below its denominator");
  return parseUint(amount * fee) / denominator;
}

/** Pool._updateFor: checked uint256 products, floor each asset independently. */
export function calculateBasicPoolFees(input: BasicPoolFeeInput): Readonly<BasicPoolFees> {
  const balance = parseUint(input.balance),
    index0 = parseUint(input.index0),
    index1 = parseUint(input.index1);
  const supplyIndex0 = parseUint(input.supplyIndex0),
    supplyIndex1 = parseUint(input.supplyIndex1);
  const claimable0 = parseUint(input.claimable0),
    claimable1 = parseUint(input.claimable1);
  const pending = (index: bigint, user: bigint, stored: bigint) => {
    if (balance === 0n) return stored;
    poolRequire(index >= user, "UnsafeState", "fee index regressed");
    return parseUint(
      stored + parseUint(balance * (index - user)) / BigInt(POOL_MODEL.feeIndexScale),
    );
  };
  return Object.freeze({
    balance,
    index0,
    index1,
    supplyIndex0,
    supplyIndex1,
    claimable0,
    claimable1,
    pending0: pending(index0, supplyIndex0, claimable0),
    pending1: pending(index1, supplyIndex1, claimable1),
  });
}
