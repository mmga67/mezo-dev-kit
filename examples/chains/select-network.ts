import { getNetwork, isNetworkId, listNetworks } from "@mezo-dev-kit/chains";
import type { Network } from "@mezo-dev-kit/chains";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseRpcQuantity } from "@mezo-dev-kit/evm";

/** Validate application input and verify that the supplied RPC serves the selected chain. */
export async function selectNetwork(
  selection: unknown,
  request: RpcRequest,
): Promise<Readonly<Network>> {
  if (!isNetworkId(selection)) throw new TypeError("Choose a network returned by listNetworks()");
  const network = getNetwork(selection);
  // Registry metadata describes identity; only the supplied endpoint can report its current chain.
  const connectedChain = parseRpcQuantity(await request({ method: "eth_chainId", params: [] }));
  if (connectedChain !== network.evmChainId)
    throw new Error("RPC chain differs from the selected network");
  return network;
}

/** Values for a network picker. RPC URLs and credentials remain application configuration. */
export const networkChoices = listNetworks().map(({ id, displayName }) => ({ id, displayName }));
