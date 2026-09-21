import { createSkipPriceReader } from "@mezo-dev-kit/prices";
import type { SkipPriceReadInput, SkipPriceObservation } from "@mezo-dev-kit/prices";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";

/** Read Skip with explicit Unix-second time and scaling policy; no signer is needed. */
export async function readSkipPrice(
  registry: ContractRegistry,
  transport: RpcTransport,
  input: SkipPriceReadInput,
): Promise<Readonly<SkipPriceObservation>> {
  const reader = createSkipPriceReader({ networkId: "mezo-mainnet", registry, transport });
  const observation = await reader.read(input);
  // Retain source/coordinate/limitations even when invalid. The consuming application must
  // inspect status; this direct feed does not replace Borrowing's or Lending's protocol oracle.
  return observation;
}
