import { createVaultReader, wrapperToVaultShares } from "@mezo-dev-kit/usdc-lending-vault";
import type { VaultReaderConfig, VaultSnapshot } from "@mezo-dev-kit/usdc-lending-vault";
/** Ports must honor fixed coordinates and allow discovered roles without a static Contract ID. */
export async function readVaultExample(
  config: VaultReaderConfig,
  input: {
    readonly account: `0x${string}`;
    readonly blockNumber: bigint;
    readonly maxPriceAgeSeconds: bigint;
    readonly previewAssets: bigint;
    readonly previewShares: bigint;
  },
): Promise<Readonly<VaultSnapshot>> {
  return createVaultReader(config).read(input);
}
// Synthetic offline calculation; no RPC, wallet, or value-bearing action.
if (wrapperToVaultShares(1000n, 9000n, 8000n) !== 999n)
  throw new Error("Built vault calculation failed");
