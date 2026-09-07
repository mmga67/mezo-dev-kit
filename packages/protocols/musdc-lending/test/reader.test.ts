import { describe, expect, test } from "vitest";
import { createLendingReader } from "../src/index.ts";
import { ACCOUNT, BLOCK, HASH, TIME, fixture } from "./fixture.ts";
const input = { account: ACCOUNT, maxPriceAgeSeconds: 60n };
describe("lending bounded reads", () => {
  test("one coordinate combines accrued debt, separate share units, and distinct liquidity observations", async () => {
    const f = await fixture();
    const result = await createLendingReader(f.config).read(input);
    expect(result.coordinate).toMatchObject({ blockNumber: BLOCK, blockHash: HASH });
    expect(result.accruedMarket).toMatchObject({
      status: "available",
      value: { interest: 3606n, totalBorrowAssets: 1_003_606n },
    });
    expect(result.debt).toEqual({
      status: "available",
      value: { unit: "mUSDC-debt", baseUnits: 100361n },
    });
    expect(result.supplyAssets).toEqual({
      status: "available",
      value: { unit: "mUSDC", baseUnits: 200360n },
    });
    expect(result.health).toMatchObject({
      status: "available",
      value: { healthy: true, reason: "evaluated" },
    });
    expect(result.accountingLiquidity).toEqual({ unit: "mUSDC", baseUnits: 1_000_000n });
    expect(result.tokenLiquidity).toMatchObject({
      status: "available",
      value: { baseUnits: 900_000n },
    });
    expect(
      [...f.reads.map((x) => x.request), ...f.inspected].every(
        (x) => x.blockNumber === BLOCK && x.blockHash === HASH,
      ),
    ).toBe(true);
    expect(
      f.reads.every((x) => x.call.abi.every((entry) => entry.stateMutability === "view")),
    ).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
  test.for([
    [TIME - 61n, "PriceStale"],
    [0n, "PriceMissingTime"],
    [TIME + 1n, "PriceFuture"],
  ] as const)("timestamp %s preserves %s without producing health", async ([timestamp, code]) => {
    const f = await fixture();
    f.values.set("latestRoundData", [0n, 10n ** 24n, 0n, timestamp, 0n]);
    const r = await createLendingReader(f.config).read(input);
    expect(r.price).toMatchObject({ status: "unavailable", error: { code } });
    expect(r.health).toMatchObject({ status: "unavailable", error: { code } });
    expect(r.debt.status).toBe("available");
  });
  test("normalized feed disagreement stays explicit", async () => {
    const f = await fixture();
    f.values.set("price", 10n ** 30n + 1n);
    const r = await createLendingReader(f.config).read(input);
    expect(r.price).toMatchObject({ error: { code: "PriceDisagreement" } });
  });
  test("zero debt can be healthy while price and borrow rate are unavailable", async () => {
    const f = await fixture();
    f.values.set("position", [0n, 0n, 0n]);
    f.fail.add("price");
    f.fail.add("borrowRateView");
    const r = await createLendingReader(f.config).read(input);
    expect(r.health).toEqual({
      status: "available",
      value: { healthy: true, maxBorrowAssets: null, reason: "zero-debt" },
    });
    expect(r.accruedMarket.status).toBe("unavailable");
  });
  test("rate is unnecessary when storage is already accrued to the block time", async () => {
    const f = await fixture();
    f.values.set("market", [
      2_000_000n,
      2_000_000_000_000n,
      1_000_000n,
      1_000_000_000_000n,
      TIME,
      0n,
    ]);
    f.fail.add("borrowRateView");
    const r = await createLendingReader(f.config).read(input);
    expect(r.accruedMarket).toMatchObject({ status: "available", value: { interest: 0n } });
    expect(r.debt.status).toBe("available");
  });
  test("missing position never becomes zero debt", async () => {
    const f = await fixture();
    f.fail.add("position");
    const r = await createLendingReader(f.config).read(input);
    expect(r.debt.status).toBe("unavailable");
    expect(r.health.status).toBe("unavailable");
    expect(r.price.status).toBe("available");
  });
  test("failed liquidity port leaves market and health readable", async () => {
    const f = await fixture();
    f.state.tokenFailure = true;
    const r = await createLendingReader(f.config).read(input);
    expect(r.tokenLiquidity.status).toBe("unavailable");
    expect(r.health.status).toBe("available");
  });
  test("fee recipient receives accrued fee shares in its asset projection", async () => {
    const f = await fixture();
    f.values.set("market", [
      2_000_000n,
      2_000_000_000_000n,
      1_000_000n,
      1_000_000_000_000n,
      TIME - 3600n,
      10n ** 17n,
    ]);
    const r = await createLendingReader(f.config).read(input);
    expect(r.supplyAssets).toMatchObject({ status: "available", value: { baseUnits: 200684n } });
  });
  test.for(["priceFeed", "MORPHO"])(
    "wrong %s back-reference rejects the snapshot",
    async (name) => {
      const f = await fixture();
      f.values.set(name, ACCOUNT);
      await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
        code: "TopologyMismatch",
      });
    },
  );
  test("wrong market collateral rejects before position accounting", async () => {
    const f = await fixture();
    f.values.set("idToMarketParams", [ACCOUNT, ACCOUNT, ACCOUNT, ACCOUNT, 0n]);
    await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("new runtime bytes cannot inherit accepted formulas", async () => {
    const f = await fixture();
    f.code.set(f.morpho.address, "0x1234");
    await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
      code: "UnsupportedRuntime",
    });
  });
  test("unexpected proxy implementation rejects", async () => {
    const f = await fixture();
    f.state.wrongImplementation = true;
    await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("reorg across read stages rejects the complete coordinate", async () => {
    const f = await fixture();
    f.state.reorg = true;
    await expect(createLendingReader(f.config).read(input)).rejects.toThrow();
  });
  test("chain mismatch prevents reads", async () => {
    const f = await fixture();
    f.state.chainId = 1n;
    await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
      code: "ChainMismatch",
    });
    expect(f.reads).toHaveLength(0);
  });
  test.for(["market", "idToMarketParams"])(
    "required %s transport failure rejects",
    async (name) => {
      const f = await fixture();
      f.fail.add(name);
      await expect(createLendingReader(f.config).read(input)).rejects.toMatchObject({
        code: "PartialReadFailure",
      });
    },
  );
  test.for([-1n, "100", 1n << 128n])(
    "malformed position value %s remains unavailable",
    async (value) => {
      const f = await fixture();
      f.values.set("position", [0n, value, 0n]);
      const r = await createLendingReader(f.config).read(input);
      expect(r.position).toMatchObject({ status: "unavailable", error: { code: "InvalidValue" } });
    },
  );
});
