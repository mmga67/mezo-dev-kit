import { object, text, texts } from "./json.ts";
import type fixturesShape from "../../knowledge/protocols/incentives/fixtures/formulas.json";
import type validatorFixturesShape from "../../knowledge/protocols/incentives/fixtures/validator-allocation.json";

// Independent evidence/fixture calculations. Do not substitute SDK implementations under test.
export const P = 10n ** 18n;
export const WEEK = 604800n;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface TimedPowerInput {
  amount: bigint;
  maxLockSeconds: bigint;
  lockEnd: bigint;
  at: bigint;
  boost?: bigint;
}

interface BoostInput {
  gaugeWeight: bigint;
  votingVeTotalWeight: bigint;
  boostableVeTotalWeight: bigint;
  boostableVeWeight: bigint;
}

interface EpochEmissionInput {
  epochIndex: bigint;
  preEmissionTotalSupplyRaw: bigint;
}

interface EpochRebaseInput {
  emissionRaw: bigint;
  preEmissionTotalSupplyRaw: bigint;
  period: bigint;
  priorBoundaryUnboostedVotingPowerRaw: bigint;
  emissionsEnabled?: bigint;
}

export interface EpochResult {
  start: bigint;
  voteStart: bigint;
  voteEnd: bigint;
  next: bigint;
}

export function requiredBigInt(values: Readonly<Record<string, bigint>>, key: string): bigint {
  const value = values[key];
  assert(value !== undefined, `missing bigint input ${key}`);
  return value;
}
export const epoch = (timestamp: bigint): EpochResult => {
  const start = timestamp - (timestamp % WEEK);
  return { start, voteStart: start + 3600n, voteEnd: start + WEEK - 3600n, next: start + WEEK };
};
export const timedPower = ({
  amount,
  maxLockSeconds,
  lockEnd,
  at,
  boost: boostValue,
}: TimedPowerInput): { slope: bigint; power: bigint } => {
  if (at >= lockEnd) return { slope: 0n, power: 0n };
  const effective =
    boostValue === undefined || boostValue === 0n ? amount : (amount * boostValue) / P;
  const slope = effective / maxLockSeconds;
  return { slope, power: slope * (lockEnd - at) };
};
export const calculateBoost = ({
  gaugeWeight,
  votingVeTotalWeight,
  boostableVeTotalWeight,
  boostableVeWeight,
}: BoostInput): bigint => {
  const votingRatio = votingVeTotalWeight === 0n ? 0n : (gaugeWeight * P) / votingVeTotalWeight;
  const boostableRatio =
    boostableVeWeight === 0n ? 0n : (boostableVeTotalWeight * P) / boostableVeWeight;
  const fraction = (4n * boostableRatio * votingRatio) / P;
  return P + fraction > 5n * P ? 5n * P : P + fraction;
};
export const epochEmission = ({
  epochIndex,
  preEmissionTotalSupplyRaw,
}: EpochEmissionInput): bigint => {
  const halvingPeriod = epochIndex / 104n;
  const progress = ((epochIndex % 104n) * P) / 104n;
  const tail = 200n * P;
  const start = (2500n * P) / 2n ** halvingPeriod > tail ? (2500n * P) / 2n ** halvingPeriod : tail;
  const end = start / 2n > tail ? start / 2n : tail;
  const drop = ((start - end) * progress) / P;
  const epochRate = (start - drop) / 52n;
  return (epochRate * preEmissionTotalSupplyRaw) / 10000n / P;
};
export const epochRebase = ({
  emissionRaw,
  preEmissionTotalSupplyRaw,
  period,
  priorBoundaryUnboostedVotingPowerRaw,
  emissionsEnabled = 1n,
}: EpochRebaseInput): bigint => {
  if (
    emissionsEnabled === 0n ||
    emissionRaw === 0n ||
    preEmissionTotalSupplyRaw === 0n ||
    period === 0n
  )
    return 0n;
  if (priorBoundaryUnboostedVotingPowerRaw >= preEmissionTotalSupplyRaw) return 0n;
  const nonVoting = preEmissionTotalSupplyRaw - priorBoundaryUnboostedVotingPowerRaw;
  return (
    (((emissionRaw * nonVoting) / preEmissionTotalSupplyRaw) * nonVoting) /
    preEmissionTotalSupplyRaw /
    2n
  );
};

