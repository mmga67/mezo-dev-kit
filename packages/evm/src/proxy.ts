import { parseAddress } from "./address.ts";
import { EvmValueError } from "./errors.ts";
import { parseHexData } from "./hex.ts";
import type { Address } from "./types.ts";

/** Decode only the standard 45-byte ERC-1167 runtime, not deployment/vanity/extended variants.
 * Specification: https://eips.ethereum.org/EIPS/eip-1167#specification
 * The result establishes representation only; callers verify implementation code and topology.
 */
export function parseMinimalProxyImplementation(value: unknown): Address {
  const code = parseHexData(value, "proxyCode");
  if (
    code.length !== 92 ||
    !code.startsWith("0x363d3d373d3d3d363d73") ||
    !code.endsWith("5af43d82803e903d91602b57fd5bf3")
  )
    throw new EvmValueError("InvalidProxyCode", "proxyCode");
  return parseAddress(`0x${code.slice(22, 62)}`);
}
