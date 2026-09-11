import { resolveEvent } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { forecastRebaseClaim } from "./rebase-forecast.ts";
import type { RebaseForecast } from "./rebase-forecast.ts";
import type { RebaseSnapshot } from "./rebase-reader.ts";
import { calculateLockVotingPower } from "./math.ts";
export function verifyRebaseSettlement(input: {
  readonly before: RebaseSnapshot;
  readonly after: RebaseSnapshot;
  readonly receipt: ExecutionReceipt;
  readonly gasFee: bigint;
}): Readonly<RebaseForecast> {
  const { before, after, receipt, gasFee } = input,
    timestamp = after.escrow.timestamp,
    codec = createAbiCodec();
  const requireMatch = (condition: unknown, message: string) => {
    incentiveRequire(condition, "ReconciliationMismatch", message);
  };
  requireMatch(
    after.escrow.coordinate.blockHash === receipt.blockHash &&
      after.escrow.coordinate.blockNumber === receipt.blockNumber &&
      before.escrow.coordinate.blockNumber + 1n === receipt.blockNumber &&
      before.escrow.coordinate.chainId === after.escrow.coordinate.chainId &&
      before.escrow.coordinate.networkId === after.escrow.coordinate.networkId &&
      before.contract.address === after.contract.address &&
      before.contract.contractId === after.contract.contractId &&
      before.minter.address === after.minter.address &&
      before.escrow.contract.address === after.escrow.contract.address &&
      before.escrow.account === after.escrow.account &&
      before.escrow.underlying === after.escrow.underlying &&
      before.tokenId === after.tokenId,
    "rebase settlement identity differs",
  );
  const forecast = forecastRebaseClaim({ snapshot: before, atTimestamp: timestamp }),
    deposited = forecast.disposition === "locked" ? forecast.amount : 0n,
    liquid = forecast.disposition === "liquid" ? forecast.amount : 0n;
  const event = resolveEvent({
    ...after.escrow.coordinate,
    contractId: after.contract.contractId,
    eventName: "Claimed",
  });
  const claims = getReceiptLogs(receipt, after.contract.address)
    .map((log) => codec.decodeEvent(event, log))
    .filter((row) => row !== null);
  requireMatch(
    forecast.amount === 0n
      ? claims.length === 0
      : claims.length === 1 &&
          claims[0]?.[0] === after.tokenId &&
          claims[0][1] === forecast.epochStart &&
          claims[0][2] === forecast.nextCursor &&
          claims[0][3] === forecast.amount,
    "rebase claim event differs",
  );
  requireMatch(
    after.timeCursor === forecast.nextCursor &&
      after.startTime === before.startTime &&
      after.lastTokenTime === before.lastTokenTime &&
      after.activePeriod === before.activePeriod &&
      after.tokenLastBalance === before.tokenLastBalance - forecast.amount &&
      after.custody.balance === before.custody.balance - forecast.amount &&
      after.escrow.token.balance === before.escrow.token.balance + liquid &&
      after.escrow.nativeBalance === before.escrow.nativeBalance - gasFee,
    "rebase cursor, custody or wallet settlement differs",
  );
  const transfers = decodeTokenTransfers(receipt, after.escrow.underlying).filter(
    (row) =>
      [after.contract.address, after.escrow.contract.address, after.escrow.account].includes(
        row.from,
      ) ||
      [after.contract.address, after.escrow.contract.address, after.escrow.account].includes(
        row.to,
      ),
  );
  requireMatch(
    forecast.amount === 0n
      ? transfers.length === 0
      : transfers.length === 1 &&
          transfers[0]?.from === after.contract.address &&
          transfers[0].to ===
            (deposited > 0n ? after.escrow.contract.address : after.escrow.account) &&
          transfers[0].amount === forecast.amount,
    "rebase transfer recipient or amount differs",
  );
  const previous = before.escrow.locks.find((row) => row.tokenId === before.tokenId),
    current = after.escrow.locks.find((row) => row.tokenId === after.tokenId);
  incentiveRequire(
    previous !== undefined && current !== undefined,
    "ReconciliationMismatch",
    "rebase escrow position unavailable",
  );
  const boostedDeposit = calculateLockVotingPower({
    amount: deposited,
    boost: previous.storedBoost,
    end: 0n,
    permanent: true,
    maxLockSeconds: before.escrow.maxLockSeconds,
    timestamp,
  }).boosted;
  requireMatch(
    current.amount === forecast.lockedAmount &&
      current.currentUnboostedPower === forecast.unboostedPower &&
      current.owner === previous.owner &&
      current.end === previous.end &&
      current.permanent === previous.permanent &&
      current.storedBoost === previous.storedBoost &&
      current.kind === previous.kind &&
      current.managedTokenId === previous.managedTokenId &&
      current.delegatee === previous.delegatee &&
      current.grantManager === previous.grantManager &&
      current.vestingEnd === previous.vestingEnd &&
      current.voted === previous.voted &&
      current.voters.length === previous.voters.length &&
      current.voters.every((address) => previous.voters.includes(address)) &&
      after.escrow.supply === before.escrow.supply + deposited &&
      after.escrow.escrowTokenBalance === before.escrow.escrowTokenBalance + deposited &&
      after.escrow.permanentBalance ===
        before.escrow.permanentBalance + (previous.permanent ? deposited : 0n) &&
      after.escrow.virtualPermanentBalance ===
        before.escrow.virtualPermanentBalance + (previous.permanent ? boostedDeposit : 0n) &&
      after.userPointEpoch === before.userPointEpoch + (deposited > 0n ? 1n : 0n),
    "rebase escrow accounting differs",
  );
  const logs = getReceiptLogs(receipt, after.escrow.contract.address);
  const events = (name: string) => {
    const abi = resolveEvent({
      ...after.escrow.coordinate,
      contractId: after.escrow.contract.contractId,
      eventName: name,
    });
    return logs.map((log) => codec.decodeEvent(abi, log)).filter((row) => row !== null);
  };
  const deposits = events("Deposit"),
    supplies = events("Supply"),
    row = deposits[0];
  requireMatch(
    deposited === 0n
      ? deposits.length === 0 && supplies.length === 0
      : deposits.length === 1 &&
          row?.[0] === after.contract.address &&
          row[1] === after.tokenId &&
          row[2] === 0n &&
          row[3] === deposited &&
          row[4] === current.end &&
          row[5] === timestamp &&
          supplies.length === 1 &&
          supplies[0]?.[0] === before.escrow.supply &&
          supplies[0][1] === after.escrow.supply,
    "rebase escrow deposit events differ",
  );
  return forecast;
}
