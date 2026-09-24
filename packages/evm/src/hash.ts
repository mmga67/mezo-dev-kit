import * as OxHash from "ox/Hash";
import { parseHash32, parseHexData } from "./hex.ts";
import type { Hash32 } from "./types.ts";

/** Ethereum Keccak-256 over validated bytes, including empty data. No text encoding. */
export function keccak256(value: unknown): Hash32 {
  return parseHash32(OxHash.keccak256(parseHexData(value)));
}

/**
 * Synchronous SHA-256 over hexadecimal bytes or a Uint8Array, including empty data.
 * Text must be explicitly UTF-8 encoded by the caller. The result is lowercase 0x hex.
 * @throws EvmValueError - InvalidHexData for input outside these byte representations.
 */
export function sha256(value: unknown): Hash32 {
  const bytes = value instanceof Uint8Array ? value : parseHexData(value);
  return parseHash32(OxHash.sha256(bytes, { as: "Hex" }));
}
