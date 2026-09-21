import { getNetwork } from "@mezo-dev-kit/chains";
import type { NetworkId } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadTransport } from "@mezo-dev-kit/core";

/** Check an injected provider's chain identity before making application reads. */
export async function checkNetwork(
  networkId: NetworkId,
  transport: CoreReadTransport,
): Promise<{
  readonly networkId: NetworkId;
  readonly expectedChainId: bigint;
  readonly transportChainId: bigint;
}> {
  const network = getNetwork(networkId);
  const client = createCoreReadClient({ network, transport, registry: createContractRegistry() });
  const identity = await client.assertChain();
  return { networkId: network.id, ...identity };
}
