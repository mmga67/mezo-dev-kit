import * as OxAddress from "ox/Address";

import { EvmValueError } from "./errors.ts";
import type { Address } from "./types.ts";

/** Shape only: accepts either case and the zero address; performs no checksum check. */
export function isAddress(value: unknown): value is Address {
  return typeof value === "string" && OxAddress.validate(value, { strict: false });
}

/** Validate RPC/registry representation and return lowercase; user input should use parseUserAddress. */
export function parseAddress(value: unknown, field = "address"): Address {
  if (!isAddress(value)) throw new EvmValueError("InvalidAddress", field);
  return value.toLowerCase() as Address;
}

/** Accept lowercase or an exact ERC-55 checksum, then normalize. Never discard a bad checksum. */
export function parseUserAddress(value: unknown, field = "address"): Address {
  if (!isAddress(value)) throw new EvmValueError("InvalidAddress", field);
  if (value !== value.toLowerCase() && OxAddress.checksum(value) !== value) {
    throw new EvmValueError("InvalidChecksum", field);
  }
  return value.toLowerCase() as Address;
}

/** Format a shape-valid address using ERC-55. This does not verify the input's checksum. */
export function formatChecksumAddress(value: Address): Address {
  return OxAddress.checksum(parseAddress(value)) as Address;
}