export function validateIncentiveFormulaFixtures(fixtures: typeof fixturesShape): void {
  try {
    for (const fixture of fixtures.records) {
      const values: Record<string, bigint> = {};
      for (const [key, value] of Object.entries(fixture.inputs)) {
        if (Array.isArray(value)) continue;
        assert(
          typeof value === "string" || typeof value === "number" || typeof value === "boolean",
          `${fixture.id} input ${key} is not scalar`,
        );
        values[key] = BigInt(value);
      }
      if (fixture.formulaId === "rounded-unlock-time") {
        const timestamp = requiredBigInt(values, "timestamp");
        const result = ((timestamp + requiredBigInt(values, "requestedDuration")) / WEEK) * WEEK;
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} unlock result differs`,
        );
        if (fixture.expectedValidity === false)
          assert(result <= timestamp, `${fixture.id} unexpectedly valid`);
      } else if (
        fixture.formulaId === "unboosted-timed-voting-power" ||
        fixture.formulaId === "boosted-timed-voting-power"
      ) {
        const boostValue = values.boost;
        const result = timedPower({
          amount: requiredBigInt(values, "amount"),
          maxLockSeconds: requiredBigInt(values, "maxLockSeconds"),
          lockEnd: requiredBigInt(values, "lockEnd"),
          at: requiredBigInt(values, "at"),
          ...(boostValue === undefined ? {} : { boost: boostValue }),
        });
        assert(
          result.power.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} power differs`,
        );
        if (fixture.expectedSlope)
          assert(result.slope.toString() === fixture.expectedSlope, `${fixture.id} slope differs`);
      } else if (fixture.formulaId === "vebtc-boost-factor") {
        const result = calculateBoost({
          gaugeWeight: requiredBigInt(values, "gaugeWeight"),
          votingVeTotalWeight: requiredBigInt(values, "votingVeTotalWeight"),
          boostableVeTotalWeight: requiredBigInt(values, "boostableVeTotalWeight"),
          boostableVeWeight: requiredBigInt(values, "boostableVeWeight"),
        });
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} boost differs`,
        );
      } else if (fixture.formulaId === "epoch-boundaries") {
        const result = epoch(requiredBigInt(values, "timestamp"));
        const expected = object(fixture.expected, `${fixture.id} expected epoch`);
        for (const key of ["start", "voteStart", "voteEnd", "next"] as const) {
          assert(
            result[key].toString() === text(expected[key], `${fixture.id} expected ${key}`),
            `${fixture.id} ${key} differs`,
          );
        }
      } else if (fixture.formulaId === "proportional-vote-allocation") {
        const relative = texts(
          fixture.inputs.relativeWeights,
          `${fixture.id} relative weights`,
        ).map(BigInt);
        const total = relative.reduce((sum, value) => sum + value, 0n);
        const votingPower = requiredBigInt(values, "votingPower");
        const allocations = relative.map((value) => (value * votingPower) / total);
        const used = allocations.reduce((sum, value) => sum + value, 0n);
        const expected = object(fixture.expected, `${fixture.id} expected allocation`);
        assert(
          JSON.stringify(allocations.map(String)) ===
            JSON.stringify(texts(expected.allocations, `${fixture.id} expected allocations`)),
          `${fixture.id} allocations differ`,
        );
        assert(
          used.toString() === text(expected.usedWeight, `${fixture.id} expected used weight`),
          `${fixture.id} used weight differs`,
        );
        assert(
          (votingPower - used).toString() ===
            text(expected.unallocatedFloorDust, `${fixture.id} expected floor dust`),
          `${fixture.id} dust differs`,
        );
      } else if (fixture.formulaId === "emission-global-index-increment") {
        const amount = requiredBigInt(values, "amount");
        const totalWeight = requiredBigInt(values, "totalWeight");
        const result = (amount * P) / (totalWeight > 1n ? totalWeight : 1n);
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} index differs`,
        );
      } else if (fixture.formulaId === "gauge-emission-share") {
        const result =
          (requiredBigInt(values, "poolWeight") * requiredBigInt(values, "indexDelta")) / P;
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} share differs`,
        );
      } else if (fixture.formulaId === "mezo-epoch-emission") {
        const result = epochEmission({
          epochIndex: requiredBigInt(values, "epochIndex"),
          preEmissionTotalSupplyRaw: requiredBigInt(values, "preEmissionTotalSupplyRaw"),
        });
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} emission differs`,
        );
      } else if (fixture.formulaId === "mezo-epoch-rebase") {
        const emissionsEnabled = values.emissionsEnabled;
        const result = epochRebase({
          emissionRaw: requiredBigInt(values, "emissionRaw"),
          preEmissionTotalSupplyRaw: requiredBigInt(values, "preEmissionTotalSupplyRaw"),
          period: requiredBigInt(values, "period"),
          priorBoundaryUnboostedVotingPowerRaw: requiredBigInt(
            values,
            "priorBoundaryUnboostedVotingPowerRaw",
          ),
          ...(emissionsEnabled === undefined ? {} : { emissionsEnabled }),
        });
        assert(
          result.toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} rebase differs`,
        );
      } else if (fixture.formulaId === "mezo-epoch-reward-remainder") {
        assert(
          (
            requiredBigInt(values, "emissionRaw") - requiredBigInt(values, "rebaseRaw")
          ).toString() === text(fixture.expected, `${fixture.id} expected value`),
          `${fixture.id} reward remainder differs`,
        );
      } else if (fixture.formulaId === "mezo-splitter-allocation") {
        const currentBalance = requiredBigInt(values, "currentBalanceRaw");
        const first = (currentBalance * requiredBigInt(values, "needle")) / 100n;
        const second = currentBalance - first;
        const expected = object(fixture.expected, `${fixture.id} expected split`);
        assert(
          first.toString() ===
            text(expected.firstRecipientAmountRaw, `${fixture.id} expected first amount`),
          `${fixture.id} first split differs`,
        );
        assert(
          second.toString() ===
            text(expected.secondRecipientAmountRaw, `${fixture.id} expected second amount`),
          `${fixture.id} second split differs`,
        );
      } else if (fixture.formulaId === "mezo-epoch-catch-up-count") {
        const elapsed =
          (requiredBigInt(values, "currentPeriod") - requiredBigInt(values, "activePeriod")) /
          requiredBigInt(values, "week");
        const maximumPerUpdate = requiredBigInt(values, "maximumPerUpdate");
        const processed = elapsed < maximumPerUpdate ? elapsed : maximumPerUpdate;
        const expected = object(fixture.expected, `${fixture.id} expected catch-up counts`);
        assert(
          elapsed.toString() === text(expected.elapsed, `${fixture.id} expected elapsed count`),
          `${fixture.id} elapsed count differs`,
        );
        assert(
          processed.toString() ===
            text(expected.processed, `${fixture.id} expected processed count`),
          `${fixture.id} processed count differs`,
        );
        assert(
          (elapsed - processed).toString() ===
            text(expected.remaining, `${fixture.id} expected remaining count`),
          `${fixture.id} remaining count differs`,
        );
      } else {
        throw new Error(`unknown incentives fixture formula ${fixture.formulaId}`);
      }
    }
  } catch (cause) {
    throw new Error(
      `incentives-formula-fixtures: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}
