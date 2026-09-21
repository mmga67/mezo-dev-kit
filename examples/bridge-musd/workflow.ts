import { sendMusd } from "./send.ts";
import type { BridgeCheckpoint } from "./checkpoint.ts";
import { observeDelivery } from "./observe-delivery.ts";
import type { NttObserveInput, NttDeliveryObservation } from "@mezo-dev-kit/bridges";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { parseUint, parseUnitsExact } from "@mezo-dev-kit/evm";

import type { ExampleRuntime } from "../runtime/example-runtime.ts";

import { readWalletToken } from "../runtime/token-units.ts";

export const routeId = "wormhole-ntt-musd-mezo-to-ethereum";
export type { BridgeCheckpoint } from "./checkpoint.ts";

/** Send on the source fork. Destination observations are independent of source success. */
export async function bridgeMusd(
  runtime: ExampleRuntime,
  destination: RpcTransport,
  persist: (checkpoint: BridgeCheckpoint) => Promise<void>,
): Promise<BridgeCheckpoint> {
  const sourceToken = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: parseUint(await runtime.transport.getBlockNumber()),
  });
  const wallet = await readWalletToken(runtime, {
    contractId: sourceToken.contractId,
    address: sourceToken.address,
  });
  // Parse source units first; NTT then verifies both endpoints and transport precision.
  const input = {
    operationId: runtime.operationId("ntt-send"),
    expectedSourceDecimals: Number(wallet.decimals),
    quote: {
      account: runtime.account,
      recipient: runtime.account,
      refundRecipient: runtime.account,
      amount: parseUnitsExact("10", Number(wallet.decimals)),
      shouldQueue: true,
      maxNativeFee: parseUnitsExact("0.001", runtime.network.nativeCurrency.decimals),
      maxSourceAgeBlocks: 2n,
      maxDestinationAgeBlocks: 4n,
    },
  };
  const checkpoint = await sendMusd(runtime, destination, input, persist, runtime.polling);
  runtime.report("NTT source checkpoint", checkpoint);
  await observeNtt(runtime, destination, {
    sourceTransactionHash: checkpoint.sourceTransactionHash,
    destinationTransactionHashes: [],
    ...(checkpoint.outcome.digest === null ? {} : { expectedDigest: checkpoint.outcome.digest }),
  });
  return checkpoint;
}

/** Resume from transaction hashes and optional prior canonical anchors; never initiate again. */
export async function observeNtt(
  runtime: ExampleRuntime,
  destination: RpcTransport,
  input: NttObserveInput,
): Promise<Readonly<NttDeliveryObservation>> {
  const observation = await observeDelivery(runtime.transport, destination, input, {
    source: 1n,
    destination: 12n,
  });
  runtime.report("NTT delivery evidence", observation);
  return observation;
}
