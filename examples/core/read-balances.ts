import { createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadClientConfig, ReadCoordinate } from "@mezo-dev-kit/core";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import { createAbiCodec, parseHexData, parseUint, parseUserAddress } from "@mezo-dev-kit/evm";
import { invariant } from "../runtime/validation.ts";

/** Read two MUSD balances at one block/hash, with explicit ABI encoding and decoding. */
export async function readMusdBalances(
  { network, registry, transport }: CoreReadClientConfig,
  firstAccount: string,
  secondAccount: string,
): Promise<
  Readonly<{ coordinate: Readonly<ReadCoordinate>; firstBalance: bigint; secondBalance: bigint }>
> {
  const client = createCoreReadClient({ network, registry, transport });
  // Contracts owns the ABI; EVM owns its encoding. Neither selects an RPC endpoint.
  const balanceOf = getTokenInterface().find(
    (entry) => entry.type === "function" && entry.name === "balanceOf",
  );
  invariant(balanceOf, "Canonical token balanceOf interface is unavailable");
  const codec = createAbiCodec();
  const result = await client.readCoherent({
    calls: [
      {
        id: "first",
        contractId: "musd.token",
        data: codec.encodeFunction(balanceOf, [parseUserAddress(firstAccount)]),
      },
      {
        id: "second",
        contractId: "musd.token",
        data: codec.encodeFunction(balanceOf, [parseUserAddress(secondAccount)]),
      },
    ],
  });
  // Both calls are required. Keep their shared coordinate and reject unavailable data instead of inventing zero.
  const first = result.reads.first,
    second = result.reads.second;
  invariant(
    first?.status === "available" && second?.status === "available",
    "Required balance read is unavailable",
  );
  return {
    coordinate: result.coordinate,
    firstBalance: parseUint(codec.decodeFunction(balanceOf, parseHexData(first.value))[0]),
    secondBalance: parseUint(codec.decodeFunction(balanceOf, parseHexData(second.value))[0]),
  };
}
