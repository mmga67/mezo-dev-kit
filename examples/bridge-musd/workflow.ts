import { sendMusd } from "./send.ts";
import type { BridgeCheckpoint } from "./checkpoint.ts";
import { observeDelivery } from "./observe-delivery.ts";
import type { NttObserveInput, NttDeliveryObservation } from "@mezo-dev-kit/bridges";
import type { RpcTransport } from "@mezo-dev-kit/core";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import type { ReadConnection } from "../setup.ts";

export const routeId = "wormhole-ntt-musd-mezo-to-ethereum";
export type { BridgeCheckpoint } from "./checkpoint.ts";

/** Persist source identity first. A source receipt does not prove destination payment. */
export async function bridgeMusd(
  connection: WorkflowConnection,
  destination: RpcTransport,
  input: Omit<Parameters<typeof sendMusd>[2], "operationId">,
  persist: (checkpoint: BridgeCheckpoint) => Promise<void>,
): Promise<BridgeCheckpoint> {
  // The application supplies the recipient, source amount/precision, fee and age bounds.
  return sendMusd(
    connection,
    destination,
    { ...input, operationId: connection.operationId("ntt-send") },
    persist,
    connection.polling,
  );
}

/** Resume observation from saved hashes. This needs no wallet and never sends a transfer. */
export async function observeNtt(
  connection: ReadConnection,
  destination: RpcTransport,
  input: NttObserveInput,
): Promise<Readonly<NttDeliveryObservation>> {
  return observeDelivery(connection.transport, destination, input, {
    source: 1n,
    destination: 12n,
  });
}
