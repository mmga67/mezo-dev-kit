import {
  normalizePriceAmount,
  normalizePriceConfidence,
  evaluatePriceFreshness,
} from "@mezo-dev-kit/prices";
import type {
  PriceAmountInput,
  PriceAmountResult,
  PriceFreshness,
  PriceConfidenceResult,
} from "@mezo-dev-kit/prices";

/** Apply explicit scale and age policy to an identified source's datum, without reading a clock or RPC. */
export function evaluatePrice(input: {
  readonly amount: PriceAmountInput;
  readonly confidence: bigint | null;
  readonly publishedAt: bigint | null;
  readonly asOf: bigint;
  readonly maxAgeSeconds: bigint;
}): Readonly<{
  amount: PriceAmountResult;
  freshness: PriceFreshness;
  confidence: PriceConfidenceResult;
  validAmountAndTime: boolean;
}> {
  // Amount normalization and freshness answer independent questions; retain both results.
  const amount = normalizePriceAmount(input.amount);
  const freshness = evaluatePriceFreshness(input);
  // Null means the source supplied no confidence. It does not mean zero uncertainty.
  const confidence = normalizePriceConfidence({ ...input.amount, raw: input.confidence });
  return {
    amount,
    freshness,
    confidence,
    validAmountAndTime: amount.status === "valid" && freshness.status === "valid",
  };
}