export function validateValidatorAllocationFixtures(
  validatorFixtures: typeof validatorFixturesShape,
  validatorNotification: Readonly<{ shareSumRaw: string; floorDustRaw: string }>,
): void {
  try {
    for (const fixture of validatorFixtures.records) {
      if (fixture.formulaId === "validator-vote-allocation") {
        const votingPower = BigInt(
          text(fixture.inputs.boostedVotingPowerRaw, `${fixture.id} boosted voting power`),
        );
        const relative = texts(
          fixture.inputs.externalWeights,
          `${fixture.id} external weights`,
        ).map(BigInt);
        if (relative.length === 0) {
          assert(
            fixture.expected.outcome === "reset-without-division" &&
              fixture.expected.usedWeightRaw === "0",
            `${fixture.id} empty reset differs`,
          );
          continue;
        }
        const total = relative.reduce((sum, value) => sum + value, 0n);
        const allocations = relative.map((value) => (value * votingPower) / total);
        if (fixture.expected.outcome === "revert-ZeroBalance") {
          assert(allocations[0] === 0n, `${fixture.id} does not reach ZeroBalance`);
          continue;
        }
        const used = allocations.reduce((sum, value) => sum + value, 0n);
        assert(
          JSON.stringify(allocations.map(String)) ===
            JSON.stringify(fixture.expected.gaugeVotesRaw),
          `${fixture.id} validator allocations differ`,
        );
        assert(
          used.toString() === fixture.expected.usedWeightRaw,
          `${fixture.id} used weight differs`,
        );
        assert(
          (votingPower - used).toString() === fixture.expected.allocationFloorDustRaw,
          `${fixture.id} vote dust differs`,
        );
      } else if (fixture.formulaId === "validator-reward-index-notification") {
        const amount = BigInt(
          text(fixture.inputs.notifiedRewardRaw, `${fixture.id} notified reward`),
        );
        const totalWeight = BigInt(
          text(
            fixture.inputs.preNotificationTotalWeightRaw,
            `${fixture.id} pre-notification total weight`,
          ),
        );
        const indexDelta = (amount * P) / (totalWeight > 0n ? totalWeight : 1n);
        assert(
          indexDelta.toString() === fixture.expected.indexDelta18,
          `${fixture.id} index differs`,
        );
        if (fixture.inputs.gaugeWeightsRaw) {
          const shares = fixture.inputs.gaugeWeightsRaw.map(
            (weight) => (BigInt(weight) * indexDelta) / P,
          );
          const shareSum = shares.reduce((sum, value) => sum + value, 0n);
          assert(
            JSON.stringify(shares.map(String)) === JSON.stringify(fixture.expected.gaugeSharesRaw),
            `${fixture.id} shares differ`,
          );
          assert(
            shareSum.toString() === fixture.expected.gaugeShareSumRaw,
            `${fixture.id} sum differs`,
          );
          assert(
            (amount - shareSum).toString() === fixture.expected.floorDustRaw,
            `${fixture.id} dust differs`,
          );
        } else if (fixture.id === "validator-index-pinned-notification") {
          assert(
            fixture.expected.gaugeShareSumRaw === validatorNotification.shareSumRaw &&
              fixture.expected.floorDustRaw === validatorNotification.floorDustRaw,
            `${fixture.id} pinned evidence differs`,
          );
        } else {
          assert(
            fixture.expected.gaugeShareSumRaw === "0",
            `${fixture.id} zero-weight sum differs`,
          );
          assert(
            fixture.expected.unallocatedRaw === amount.toString(),
            `${fixture.id} residual differs`,
          );
        }
      } else if (fixture.formulaId === "validator-gauge-distribution-gate") {
        const claimable = BigInt(
          text(fixture.inputs.updatedClaimableRaw, `${fixture.id} updated claimable`),
        );
        const left = BigInt(text(fixture.inputs.gaugeLeftRaw, `${fixture.id} gauge left`));
        const distribute = claimable > left && claimable > WEEK;
        assert(distribute === fixture.expected.distribute, `${fixture.id} gate differs`);
        if (distribute)
          assert(
            claimable.toString() === fixture.expected.amountRaw,
            `${fixture.id} amount differs`,
          );
      } else if (fixture.formulaId === "validator-gauge-reward-rate") {
        const timestamp = BigInt(text(fixture.inputs.timestamp, `${fixture.id} timestamp`));
        const nextEpoch = timestamp - (timestamp % WEEK) + WEEK;
        const priorFinish = BigInt(
          text(fixture.inputs.priorPeriodFinish, `${fixture.id} prior period finish`),
        );
        const priorRate = BigInt(
          text(fixture.inputs.priorRewardRateRaw, `${fixture.id} prior reward rate`),
        );
        const leftover = timestamp < priorFinish ? (priorFinish - timestamp) * priorRate : 0n;
        const rate =
          (BigInt(text(fixture.inputs.distributionAmountRaw, `${fixture.id} distribution amount`)) +
            leftover) /
          (nextEpoch - timestamp);
        assert(
          nextEpoch.toString() === fixture.expected.nextEpoch,
          `${fixture.id} next epoch differs`,
        );
        assert(
          (nextEpoch - timestamp).toString() === fixture.expected.timeUntilNext,
          `${fixture.id} remaining time differs`,
        );
        assert(
          leftover.toString() === fixture.expected.leftoverRaw,
          `${fixture.id} leftover differs`,
        );
        assert(rate.toString() === fixture.expected.newRewardRateRaw, `${fixture.id} rate differs`);
        assert(
          nextEpoch.toString() === fixture.expected.periodFinish,
          `${fixture.id} finish differs`,
        );
      } else if (fixture.formulaId === "validator-partial-result") {
        assert(
          fixture.expected.status === "unavailable" &&
            fixture.expected.value === null &&
            fixture.expected.syntheticZero === false,
          `${fixture.id} partial-result contract differs`,
        );
      } else {
        throw new Error(`unknown validator fixture formula ${fixture.formulaId}`);
      }
    }
  } catch (cause) {
    throw new Error(
      `incentives-validator-allocation-fixtures: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}
