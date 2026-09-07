import { calculateSavingsYield, createSavingsReader } from "@mezo-dev-kit/musd-savings";
import type { SavingsReaderConfig, SavingsSnapshot } from "@mezo-dev-kit/musd-savings";

/** Supply the application's explicit transport/codec; no endpoint or wallet is selected here. */
export async function readSavingsExample(
  config: SavingsReaderConfig,
  account: `0x${string}`,
  blockNumber: bigint,
): Promise<Readonly<SavingsSnapshot>> {
  return createSavingsReader(config).read({ account, blockNumber });
}

// Runnable offline accounting example. This does not exercise an RPC provider or codec.
const yieldState = calculateSavingsYield({
  balance: 333n,
  yieldIndex: 100000000000000000n,
  supplyYieldIndex: 0n,
  storedClaimableYield: 2n,
});
if (yieldState.indexedUnclaimed.baseUnits !== 33n || yieldState.claimable.baseUnits !== 35n)
  throw new Error("Savings built accounting example failed");
