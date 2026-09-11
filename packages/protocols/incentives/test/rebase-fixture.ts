import assert from "node:assert/strict";
import { createContractRegistry, getTokenInterface, resolveEvent } from "@mezo-dev-kit/contracts";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import type { RebaseSnapshot } from "../src/index.ts";
import {
  calculateLockVotingPower,
  calculateRebaseClaim,
  calculateVotingEpoch,
  forecastRebaseClaim,
} from "../src/index.ts";
import { lockFixture, week } from "./lock-fixture.ts";
import { fixtureLog } from "./voting-fixture.ts";
export function rebaseFixture(
  kind: "permanent" | "active" | "expired" | "zero" = "permanent",
): RebaseSnapshot {
  const base = lockFixture(),
    registry = createContractRegistry();
  const contract = registry.resolve({
      ...base.coordinate,
      contractId: "incentives.mezo-rebase-distributor",
    }),
    minter = registry.resolve({ ...base.coordinate, contractId: "incentives.mezo-minter" }),
    escrowContract = registry.resolve({ ...base.coordinate, contractId: "incentives.ve-mezo" });
  const cursor = {
      startTime: week,
      lastTokenTime: 3n * week + 1n,
      timeCursor: 0n,
      firstUserTimestamp: week + 1n,
    },
    timestamp = 3n * week + 2n,
    periods = [1n, 2n].map((i) => ({
      week: i * week,
      votingPower: 1n,
      totalVotingPower: 3n,
      allocated: kind === "zero" ? 0n : 10n,
    }));
  const lock = base.locks[0];
  assert(lock);
  const permanent = kind === "permanent" || kind === "zero",
    end = permanent ? 0n : (kind === "expired" ? 3n : 5n) * week;
  const power = calculateLockVotingPower({
    amount: lock.amount,
    boost: 0n,
    end,
    permanent,
    maxLockSeconds: base.maxLockSeconds,
    timestamp,
  });
  return {
    ...cursor,
    contract,
    minter,
    tokenId: 1n,
    activePeriod: 3n * week,
    tokenLastBalance: 100n,
    userPointEpoch: 2n,
    periods,
    claim: calculateRebaseClaim({ ...cursor, periods }),
    custody: {
      ...base.token,
      account: contract.address,
      spender: escrowContract.address,
      balance: 100n,
      allowance: 100n,
    },
    escrow: {
      ...base,
      contract: escrowContract,
      role: "vemezo-current",
      timestamp,
      epoch: calculateVotingEpoch(timestamp),
      token: { ...base.token, spender: escrowContract.address },
      permanentBalance: permanent ? lock.amount : 0n,
      virtualPermanentBalance: permanent ? lock.amount : 0n,
      locks: [
        {
          ...lock,
          permanent,
          end,
          currentVotingPower: power.boosted,
          currentUnboostedPower: power.unboosted,
          atTimeVotingPower: power.boosted,
          lockPowerEstimate: power,
          voted: true,
          voters: [minter.address],
        },
      ],
    },
  };
}
export function rebaseSettlement(kind: "permanent" | "active" | "expired" | "zero" = "permanent"): {
  before: RebaseSnapshot;
  after: RebaseSnapshot;
  receipt: ExecutionReceipt;
  gasFee: bigint;
} {
  const before = rebaseFixture(kind),
    timestamp = before.escrow.timestamp + 1n,
    forecast = forecastRebaseClaim({ snapshot: before, atTimestamp: timestamp }),
    deposited = forecast.disposition === "locked" ? forecast.amount : 0n,
    liquid = forecast.disposition === "liquid" ? forecast.amount : 0n,
    gasFee = 17n;
  const after: RebaseSnapshot = {
    ...before,
    timeCursor: forecast.nextCursor,
    periods: [],
    claim: {
      amount: 0n,
      epochStart: forecast.nextCursor,
      nextCursor: forecast.nextCursor,
      periods: 0n,
      hasMore: false,
    },
    tokenLastBalance: before.tokenLastBalance - forecast.amount,
    userPointEpoch: before.userPointEpoch + (deposited > 0n ? 1n : 0n),
    custody: { ...before.custody, balance: before.custody.balance - forecast.amount },
    escrow: {
      ...before.escrow,
      timestamp,
      coordinate: {
        ...before.escrow.coordinate,
        blockNumber: before.escrow.coordinate.blockNumber + 1n,
      },
      token: { ...before.escrow.token, balance: before.escrow.token.balance + liquid },
      nativeBalance: before.escrow.nativeBalance - gasFee,
      supply: before.escrow.supply + deposited,
      escrowTokenBalance: before.escrow.escrowTokenBalance + deposited,
      permanentBalance: before.escrow.permanentBalance + (kind === "permanent" ? deposited : 0n),
      virtualPermanentBalance:
        before.escrow.virtualPermanentBalance + (kind === "permanent" ? deposited : 0n),
      locks: before.escrow.locks.map((lock) => ({
        ...lock,
        amount: forecast.lockedAmount,
        currentUnboostedPower: forecast.unboostedPower,
      })),
    },
  };
  let receipt: ExecutionReceipt = {
    blockNumber: after.escrow.coordinate.blockNumber,
    blockHash: after.escrow.coordinate.blockHash,
    transactionHash: `0x${"cd".repeat(32)}`,
    logs: [],
  };
  const logs: unknown[] = [];
  if (forecast.amount > 0n) {
    logs.push(
      fixtureLog(
        resolveEvent({
          ...after.escrow.coordinate,
          contractId: before.contract.contractId,
          eventName: "Claimed",
        }),
        before.contract.address,
        [1n, forecast.epochStart, forecast.nextCursor, forecast.amount],
        receipt,
        logs.length,
      ),
    );
    const transfer = getTokenInterface().find(
      (row) => row.type === "event" && row.name === "Transfer",
    );
    assert(transfer);
    logs.push(
      fixtureLog(
        transfer,
        before.escrow.underlying,
        [
          before.contract.address,
          deposited > 0n ? before.escrow.contract.address : before.escrow.account,
          forecast.amount,
        ],
        receipt,
        logs.length,
      ),
    );
  }
  if (deposited > 0n) {
    const lock = after.escrow.locks[0];
    assert(lock);
    for (const [eventName, args] of [
      ["Deposit", [before.contract.address, 1n, 0n, deposited, lock.end, timestamp]],
      ["Supply", [before.escrow.supply, after.escrow.supply]],
    ] as const)
      logs.push(
        fixtureLog(
          resolveEvent({
            ...after.escrow.coordinate,
            contractId: before.escrow.contract.contractId,
            eventName,
          }),
          before.escrow.contract.address,
          args,
          receipt,
          logs.length,
        ),
      );
  }
  receipt = { ...receipt, logs };
  return { before, after, receipt, gasFee };
}
