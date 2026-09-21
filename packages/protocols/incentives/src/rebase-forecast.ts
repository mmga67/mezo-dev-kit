import { parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { calculateLockVotingPower, calculateVotingEpoch } from "./math.ts";
import { calculateRebaseClaim } from "./rebase-math.ts";
import type { RebaseClaim } from "./rebase-math.ts";
import type { RebaseSnapshot } from "./rebase-reader.ts";
/**
 * Expected locked/liquid/none disposition and resulting lock power from the supplied snapshot.
 */
export interface RebaseForecast extends RebaseClaim {
  readonly disposition: "liquid" | "locked" | "none";
  readonly lockedAmount: bigint;
  readonly unboostedPower: bigint;
}
/**
 * Forecast whether a bounded veMEZO rebase becomes locked, liquid or zero payout.
 *
 * @remarks
 * Only ordinary self-owned NFTs are admitted, and the minter period must be current.
 * Amounts are MEZO base units. Optional atTimestamp projects disposition from supplied
 * state; it is not a new observation. The owner needs no token approval.
 */
export function forecastRebaseClaim(input: {
  readonly snapshot: RebaseSnapshot;
  readonly atTimestamp?: bigint;
}): Readonly<RebaseForecast> {
  const { snapshot } = input,
    escrow = snapshot.escrow,
    lock = escrow.locks.find((row) => row.tokenId === snapshot.tokenId),
    timestamp = parseUint(input.atTimestamp ?? escrow.timestamp),
    zero = parseAddress(`0x${"0".repeat(40)}`);
  incentiveRequire(
    lock?.owner === escrow.account &&
      lock.owner !== zero &&
      escrow.role === "vemezo-current" &&
      lock.kind === "normal" &&
      lock.amount > 0n &&
      lock.managedTokenId === 0n &&
      lock.delegatee === 0n &&
      lock.grantManager === zero &&
      lock.vestingEnd === 0n &&
      escrow.account !== escrow.forwarder &&
      escrow.account !== snapshot.contract.address &&
      escrow.account !== escrow.contract.address &&
      timestamp >= escrow.timestamp,
    "IneligibleOperation",
    "ordinary self-owned veMEZO rebase claim required",
  );
  incentiveRequire(
    snapshot.activePeriod >= calculateVotingEpoch(timestamp).start,
    "IneligibleOperation",
    "minter period must be updated before claiming",
  );
  const claim = calculateRebaseClaim(snapshot),
    disposition =
      claim.amount === 0n ? "none" : !lock.permanent && timestamp >= lock.end ? "liquid" : "locked";
  incentiveRequire(
    snapshot.custody.balance >= claim.amount &&
      snapshot.tokenLastBalance >= claim.amount &&
      (disposition !== "locked" || snapshot.custody.allowance >= claim.amount),
    "UnavailableState",
    "distributor custody, accounting or escrow allowance is insufficient",
  );
  const lockedAmount = parseUint(lock.amount + (disposition === "locked" ? claim.amount : 0n));
  const power = calculateLockVotingPower({
    amount: lockedAmount,
    boost: lock.storedBoost,
    end: lock.end,
    permanent: lock.permanent,
    maxLockSeconds: escrow.maxLockSeconds,
    timestamp,
  });
  return Object.freeze({ ...claim, disposition, lockedAmount, unboostedPower: power.unboosted });
}
