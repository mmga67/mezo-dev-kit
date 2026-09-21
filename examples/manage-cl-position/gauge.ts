import {
  createCLGaugeReader,
  createCLGaugeTargetResolver,
  createCLGaugeWriter,
} from "@mezo-dev-kit/incentives";
import type { CLGaugeAction } from "@mezo-dev-kit/incentives";
import type { CLPoolKey, CLPoolReader } from "@mezo-dev-kit/pools";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

export async function clGaugeCycle(
  runtime: ExampleRuntime,
  pools: CLPoolReader,
  key: CLPoolKey,
  tokenId: bigint,
): Promise<void> {
  // Pools verifies the NFT and pool; Incentives owns gauge custody and rewards.
  const reader = createCLGaugeReader({
    registry: runtime.registry,
    transport: runtime.transport,
    positions: { read: (input) => pools.read({ ...input, key }) },
  });
  const execution = runtime.createExecution(
    createCLGaugeTargetResolver({ reader, account: runtime.account, tokenId }),
  );
  const writer = createCLGaugeWriter({ reader, execution, transport: runtime.transport });
  async function perform(action: CLGaugeAction): Promise<void> {
    const prepared = await writer.prepare({
      operationId: runtime.operationId(`cl-gauge-${action}`),
      account: runtime.account,
      tokenId,
      action,
      bounds: { minReward: 0n, minFee0: 0n, minFee1: 0n, maxBlockAge: 2n },
    });
    const simulated = await writer.simulate(prepared);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const { outcome } = await writer.reconcile(prepared, confirmed);
    runtime.report(`CL gauge ${action}`, {
      tokenId,
      reward: outcome.reward,
      fee0: outcome.fee0,
      fee1: outcome.fee1,
      staked: outcome.snapshot.staked,
    });
    invariant(outcome.boundsSatisfied, "CL gauge outcome exceeds bounds");
  }
  await perform("approve"); // Approve this NFT, not the entire collection.
  await perform("stake");
  await perform("claim-reward"); // The result may be zero when no reward has accrued.
  await perform("unstake");
}
