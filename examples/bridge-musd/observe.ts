import { readFile } from "node:fs/promises";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createNttDeliveryObserver, createNativeDeliveryObserver } from "@mezo-dev-kit/bridges";
import { createHttpRequest } from "../runtime/rpc-request.ts";
import { saveCheckpoint } from "../runtime/checkpoint.ts";
import type { Report } from "../runtime/output.ts";
import { routeId } from "./workflow.ts";
import { historicalInput, parseObservationInput } from "./evidence-input.ts";

/** Historical Mezo→Ethereum receipt observation. No signer, relayer, or source transfer. */
export async function observeBridgeFile(options: {
  readonly sourceUrl: string;
  readonly destinationUrl: string;
  readonly inputFile?: string;
  readonly repositoryRoot: string;
  readonly outputFile: string;
  readonly native: boolean;
  readonly report: Report;
}): Promise<void> {
  const input = parseObservationInput(
    options.inputFile
      ? (JSON.parse(await readFile(options.inputFile, "utf8")) as unknown)
      : await historicalInput(options.repositoryRoot, options.native),
  );
  const sourceTransport = createRpcTransport({
    id: "historical-source",
    request: createHttpRequest({ url: options.sourceUrl, policy: "read-only" }),
  });
  const destinationTransport = createRpcTransport({
    id: "historical-destination",
    request: createHttpRequest({ url: options.destinationUrl, policy: "read-only" }),
  });
  const config = {
    sourceTransport,
    destinationTransport,
    sourceConfirmations: 12n,
    destinationConfirmations: 12n,
  };
  // Native evidence validates the transfer tuple and destination settlement;
  // it is a different proof path from NTT digest matching.
  const observation = options.native
    ? await createNativeDeliveryObserver({
        ...config,
        routeId: "mezo-native-btc-mezo-to-ethereum",
      }).observe(input)
    : await createNttDeliveryObserver({ ...config, routeId }).observe(input);
  await saveCheckpoint(options.outputFile, observation);
  options.report("Historical delivery observation", observation);
}
