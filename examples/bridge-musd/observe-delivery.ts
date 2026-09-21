import { createNttDeliveryObserver } from "@mezo-dev-kit/bridges";
import type { NttObserveInput, NttDeliveryObservation } from "@mezo-dev-kit/bridges";
import type { RpcTransport } from "@mezo-dev-kit/core";

/** Observe a known source transfer and supplied destination evidence without a signer or submission client. */
export async function observeDelivery(
  sourceTransport: RpcTransport,
  destinationTransport: RpcTransport,
  input: NttObserveInput,
  confirmations: { readonly source: bigint; readonly destination: bigint },
): Promise<Readonly<NttDeliveryObservation>> {
  const observer = createNttDeliveryObserver({
    routeId: "wormhole-ntt-musd-mezo-to-ethereum",
    sourceTransport,
    destinationTransport,
    sourceConfirmations: confirmations.source,
    destinationConfirmations: confirmations.destination,
  });
  // Include prior canonical anchors when resuming. Missing destination evidence remains pending
  // or unavailable; neither condition authorizes initiating the source transfer again.
  return observer.observe(input);
}
