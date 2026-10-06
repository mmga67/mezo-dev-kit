import {
  createCLGaugeReader,
  createCLGaugeTargetResolver,
  createCLGaugeWriter,
} from "@mezo-dev-kit/incentives";
import type { CLGaugeAction } from "@mezo-dev-kit/incentives";
import type { CLPoolKey, CLPoolReader } from "@mezo-dev-kit/pools";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

export async function clGaugeCycle(
  runtime: WorkflowConnection,
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
    await runtime.review(simulated);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const { outcome } = await writer.reconcile(prepared, confirmed);

    invariant(outcome.boundsSatisfied, "CL gauge outcome exceeds bounds");
  }
  await perform("approve"); // Approve this NFT, not the entire collection.
  await perform("stake");
  await perform("claim-reward"); // The result may be zero when no reward has accrued.
  await perform("unstake");
}
