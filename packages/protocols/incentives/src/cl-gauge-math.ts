import { parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import type {
  CLGaugeAction,
  CLGaugeForecast,
  CLGaugeState,
  CLGaugeRewardState,
} from "./cl-gauge-types.ts";
const Q128 = 1n << 128n;
const wrap = (value: bigint) => BigInt.asUintN(256, value);
function inside(snapshot: CLGaugeState, global: bigint): bigint {
  const { tick } = snapshot.pool,
    { tickLower, tickUpper } = snapshot.position,
    r = snapshot.rewards;
  const below = tick >= tickLower ? r.lowerOutsideX128 : wrap(global - r.lowerOutsideX128);
  const above = tick < tickUpper ? r.upperOutsideX128 : wrap(global - r.upperOutsideX128);
  return wrap(global - below - above);
}
function advance(snapshot: CLGaugeState, timestamp: bigint): CLGaugeRewardState {
  const r = snapshot.rewards;
  parseUint(timestamp, 32);
  incentiveRequire(
    timestamp >= r.lastUpdated,
    "UnavailableState",
    "CL reward clock precedes pool update",
  );
  const elapsed = timestamp - r.lastUpdated,
    emitted = wrap(r.rewardRate * elapsed),
    reward = emitted < r.reserve ? emitted : r.reserve;
  const increment =
    snapshot.pool.stakedLiquidity > 0n
      ? parseUint((reward * Q128) / snapshot.pool.stakedLiquidity)
      : 0n;
  return {
    ...r,
    globalX128: wrap(r.globalX128 + increment),
    reserve: r.reserve - reward,
    rollover: wrap(r.rollover + (snapshot.pool.stakedLiquidity === 0n ? reward : 0n)),
    lastUpdated: timestamp,
  };
}
/** Newly accrued reward only, matching earned(account,tokenId), including uint256 wrap. */
export function calculateCLGaugeEarned(
  snapshot: CLGaugeState,
  atTimestamp = snapshot.pool.timestamp,
): bigint {
  const advanced = advance(snapshot, atTimestamp);
  // The view getter treats a zero supplied growth as its stored-global sentinel.
  const global = advanced.globalX128 === 0n ? snapshot.rewards.globalX128 : advanced.globalX128;
  return parseUint(
    (wrap(inside(snapshot, global) - snapshot.rewards.positionInsideX128) *
      parseUint(snapshot.position.liquidity, 128)) /
      Q128,
  );
}
/**
 * Forecast an ordinary CL NFT stake, unstake or reward claim from supplied state.
 *
 * @remarks
 * Ownership, custody and liveness determine eligibility. Reward amounts retain the
 * gauge token's base units and are separate from NFT principal and pool fees.
 * The result does not mutate custody or refresh the snapshot.
 */
export function forecastCLGauge(input: {
  readonly snapshot: CLGaugeState;
  readonly action: CLGaugeAction;
  readonly atTimestamp?: bigint;
}): Readonly<CLGaugeForecast> {
  const { snapshot: s, action } = input,
    p = s.position,
    r = s.rewards,
    timestamp = input.atTimestamp ?? s.pool.timestamp;
  incentiveRequire(
    ["approve", "stake", "unstake", "claim-reward"].includes(action),
    "InvalidInput",
    "unknown CL gauge action",
  );
  parseUint(timestamp, 32);
  incentiveRequire(
    timestamp >= s.pool.timestamp && timestamp >= r.positionLastUpdate,
    "InvalidInput",
    "CL gauge forecast time precedes state",
  );
  incentiveRequire(
    s.pool.writeCompatible &&
      s.pool.unlocked &&
      s.pool.gauge !== null &&
      ![
        s.gauge,
        s.pool.manager.address,
        s.pool.pool,
        s.pool.key.token0,
        s.pool.key.token1,
        s.reward.target.address,
      ].includes(s.pool.account),
    "IneligibleOperation",
    "ordinary verified CL pool owner required",
  );
  if (action === "approve" || action === "stake")
    incentiveRequire(
      !s.staked && !p.staked && p.owner === s.pool.account && s.pool.gauge.alive,
      "IneligibleOperation",
      "self-owned NFT and live CL gauge required",
    );
  else
    incentiveRequire(
      s.staked && p.staked && p.owner === s.gauge && p.beneficialDepositor === s.pool.account,
      "IneligibleOperation",
      "CL gauge stake-set ownership required",
    );
  const collecting = action === "stake" || action === "unstake";
  if (action === "stake")
    incentiveRequire(
      p.liquidity > 0n,
      "IneligibleOperation",
      "positive NFT liquidity required for staking",
    );
  if (collecting)
    incentiveRequire(
      !p.fees0.overflowed && !p.fees1.overflowed && p.liquidity < 1n << 127n,
      "IneligibleOperation",
      "CL gauge fee accounting or signed liquidity limit",
    );
  const inRange = s.pool.tick >= p.tickLower && s.pool.tick < p.tickUpper;
  let rewardsAfter: CLGaugeRewardState = { ...r },
    reward = 0n;
  if (action === "stake") {
    if (inRange) rewardsAfter = advance(s, timestamp);
    rewardsAfter = {
      ...rewardsAfter,
      positionInsideX128: inside(s, rewardsAfter.globalX128),
      positionLastUpdate: timestamp,
    };
  } else if (action !== "approve") {
    if (r.positionLastUpdate !== timestamp) {
      const advanced = advance(s, timestamp);
      const accrued = parseUint(
        (wrap(inside(s, advanced.globalX128) - r.positionInsideX128) *
          parseUint(p.liquidity, 128)) /
          Q128,
      );
      rewardsAfter = {
        ...advanced,
        stored: wrap(r.stored + accrued),
        positionInsideX128: inside(s, advanced.globalX128),
        positionLastUpdate: timestamp,
      };
    }
    reward = rewardsAfter.stored;
    rewardsAfter = { ...rewardsAfter, stored: 0n };
    // A same-timestamp reward skip can still be followed by pool.stake on withdrawal.
    if (action === "unstake" && p.liquidity > 0n && inRange)
      rewardsAfter = {
        ...advance(s, timestamp),
        positionInsideX128: rewardsAfter.positionInsideX128,
        positionLastUpdate: rewardsAfter.positionLastUpdate,
        stored: 0n,
      };
  }
  incentiveRequire(
    reward <= s.rewardCustody,
    "BoundExceeded",
    "insufficient CL gauge reward custody",
  );
  const stakeDelta = action === "stake" ? p.liquidity : action === "unstake" ? -p.liquidity : 0n;
  parseUint(s.pool.stakedLiquidity + (inRange ? stakeDelta : 0n), 128);
  return Object.freeze({
    action,
    reward,
    feeCap0: collecting ? p.fees0.tokensOwed : 0n,
    feeCap1: collecting ? p.fees1.tokensOwed : 0n,
    activeStakeDelta: inRange ? stakeDelta : 0n,
    stakeDelta,
    rewardsAfter: Object.freeze(rewardsAfter),
  });
}
