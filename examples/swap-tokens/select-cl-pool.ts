import { createCLPoolReader, sortCLPoolKey } from "@mezo-dev-kit/pools";
import type { CLPoolKey } from "@mezo-dev-kit/pools";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";

/** Explicit candidate list; an initialized pool can still have no active liquidity. */
export async function selectCLPool(
  runtime: ExampleRuntime,
  pair: {
    readonly tokenA: `0x${string}`;
    readonly tokenB: `0x${string}`;
  },
): Promise<CLPoolKey> {
  const reader = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  for (const tickSpacing of [1, 10, 50, 100, 200, 2000]) {
    const key = sortCLPoolKey({ ...pair, tickSpacing });
    try {
      const pool = await reader.read({ key, account: runtime.account });
      runtime.report("CL candidate", {
        pool: pool.pool,
        tickSpacing,
        liquidity: pool.liquidity,
        writeCompatible: pool.writeCompatible,
      });
      if (pool.liquidity > 0n && pool.unlocked && pool.writeCompatible) return key;
    } catch (error) {
      // An absent optional pool is expected; provider or identity failures remain fatal.
      if (!(error instanceof Error && "code" in error && error.code === "UnavailablePool"))
        throw error;
      runtime.report("CL candidate absent", { tickSpacing });
    }
  }
  throw new Error("No active compatible CL pool in the explicit candidate list");
}
