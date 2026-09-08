import { describe, expect, test } from "vitest";
import { createVaultReader } from "../src/index.ts";
import { ACCOUNT, BLOCK, HASH, GAUGE, VAULT, fixture } from "./fixture.ts";
const input = {
  account: ACCOUNT,
  previewAssets: 1_000_000n,
  previewShares: 10n ** 18n,
  maxPriceAgeSeconds: 60n,
};
describe("vault reader composition", () => {
  test.for([
    { label: "zero account", account: `0x${"0".repeat(40)}` },
    { label: "account with newline", account: `${ACCOUNT}\n` },
  ] as const)("rejects $label with the domain error before contract reads", async ({ account }) => {
    const f = await fixture();
    await expect(createVaultReader(f.config).read({ ...input, account })).rejects.toMatchObject({
      code: "InvalidValue",
    });
    expect(f.reads).toHaveLength(0);
  });

  test("reconciles one adapter allocation and counts beneficial receipts exactly once", async () => {
    const f = await fixture();
    const r = await createVaultReader(f.config).read(input);
    expect(r.coordinate).toMatchObject({ blockNumber: BLOCK, blockHash: HASH });
    expect(r.allocationReconciled).toEqual({ status: "available", value: true });
    expect(r.adapterAssets).toMatchObject({ value: { unit: "mUSDC", baseUnits: 1_000_000n } });
    expect(r.vaultState).toMatchObject({ value: { newTotalAssets: 1_000_000n } });
    expect(r.beneficialReceipts).toEqual({
      status: "available",
      value: { unit: "vault-wrapper-receipts", baseUnits: 10n ** 18n },
    });
    expect(r.harvest).toMatchObject({
      value: { yieldShares: { unit: "VaultV2-shares", baseUnits: 0n } },
    });
    expect(r.gauge).toMatchObject({
      value: {
        earnedRewards: { value: { unit: "gauge-reward-token", baseUnits: 123n } },
        redirectedRevenue: { value: { unit: "VaultV2-shares", baseUnits: 456n } },
      },
    });
    expect(r.previews).toMatchObject({
      value: { depositShares: { baseUnits: 10n ** 18n }, redeemAssets: { baseUnits: 1_000_000n } },
    });
    expect(r.idleLiquidity).toMatchObject({ status: "available", value: { baseUnits: 0n } });
    expect(
      f.reads.every((x) => x.coordinate.blockNumber === BLOCK && x.coordinate.blockHash === HASH),
    ).toBe(true);
  });
  test("unknown gauge runtime remains unavailable without making gauge ABI calls", async () => {
    const f = await fixture();
    f.code.set(GAUGE, "0x1234");
    const r = await createVaultReader(f.config).read(input);
    expect(r.gauge).toMatchObject({ status: "unavailable", error: { code: "UnsupportedRuntime" } });
    expect(r.beneficialReceipts.status).toBe("unavailable");
    expect(r.previews.status).toBe("available");
    expect(f.reads.filter((x) => x.address === GAUGE)).toHaveLength(0);
  });
  test("unknown vault runtime rejects rather than using a generic ERC4626 interface", async () => {
    const f = await fixture();
    f.code.set(VAULT, "0x1234");
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "UnsupportedRuntime",
    });
  });
  test("custody donations are not extra beneficial stake", async () => {
    const f = await fixture();
    f.values.set(`${f.wrapper}:balanceOf:${ACCOUNT}`, 10n ** 17n);
    f.values.set(`${f.wrapper}:balanceOf:${GAUGE}`, 9n * 10n ** 17n);
    const r = await createVaultReader(f.config).read(input);
    expect(r.beneficialReceipts).toMatchObject({ value: { baseUnits: 9n * 10n ** 17n } });
  });
  test("direct wallet vault shares cannot overlap the wrapper's custody", async () => {
    const f = await fixture();
    f.values.set(`${VAULT}:balanceOf:${ACCOUNT}`, 1n);
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
      field: "vault share ownership exceeds supply",
    });
  });
  test("missing gauge reward preserves principal", async () => {
    const f = await fixture();
    f.fail.add(`${GAUGE}:earned`);
    const r = await createVaultReader(f.config).read(input);
    expect(r.gauge).toMatchObject({ value: { earnedRewards: { status: "unavailable" } } });
    expect(r.beneficialReceipts.status).toBe("available");
  });
  test("missing idle liquidity never becomes zero liquidity", async () => {
    const f = await fixture();
    f.state.tokenFailure = true;
    const r = await createVaultReader(f.config).read(input);
    expect(r.idleLiquidity.status).toBe("unavailable");
    expect(r.allocationReconciled.status).toBe("available");
  });
  test("failed fee-aware state prevents previews and receipt asset estimates", async () => {
    const f = await fixture();
    f.fail.add(`${VAULT}:accrueInterestView`);
    const r = await createVaultReader(f.config).read(input);
    expect(r.vaultState.status).toBe("unavailable");
    expect(r.previews.status).toBe("unavailable");
    expect(r.receiptAssets.status).toBe("unavailable");
  });
  test.for(["previewDeposit", "convertToAssets"])(
    "disagreeing %s rejects the snapshot",
    async (name) => {
      const f = await fixture();
      f.values.set(`${VAULT}:${name}`, 1n);
      await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
        code: "TopologyMismatch",
      });
    },
  );
  test("adapter real assets must agree with its composed Morpho position", async () => {
    const f = await fixture();
    f.values.set(`${f.adapter}:realAssets`, 1_000_001n);
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("additional adapters cannot inherit the bounded one-adapter model", async () => {
    const f = await fixture();
    f.values.set(`${VAULT}:adaptersLength`, 2n);
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("yield exceeding wrapper custody rejects before claims", async () => {
    const f = await fixture();
    f.values.set(`${f.wrapper}:accumulatedYield`, 10n ** 18n + 1n);
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("gauge staking-token conflict rejects", async () => {
    const f = await fixture();
    f.values.set(`${GAUGE}:stakingToken`, ACCOUNT);
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "TopologyMismatch",
    });
  });
  test("reorg after the lending batch rejects the complete vault result", async () => {
    const f = await fixture();
    f.state.reorg = true;
    await expect(createVaultReader(f.config).read(input)).rejects.toMatchObject({
      code: "InconsistentCoordinate",
    });
  });
  test("gauge custody cannot be queried as the beneficiary", async () => {
    const f = await fixture();
    await expect(
      createVaultReader(f.config).read({ ...input, account: GAUGE }),
    ).rejects.toMatchObject({ code: "InvalidValue" });
  });
  test("wallet read failure is explicit and blocks the combined claim", async () => {
    const f = await fixture();
    f.fail.add(`${f.wrapper}:balanceOf`);
    const r = await createVaultReader(f.config).read(input);
    expect(r.walletReceipts.status).toBe("unavailable");
    expect(r.receiptClaim.status).toBe("unavailable");
  });
});
