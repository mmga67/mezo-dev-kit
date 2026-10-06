import { createCLPoolReader, sortCLPoolKey } from "@mezo-dev-kit/pools";
import type { CLPoolKey } from "@mezo-dev-kit/pools";
import type { ReadConnection } from "../setup.ts";

/** Explicit candidate list; an initialized pool can still have no active liquidity. */
export async function selectCLPool(
  connection: ReadConnection,
  pair: {
    /** Address whose pool balances are read; no signer is needed. */
    readonly account: `0x${string}`;
    readonly tokenA: `0x${string}`;
    readonly tokenB: `0x${string}`;
  },
): Promise<CLPoolKey> {
  const reader = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry: connection.registry,
    transport: connection.transport,
  });
  for (const tickSpacing of [1, 10, 50, 100, 200, 2000]) {
    const key = sortCLPoolKey({ ...pair, tickSpacing });
    try {
      const pool = await reader.read({ key, account: pair.account });

      if (pool.liquidity > 0n && pool.unlocked && pool.writeCompatible) return key;
    } catch (error) {
      // An absent optional pool is expected; provider or identity failures remain fatal.
      if (!(error instanceof Error && "code" in error && error.code === "UnavailablePool"))
        throw error;
    }
  }
  throw new Error("No active compatible CL pool in the explicit candidate list");
}
