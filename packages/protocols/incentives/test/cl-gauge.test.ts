import { expect, test } from "vitest";
import { calculateCLGaugeEarned, forecastCLGauge } from "../src/index.ts";
import { verifyCLGaugeSettlement } from "../src/cl-gauge-settlement.ts";
import { clGaugeFixture, clGaugeClaimSettlement } from "./cl-gauge-fixture.ts";
test("CL earned excludes stored rewards, while claims include and clear them", () => {
  const s = clGaugeFixture();
  expect(calculateCLGaugeEarned(s)).toBe(25n);
  expect(forecastCLGauge({ snapshot: s, action: "claim-reward" })).toMatchObject({
    reward: 32n,
    rewardsAfter: { reserve: 950n, stored: 0n, lastUpdated: 1005n, positionLastUpdate: 1005n },
  });
});
test("CL same-timestamp update skips accrued rewards and pays only stored credit", () => {
  const original = clGaugeFixture(),
    s = { ...original, rewards: { ...original.rewards, positionLastUpdate: 1005n } };
  expect(calculateCLGaugeEarned(s)).toBe(25n);
  expect(forecastCLGauge({ snapshot: s, action: "claim-reward" })).toMatchObject({
    reward: 7n,
    rewardsAfter: { reserve: 1000n, globalX128: 0n, lastUpdated: 1000n, stored: 0n },
  });
});
test("CL reserve bounds emissions; a period boundary alone does not clamp the source pool", () => {
  const original = clGaugeFixture(),
    s = { ...original, rewards: { ...original.rewards, reserve: 8n, periodFinish: 1001n } };
  expect(forecastCLGauge({ snapshot: s, action: "claim-reward" })).toMatchObject({
    reward: 11n,
    rewardsAfter: { reserve: 0n },
  });
});
test("first in-range stake rolls elapsed rewards over without assigning them to the new NFT", () => {
  const original = clGaugeFixture(false),
    s = { ...original, pool: { ...original.pool, stakedLiquidity: 0n } };
  expect(forecastCLGauge({ snapshot: s, action: "stake" })).toMatchObject({
    reward: 0n,
    stakeDelta: 64n,
    activeStakeDelta: 64n,
    rewardsAfter: {
      rollover: 50n,
      reserve: 950n,
      globalX128: 0n,
      positionInsideX128: 0n,
      positionLastUpdate: 1005n,
    },
  });
});
test("out-of-range stake leaves pool reward clock unchanged", () => {
  const original = clGaugeFixture(false),
    s = { ...original, pool: { ...original.pool, tick: 60 } };
  expect(forecastCLGauge({ snapshot: s, action: "stake" })).toMatchObject({
    activeStakeDelta: 0n,
    stakeDelta: 64n,
    rewardsAfter: { lastUpdated: 1000n, reserve: 1000n },
  });
});
test("growth wrapping to zero distinguishes the view getter sentinel from post-update claim state", () => {
  const original = clGaugeFixture(),
    globalX128 = (1n << 256n) - (1n << 128n),
    s = {
      ...original,
      pool: { ...original.pool, timestamp: 1001n },
      rewards: {
        ...original.rewards,
        rewardRate: 128n,
        globalX128,
        positionInsideX128: globalX128,
      },
    };
  expect(calculateCLGaugeEarned(s)).toBe(0n);
  expect(forecastCLGauge({ snapshot: s, action: "claim-reward" })).toMatchObject({
    reward: 71n,
    rewardsAfter: { globalX128: 0n, positionInsideX128: 0n },
  });
});
test("dead gauges reject deposits but preserve the depositor's exit and claim", () => {
  for (const action of ["unstake", "claim-reward"] as const) {
    const s = clGaugeFixture();
    expect(
      forecastCLGauge({
        snapshot: {
          ...s,
          pool: { ...s.pool, gauge: s.pool.gauge ? { ...s.pool.gauge, alive: false } : null },
        },
        action,
      }).reward,
    ).toBe(32n);
  }
  const s = clGaugeFixture(false);
  expect(() =>
    forecastCLGauge({
      snapshot: {
        ...s,
        pool: { ...s.pool, gauge: s.pool.gauge ? { ...s.pool.gauge, alive: false } : null },
      },
      action: "stake",
    }),
  ).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
});
test.for(["custody", "depositor", "clock"] as const)(
  "CL %s invalidates the reward forecast",
  (kind) => {
    const original = clGaugeFixture();
    const s =
      kind === "custody"
        ? { ...original, rewardCustody: 31n }
        : kind === "depositor"
          ? { ...original, position: { ...original.position, beneficialDepositor: null } }
          : { ...original, pool: { ...original.pool, timestamp: 998n } };
    expect(() => forecastCLGauge({ snapshot: s, action: "claim-reward" })).toThrow();
  },
);
test("CL claim settlement proves stored plus accrued payout and nonzero native gas", () => {
  expect(verifyCLGaugeSettlement(clGaugeClaimSettlement())).toMatchObject({
    reward: 32n,
    fee0: 0n,
    fee1: 0n,
  });
});
test.for(["reward", "reserve", "cursor", "gas", "stake", "position", "missing-transfer"] as const)(
  "CL %s corruption prevents claim reconciliation",
  (kind) => {
    const fixture = clGaugeClaimSettlement(),
      a = fixture.after;
    let after = a,
      receipt = fixture.receipt;
    if (kind === "reward") after = { ...a, reward: { ...a.reward, balance: 133n } };
    if (kind === "reserve") after = { ...a, rewards: { ...a.rewards, reserve: 951n } };
    if (kind === "cursor") after = { ...a, rewards: { ...a.rewards, positionLastUpdate: 1004n } };
    if (kind === "gas") after = { ...a, pool: { ...a.pool, nativeBalance: 984n } };
    if (kind === "stake") after = { ...a, pool: { ...a.pool, stakedLiquidity: 129n } };
    if (kind === "position") after = { ...a, position: { ...a.position, tokensOwed0: 0n } };
    if (kind === "missing-transfer") receipt = { ...receipt, logs: receipt.logs.slice(0, 1) };
    expect(() => verifyCLGaugeSettlement({ ...fixture, after, receipt })).toThrow(
      expect.objectContaining({ code: "ReconciliationMismatch" }),
    );
  },
);
