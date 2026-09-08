import { parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { calculateLockEnd, calculateLockVotingPower } from "./math.ts";
import type { LockSnapshot } from "./lock-types.ts";
export type LockAction =
  | Readonly<{ kind: "create"; amount: bigint; duration: bigint }>
  | Readonly<{ kind: "increase"; tokenId: bigint; amount: bigint }>
  | Readonly<{ kind: "extend"; tokenId: bigint; duration: bigint }>
  | Readonly<{ kind: "make-permanent" | "unlock-permanent" | "withdraw"; tokenId: bigint }>;
export interface LockForecast {
  readonly amount: bigint;
  readonly end: bigint;
  readonly permanent: boolean;
  readonly unboostedPower: bigint;
  readonly deposit: bigint;
  readonly withdraw: bigint;
}
const zero = parseAddress(`0x${"0".repeat(40)}`);
export function forecastLock(input: {
  readonly snapshot: LockSnapshot;
  readonly action: LockAction;
  readonly atTimestamp?: bigint;
}): Readonly<LockForecast> {
  const { snapshot, action } = input,
    timestamp = parseUint(input.atTimestamp ?? snapshot.timestamp);
  incentiveRequire(
    timestamp >= snapshot.timestamp &&
      snapshot.account !== snapshot.contract.address &&
      snapshot.account !== snapshot.underlying &&
      snapshot.account !== snapshot.primaryVoter &&
      snapshot.account !== snapshot.booster &&
      snapshot.account !== snapshot.forwarder,
    "InvalidInput",
    "direct wallet and current-or-later timestamp required",
  );
  let amount: bigint,
    end: bigint,
    permanent = false,
    deposit = 0n,
    withdraw = 0n;
  if (action.kind === "create") {
    amount = parseUint(action.amount);
    incentiveRequire(amount > 0n, "InvalidInput", "positive lock amount required");
    deposit = amount;
    end = calculateLockEnd({
      timestamp,
      duration: action.duration,
      maxLockSeconds: snapshot.maxLockSeconds,
    });
  } else {
    const tokenId = parseUint(action.tokenId),
      lock = snapshot.locks.find((row) => row.tokenId === tokenId);
    incentiveRequire(
      tokenId > 0n && lock !== undefined,
      "UnavailableState",
      "requested lock state required",
    );
    incentiveRequire(
      lock.owner === snapshot.account &&
        lock.kind === "normal" &&
        lock.amount > 0n &&
        lock.managedTokenId === 0n &&
        lock.grantManager === zero &&
        lock.vestingEnd === 0n &&
        lock.delegatee === 0n &&
        !lock.voted &&
        (lock.boostGauge === null || lock.boostGauge === zero),
      "IneligibleOperation",
      "initial writer requires an unvoted self-owned normal lock without grants, delegation or boost gauge",
    );
    amount = parseUint(lock.amount);
    end = parseUint(lock.end);
    permanent = lock.permanent;
    switch (action.kind) {
      case "increase":
        deposit = parseUint(action.amount);
        incentiveRequire(
          deposit > 0n && (permanent || end > timestamp),
          "IneligibleOperation",
          "positive increase and unexpired lock required",
        );
        amount = parseUint(amount + deposit);
        break;
      case "extend":
        incentiveRequire(
          !permanent && end > timestamp,
          "IneligibleOperation",
          "unexpired timed lock required",
        );
        end = calculateLockEnd({
          timestamp,
          duration: action.duration,
          maxLockSeconds: snapshot.maxLockSeconds,
        });
        incentiveRequire(
          end > lock.end,
          "IneligibleOperation",
          "extension must increase rounded end",
        );
        break;
      case "make-permanent":
        incentiveRequire(
          !permanent && end > timestamp,
          "IneligibleOperation",
          "unexpired timed lock required",
        );
        permanent = true;
        end = 0n;
        break;
      case "unlock-permanent":
        incentiveRequire(permanent, "IneligibleOperation", "permanent lock required");
        permanent = false;
        end = calculateLockEnd({
          timestamp,
          duration: snapshot.maxLockSeconds,
          maxLockSeconds: snapshot.maxLockSeconds,
        });
        break;
      case "withdraw":
        incentiveRequire(
          !permanent && timestamp >= end,
          "IneligibleOperation",
          "expired timed lock required",
        );
        withdraw = amount;
        amount = 0n;
        end = 0n;
        break;
      default:
        incentiveRequire(false, "InvalidInput", "unknown lock operation");
    }
  }
  incentiveRequire(
    snapshot.token.balance >= deposit,
    "IneligibleOperation",
    "insufficient underlying balance",
  );
  incentiveRequire(
    snapshot.escrowTokenBalance >= withdraw,
    "IneligibleOperation",
    "insufficient direct escrow withdrawal liquidity",
  );
  const power = calculateLockVotingPower({
    amount,
    end,
    permanent,
    boost: 0n,
    maxLockSeconds: snapshot.maxLockSeconds,
    timestamp,
  });
  return Object.freeze({
    amount,
    end,
    permanent,
    unboostedPower: power.unboosted,
    deposit,
    withdraw,
  });
}
