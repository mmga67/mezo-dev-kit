import * as OxHex from "ox/Hex";

import { EvmValueError } from "./errors.ts";
import type { RpcQuantity } from "./types.ts";

export function isRpcQuantity(value: unknown): value is RpcQuantity {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)
  );
}

/** Parse canonical JSON-RPC quantity syntax; integer-width bounds belong to the caller. */
export function parseRpcQuantity(value: unknown, field = "quantity"): bigint {
  if (!isRpcQuantity(value)) throw new EvmValueError("InvalidRpcQuantity", field);
  return OxHex.toBigInt(value);
}

/** Encode non-negative bigint with minimal digits. Zero is 0x0, never 0x or 0x00. */
export function toRpcQuantity(value: bigint, field = "quantity"): RpcQuantity {
  if (typeof value !== "bigint" || value < 0n) {
    throw new EvmValueError("InvalidInteger", field);
  }
  return OxHex.fromNumber(value) as RpcQuantity;
}
