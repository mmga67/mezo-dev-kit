import { createContractRegistry, isContractId } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import type { NetworkId } from "@mezo-dev-kit/chains";

/** Resolve an application-selected identity at the exact block its reads will use. */
export function inspectDeployment(
  contractId: unknown,
  networkId: NetworkId,
  blockNumber: bigint,
): Readonly<ResolvedContract> {
  if (!isContractId(contractId)) throw new TypeError("Unknown MDK contract ID");
  const registry = createContractRegistry();
  // A proxy may have different implementations at different blocks. Never replace this
  // coordinate with today's address when decoding a historical call or receipt.
  const contract = registry.resolve({ contractId, networkId, blockNumber });
  // contract.readAbi contains callable read interfaces; contract.abi contains digest metadata.
  return contract;
}
