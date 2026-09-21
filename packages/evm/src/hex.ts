import * as OxHex from "ox/Hex";

import { EvmValueError } from "./errors.ts";
import type { Hash32, HexData } from "./types.ts";

/**
 * Check complete hexadecimal byte pairs with a lowercase 0x prefix, including empty data.
 */
export function isHexData(value: unknown): value is HexData {
  return (
    OxHex.validate(value, { strict: true }) && value.trim() === value && value.length % 2 === 0
  );
}

/** Validate bytes, preserve leading zeros and return lowercase. Empty data is valid. */
export function parseHexData(value: unknown, field = "data"): HexData {
  if (!isHexData(value)) throw new EvmValueError("InvalidHexData", field);
  return value.toLowerCase() as HexData;
}

/**
 * Check exactly 32 hexadecimal bytes; shape does not establish on-chain existence.
 */
export function isHash32(value: unknown): value is Hash32 {
  return isHexData(value) && value.length === 66;
}

/**
 * Validate a 32-byte hash and normalize its hexadecimal digits to lowercase.
 *
 * @throws EvmValueError - InvalidHash when the input is not exactly 32 hex bytes.
 */
export function parseHash32(value: unknown, field = "hash"): Hash32 {
  if (!isHash32(value)) throw new EvmValueError("InvalidHash", field);
  return value.toLowerCase() as Hash32;
}
