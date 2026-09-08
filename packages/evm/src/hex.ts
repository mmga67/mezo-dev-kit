import * as OxHex from "ox/Hex";

import { EvmValueError } from "./errors.ts";
import type { Hash32, HexData } from "./types.ts";

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

export function isHash32(value: unknown): value is Hash32 {
  return isHexData(value) && value.length === 66;
}

export function parseHash32(value: unknown, field = "hash"): Hash32 {
  if (!isHash32(value)) throw new EvmValueError("InvalidHash", field);
  return value.toLowerCase() as Hash32;
}
