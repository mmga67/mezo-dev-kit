import { redeemCollateral } from "./redeem.ts";
import {
  createRedemptionReader,
  createRedemptionWriter,
  createRedemptionTraceSimulator,
} from "@mezo-dev-kit/musd-redemptions";
import type { RedemptionOutcome } from "@mezo-dev-kit/musd-redemptions";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { readWalletToken } from "../runtime/token-units.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";

import { invariant } from "../runtime/validation.ts";

/** Exchange MUSD for collateral from the ordered trove queue, with bounded discovery. */
export async function redeemMusd(
  runtime: ExampleRuntime,
  request: RpcRequest,
): Promise<Readonly<RedemptionOutcome>> {
  const reader = createRedemptionReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const before = await reader.read({ account: runtime.account });
  const token = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: before.borrowing.coordinate.blockNumber,
  });
  const wallet = await readWalletToken(runtime, {
    contractId: token.contractId,
    address: token.address,
  });
  const quoteInput = {
    account: runtime.account,
    requestedAmount: parseUnitsExact("100", Number(wallet.decimals)),
    amountMode: "truncate" as const,
    maxIterations: 10n,
    maxTailScan: 32,
    trials: 3n,
    seed: 42n,
  };
  const quote = await reader.quote(quoteInput);
  const execution = runtime.createExecution();
  const simulator = createRedemptionTraceSimulator({
    request,
    transport: runtime.transport,
    providerId: runtime.transport.id,
    timeoutMs: 30000,
    maxFrames: 1024,
    maxLogs: 1024,
    maxDepth: 64,
    maxDataBytes: 262144,
  });
  const writer = createRedemptionWriter({
    reader,
    execution,
    simulator,
    transport: runtime.transport,
  });
  // The trace must expose the Redemption event from the exact call. A successful
  // eth_call with empty return data cannot establish the collateral output.
  const preliminary = await writer.prepare({
    operationId: runtime.operationId("redeem"),
    quote: quoteInput,
    bounds: {
      minActualAmount: 1n,
      minNetCollateral: 1n,
      maxRedemptionRate: parseUnitsExact("0.01", 18),
      maxBlockAge: 2n,
    },
  });
  const preview = await writer.simulate(preliminary);
  const estimated = await simulator.simulate({
    call: preview.call,
    coordinate: preview.prepared.coordinate,
  });
  const redemptionInput = {
    operationId: runtime.operationId("redeem"),
    quote: quoteInput,
    bounds: {
      ...preliminary.bounds,
      minActualAmount: minimumAfterSlippage(estimated.actualAmount, 50n),
      minNetCollateral: minimumAfterSlippage(estimated.netCollateral, 50n),
    },
  };
  runtime.report("Redemption quote", {
    requested: quoteInput.requestedAmount,
    attempted: quote.attemptedAmount,
    helperTruncated: quote.helperTruncatedAmount,
    entriesChecked: quote.tailEntriesChecked,
    estimated,
  });
  // TroveManager burns MUSD directly; this action has no token approval.
  const outcome = await redeemCollateral(runtime, simulator, redemptionInput, runtime.polling);
  runtime.report("Redemption settled", {
    ...outcome.amounts,
    gasFee: outcome.gasFee,
    closedBorrowers: outcome.closedBorrowers,
    partialBorrowers: outcome.partialBorrowers,
    boundsSatisfied: outcome.boundsSatisfied,
  });
  invariant(
    outcome.boundsSatisfied,
    "Redemption settled outside bounds; do not automatically redeem again",
  );
  return outcome;
}
