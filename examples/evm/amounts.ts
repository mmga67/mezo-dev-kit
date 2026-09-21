import {
  parseUserAddress,
  formatChecksumAddress,
  parseUnitsExact,
  formatUnitsExact,
  toRpcQuantity,
  parseRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { Address, RpcQuantity } from "@mezo-dev-kit/evm";

/** Validate form input and preserve exact amounts across user text, integer and RPC representations. */
export function prepareAmount(
  addressText: string,
  amountText: string,
  decimals: number,
): Readonly<{
  address: Address;
  displayAddress: string;
  baseUnits: bigint;
  displayAmount: string;
  rpcQuantity: RpcQuantity;
  roundTrip: bigint;
}> {
  const address = parseUserAddress(addressText);
  // Decimal text avoids floating-point rounding. Excess fractional precision rejects.
  const baseUnits = parseUnitsExact(amountText, decimals);
  const rpcQuantity = toRpcQuantity(baseUnits);
  return {
    address,
    displayAddress: formatChecksumAddress(address),
    baseUnits,
    displayAmount: formatUnitsExact(baseUnits, decimals),
    rpcQuantity,
    // RPC quantities are hex integers, which have a different contract from arbitrary hex data.
    roundTrip: parseRpcQuantity(rpcQuantity),
  };
}
