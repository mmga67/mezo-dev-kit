import * as OxValue from "ox/Value";

import { EvmValueError } from "./errors.ts";

/** Parse unsigned canonical decimal text exactly. Reject excess precision rather than round. */
export function parseUnitsExact(value: unknown, decimals: number, field = "amount"): bigint {
  assertDecimals(decimals);
  if (typeof value !== "string" || value.trim() !== value) {
    throw new EvmValueError("InvalidAmount", field);
  }
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new EvmValueError("InvalidAmount", field);
  if ((match[2]?.length ?? 0) > decimals) throw new EvmValueError("ExcessPrecision", field);
  // Ox rounds overprecision; the proof above deliberately excludes that branch.
  return OxValue.from(value, decimals);
}

/** Exact unsigned base-unit rendering, without locale, separators, exponent, or rounding. */
export function formatUnitsExact(value: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (typeof value !== "bigint" || value < 0n) {
    throw new EvmValueError("InvalidAmount", "amount");
  }
  return OxValue.format(value, decimals);
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new EvmValueError("InvalidDecimals", "decimals");
  }
}
