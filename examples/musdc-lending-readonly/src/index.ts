import { calculateLendingInterest, createLendingReader } from "@mezo-dev-kit/musdc-lending";
import type { LendingReaderConfig, LendingSnapshot } from "@mezo-dev-kit/musdc-lending";
/** The application owns the provider, ABI codec, token balance port, and freshness policy. */
export async function readLendingExample(
  config: LendingReaderConfig,
  account: `0x${string}`,
  blockNumber: bigint,
  maxPriceAgeSeconds: bigint,
): Promise<Readonly<LendingSnapshot>> {
  return createLendingReader(config).read({ account, blockNumber, maxPriceAgeSeconds });
}
// Offline, synthetic calculation. The RPC integration above requires the application's ports.
if (calculateLendingInterest(1_000_000_000_000n, 3600n, 1_000_000n).interest !== 3606n)
  throw new Error("Built lending calculation failed");
