import { describe, expect, test } from "vitest";

import { createSavingsReader } from "../src/index.ts";
import { ACCOUNT, BLOCK, CONVERTER, GAUGE, HASH, REWARD, STRATEGY, fixture } from "./fixture.ts";

describe("Savings reader", () => {
  test("reconciles wallet, gauge beneficial ownership, separate yield, and reward units at one coordinate", async () => {
    const f = await fixture();
    const result = await createSavingsReader(f.config).read({ account: ACCOUNT });
    expect(result.coordinate).toMatchObject({ blockNumber: BLOCK, blockHash: HASH });
    expect(result.wallet).toMatchObject({
      status: "available",
      value: {
        principalReceipts: { unit: "sMUSD", baseUnits: 10n },
        yield: {
          storedClaimable: { baseUnits: 2n },
          indexedUnclaimed: { baseUnits: 1n },
          claimable: { unit: "MUSD", baseUnits: 3n },
        },
      },
    });
    expect(result.global.pendingYield).toEqual({ unit: "MUSD", baseUnits: 7n });
    expect(result.gauge).toMatchObject({
      status: "available",
      value: {
        beneficialReceipts: { baseUnits: 90n },
        custodyReceipts: { baseUnits: 120n },
        totalStakedReceipts: { baseUnits: 100n },
        rewardToken: REWARD,
        earnedRewards: {
          status: "available",
          value: { unit: "gauge-reward-token", baseUnits: 13n },
        },
        cachedVoterRevenue: { status: "available", value: { unit: "MUSD", baseUnits: 17n } },
      },
    });
    expect(result.beneficialPrincipal).toEqual({
      status: "available",
      value: { unit: "sMUSD", baseUnits: 100n },
    });
    expect(result.strategy.status).toBe("available");
    expect(result.converter.status).toBe("available");
    expect(
      [...f.reads.map(({ request }) => request), ...f.inspected].every(
        ({ blockNumber, blockHash }) => blockNumber === BLOCK && blockHash === HASH,
      ),
    ).toBe(true);
    expect(
      f.reads.every(({ call }) => call.abi.every((entry) => entry.stateMutability === "view")),
    ).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
  test("a missing wallet index makes wallet and combined principal unavailable instead of fabricating yield", async () => {
    const f = await fixture();
    f.fail.add(`${f.savings}:supplyYieldIndex:${ACCOUNT}`);
    const result = await createSavingsReader(f.config).read({ account: ACCOUNT });
    expect(result.wallet).toMatchObject({
      status: "unavailable",
      error: { code: "ReadUnavailable" },
    });
    expect(result.beneficialPrincipal.status).toBe("unavailable");
    expect(result.gauge.status).toBe("available");
  });
  test("missing reward reads preserve gauge principal and never substitute zero rewards", async () => {
    const f = await fixture();
    f.fail.add(`${GAUGE}:earned:${ACCOUNT}`);
    const result = await createSavingsReader(f.config).read({ account: ACCOUNT });
    expect(result.gauge).toMatchObject({
      status: "available",
      value: {
        beneficialReceipts: { baseUnits: 90n },
        earnedRewards: { status: "unavailable", error: { code: "ReadUnavailable" } },
      },
    });
    expect(result.beneficialPrincipal.status).toBe("available");
  });
  test.for(["strategy", "gauge"] as const)(
    "unknown %s runtime is unavailable and is not queried with the captured interface",
    async (role) => {
      const f = await fixture();
      const target = role === "strategy" ? STRATEGY : GAUGE;
      f.code.set(target, "0x1234");
      const result = await createSavingsReader(f.config).read({ account: ACCOUNT });
      expect(result[role]).toMatchObject({
        status: "unavailable",
        error: { code: "UnsupportedRole" },
      });
      expect(f.reads.filter(({ request }) => request.address === target)).toHaveLength(0);
      if (role === "gauge") expect(result.beneficialPrincipal.status).toBe("unavailable");
    },
  );
  test.for([
    ["strategy", "vault", STRATEGY],
    ["converter", "musdSavingsRate", CONVERTER],
    ["gauge", "stakingToken", GAUGE],
    ["gauge", "voter", GAUGE],
  ] as const)(
    "%s reverse-link disagreement rejects the logical result",
    async ([, field, target]) => {
      const f = await fixture();
      f.values.set(`${target}:${field}`, ACCOUNT);
      await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
        code: "TopologyMismatch",
      });
    },
  );
  test("PCV fee recipient disagreement rejects before dynamic reads", async () => {
    const f = await fixture();
    const key = [...f.values.keys()].find((key) => key.endsWith(":feeRecipient"));
    if (!key) throw new Error("missing fixture fee recipient");
    f.values.set(key, ACCOUNT);
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "TopologyMismatch",
      field: "pcv.feeRecipient",
    });
    expect(f.inspected).toHaveLength(0);
  });
  test("an upgraded Savings implementation is rejected against the registry generation", async () => {
    const f = await fixture();
    f.state.wrongImplementation = true;
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "TopologyMismatch",
      field: "savings.implementation",
    });
  });
  test("a reorg during staged reads rejects every combined value", async () => {
    const f = await fixture();
    f.state.changedHash = true;
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "InconsistentCoordinate",
    });
  });
  test("chain mismatch prevents all protocol reads", async () => {
    const f = await fixture();
    f.state.chainId = 1n;
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "ChainMismatch",
    });
    expect(f.reads).toHaveLength(0);
  });
  test("historical unsupported Savings generation fails before reads", async () => {
    const f = await fixture();
    await expect(
      createSavingsReader(f.config).read({ account: ACCOUNT, blockNumber: 9088926n }),
    ).rejects.toMatchObject({ code: "HistoricalGenerationUnsupported" });
    expect(f.reads).toHaveLength(0);
  });
  test("gauge custody cannot be treated as a wallet account", async () => {
    const f = await fixture();
    await expect(createSavingsReader(f.config).read({ account: GAUGE })).rejects.toMatchObject({
      code: "InvalidInput",
      field: "account is gauge custody",
    });
  });
  test("insufficient gauge custody is a reconciliation conflict", async () => {
    const f = await fixture();
    f.values.set(`${f.savings}:balanceOf:${GAUGE}`, 99n);
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "TopologyMismatch",
      field: "gauge.custody",
    });
  });
  test.for([undefined, -1n, 1, "1", 1n << 256n] as const)(
    "malformed required uint %s rejects rather than becoming available",
    async (value) => {
      const f = await fixture();
      f.values.set(`${f.savings}:pendingYield`, value);
      await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
        code: "InvalidReadValue",
        field: "pendingYield",
      });
    },
  );
  test("failed required transport read retains the Core failure", async () => {
    const f = await fixture();
    f.fail.add(`${f.savings}:totalSupply`);
    await expect(createSavingsReader(f.config).read({ account: ACCOUNT })).rejects.toMatchObject({
      code: "PartialReadFailure",
    });
  });
});
