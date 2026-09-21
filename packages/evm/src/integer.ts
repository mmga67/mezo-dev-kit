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

/**
 * Validate a decoded bigint against an unsigned Solidity integer width.
 *
 * @param bits - Width from 8 through 256 in multiples of 8; defaults to 256.
 * @throws EvmValueError - Invalid width or a value outside the unsigned range.
 * @remarks
 * Numbers and decimal strings are not decoded bigint values and are rejected.
 */
export function parseUint(value: unknown, bits = 256, field = "integer"): bigint {
  if (!isUint(value, bits)) throw new EvmValueError("InvalidInteger", field);
  return value;
}

function assertBitWidth(bits: number): void {
  if (!Number.isInteger(bits) || bits < 8 || bits > 256 || bits % 8 !== 0) {
    throw new EvmValueError("InvalidBitWidth", "bits");
  }
}
