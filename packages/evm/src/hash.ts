import * as OxHash from "ox/Hash";
import { parseHash32, parseHexData } from "./hex.ts";
import type { Hash32 } from "./types.ts";

/** Ethereum Keccak-256 over validated bytes, including empty data. No text encoding. */
export function keccak256(value: unknown): Hash32 {
  return parseHash32(OxHash.keccak256(parseHexData(value)));
}
