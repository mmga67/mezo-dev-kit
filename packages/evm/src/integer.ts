import { EvmValueError } from "./errors.ts";

/** A non-negative bigint, or canonical unsigned decimal integer text. No number coercion. */
export function parseUnsignedInteger(value: unknown, field = "integer"): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "string" && value.trim() === value && /^(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }
  throw new EvmValueError("InvalidInteger", field);
}

/** Validate a decoded Solidity uintN. Decoded values must already be bigint. */
export function isUint(value: unknown, bits = 256): value is bigint {
  assertBitWidth(bits);
  return typeof value === "bigint" && value >= 0n && value < 1n << BigInt(bits);
}

export function parseUint(value: unknown, bits = 256, field = "integer"): bigint {
  if (!isUint(value, bits)) throw new EvmValueError("InvalidInteger", field);
  return value;
}

function assertBitWidth(bits: number): void {
  if (!Number.isInteger(bits) || bits < 8 || bits > 256 || bits % 8 !== 0) {
    throw new EvmValueError("InvalidBitWidth", "bits");
  }
}
