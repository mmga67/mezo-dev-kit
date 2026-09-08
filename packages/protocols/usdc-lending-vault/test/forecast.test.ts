import { expect, test } from "vitest";
import { createVaultReader, forecastVault } from "../src/index.ts";
import { fixture, ACCOUNT } from "./fixture.ts";
async function snapshot() {
  const f = await fixture();
  return createVaultReader(f.config).read({
    account: ACCOUNT,
    previewAssets: 1_000_000n,
    previewShares: 10n ** 18n,
    maxPriceAgeSeconds: 60n,
  });
}
const bounds = { maxBlockAge: 10n, maxPriceAgeSeconds: 60n, minOutput: 1n, maxInput: 10n ** 20n };
test("deposit and mint preserve the independent asset/share scale", async () => {
  const state = await snapshot();
  expect(forecastVault(state, { kind: "deposit", assets: 1_000_000n }, bounds)).toMatchObject({
    input: 1_000_000n,
    output: 10n ** 18n,
    requiresApproval: true,
  });
  expect(forecastVault(state, { kind: "mint", shares: 10n ** 18n }, bounds)).toMatchObject({
    input: 1_000_000n,
    output: 10n ** 18n,
  });
});
test("staked receipts must return to the wallet before unwrapping", async () => {
  const state = await snapshot();
  expect(() => forecastVault(state, { kind: "unwrap", receipts: 10n ** 18n }, bounds)).toThrow(
    "unstake receipts",
  );
  expect(
    forecastVault(state, { kind: "unwrap", receipts: 10n ** 17n }, bounds).requiresApproval,
  ).toBe(false);
});
test("withdrawals reject unavailable deallocation liquidity and one-unit slippage bounds", async () => {
  const state = await snapshot();
  const funded = {
    ...state,
    walletVaultShares: {
      status: "available" as const,
      value: { unit: "VaultV2-shares" as const, baseUnits: 10n ** 18n },
    },
  };
  const missing = {
    status: "unavailable" as const,
    error: { code: "ReadUnavailable" as const, field: "token liquidity" },
  };
  expect(() =>
    forecastVault(
      { ...funded, underlyingMarket: { ...funded.underlyingMarket, tokenLiquidity: missing } },
      { kind: "withdraw", assets: 1n },
      bounds,
    ),
  ).toThrow("liquidity unavailable");
  expect(() =>
    forecastVault(
      state,
      { kind: "deposit", assets: 1_000_000n },
      { ...bounds, minOutput: 10n ** 18n + 1n },
    ),
  ).toThrow("bounds");
});
