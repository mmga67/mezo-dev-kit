import { resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { INCENTIVES_MODEL } from "./model.generated.ts";
import type { VotingRewardSnapshot } from "./voting-reward-reader.ts";
export function validateVotingRewardClaim(snapshot: VotingRewardSnapshot): void {
  const escrow = snapshot.voting.escrow,
    lock = escrow.locks.find((row) => row.tokenId === snapshot.voting.tokenId),
    zero = parseAddress(`0x${"0".repeat(40)}`);
  incentiveRequire(
    lock?.owner === escrow.account &&
      lock.owner !== zero &&
      lock.callerApproved &&
      lock.kind === "normal" &&
      lock.managedTokenId === 0n &&
      lock.delegatee === 0n &&
      lock.grantManager === zero &&
      lock.vestingEnd === 0n &&
      escrow.account !== snapshot.voting.forwarder &&
      escrow.account !== escrow.forwarder &&
      escrow.account !== snapshot.voting.contract.address,
    "IneligibleOperation",
    "direct ordinary self-owned reward claim required",
  );
  incentiveRequire(
    snapshot.tokens.every((row) => row.custody >= row.earned),
    "UnavailableState",
    "insufficient reward custody",
  );
}
/** Claims pay the current NFT owner and emit ClaimRewards even for a zero amount. */
export function verifyVotingRewardSettlement(input: {
  readonly before: VotingRewardSnapshot;
  readonly after: VotingRewardSnapshot;
  readonly receipt: ExecutionReceipt;
  readonly gasFee: bigint;
}): readonly bigint[] {
  const { before, after, receipt, gasFee } = input,
    previous = before.voting,
    current = after.voting;
  validateVotingRewardClaim(before);
  validateVotingRewardClaim(after);
  const requireMatch = (condition: unknown, message: string) => {
    incentiveRequire(condition, "ReconciliationMismatch", message);
  };
  requireMatch(
    current.escrow.coordinate.blockHash === receipt.blockHash &&
      current.escrow.coordinate.blockNumber === receipt.blockNumber &&
      previous.escrow.coordinate.blockNumber + 1n === receipt.blockNumber &&
      previous.escrow.coordinate.chainId === current.escrow.coordinate.chainId &&
      previous.escrow.coordinate.networkId === current.escrow.coordinate.networkId &&
      previous.contract.address === current.contract.address &&
      previous.contract.contractId === current.contract.contractId &&
      previous.domain === current.domain &&
      previous.escrow.account === current.escrow.account &&
      previous.escrow.contract.address === current.escrow.contract.address &&
      previous.tokenId === current.tokenId &&
      previous.escrow.epoch.start === current.escrow.epoch.start &&
      before.target === after.target &&
      before.reward.address === after.reward.address &&
      before.reward.role === after.reward.role &&
      before.tokens.length === after.tokens.length,
    "reward settlement identity or epoch differs",
  );
  requireMatch(
    before.reward.balance === after.reward.balance &&
      before.reward.totalSupply === after.reward.totalSupply &&
      before.reward.numCheckpoints === after.reward.numCheckpoints &&
      before.reward.supplyNumCheckpoints === after.reward.supplyNumCheckpoints &&
      before.reward.checkpointTimestamp === after.reward.checkpointTimestamp &&
      before.reward.supplyCheckpointTimestamp === after.reward.supplyCheckpointTimestamp &&
      previous.usedWeight === current.usedWeight &&
      previous.lastVoted === current.lastVoted,
    "claim altered voting accounting",
  );
  const codec = createAbiCodec(),
    template = resolveVotingRewardInterface({
      networkId: current.escrow.coordinate.networkId,
      role: before.reward.role,
    }),
    event = template.abi.find((row) => row.type === "event" && row.name === "ClaimRewards");
  incentiveRequire(event !== undefined, "IdentityMismatch", "claim event unavailable");
  const events = getReceiptLogs(receipt, after.reward.address)
    .map((log) => codec.decodeEvent(event, log))
    .filter((row) => row !== null);
  requireMatch(events.length === before.tokens.length, "reward claim event coverage differs");
  const nativeProfile = INCENTIVES_MODEL.escrows.find((row) => row.role === "vebtc-current");
  incentiveRequire(
    nativeProfile !== undefined,
    "IdentityMismatch",
    "native token profile unavailable",
  );
  const nativeToken = parseAddress(nativeProfile.underlying),
    paid: bigint[] = [];
  let nativePaid = 0n;
  before.tokens.forEach((token, i) => {
    const settled = after.tokens[i],
      event = events[i],
      amount = token.earned,
      fee = token.token === nativeToken ? gasFee : 0n;
    requireMatch(
      settled?.token === token.token &&
        settled.decimals === token.decimals &&
        settled.lastEarn === current.escrow.timestamp &&
        settled.earned === 0n &&
        settled.custody === token.custody - amount &&
        settled.walletBalance === token.walletBalance + amount - fee &&
        event?.[0] === current.escrow.account &&
        event[1] === token.token &&
        event[2] === amount,
      "reward payout, claim timestamp or balances differ",
    );
    const transfers = decodeTokenTransfers(receipt, token.token).filter(
      (row) =>
        row.from === after.reward.address ||
        row.to === after.reward.address ||
        row.from === current.escrow.account ||
        row.to === current.escrow.account,
    );
    requireMatch(
      amount === 0n
        ? transfers.length === 0
        : transfers.length === 1 &&
            transfers[0]?.from === after.reward.address &&
            transfers[0].to === current.escrow.account &&
            transfers[0].amount === amount,
      "reward transfer differs",
    );
    if (token.token === nativeToken) nativePaid = parseUint(nativePaid + amount);
    paid.push(amount);
  });
  requireMatch(
    current.escrow.nativeBalance === previous.escrow.nativeBalance + nativePaid - gasFee,
    "reward native gas balance differs",
  );
  return Object.freeze(paid);
}
