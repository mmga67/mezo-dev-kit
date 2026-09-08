import { expect, test } from "vitest";
import { lockWalletBalance } from "../src/lock-balance.ts";
test("native BTC lock movements include gas, while MEZO's underlying ledger excludes native gas", () => {
  expect(lockWalletBalance({ before: 100n, deposit: 20n, withdraw: 0n, tokenGasFee: 3n })).toBe(
    77n,
  );
  expect(lockWalletBalance({ before: 100n, deposit: 20n, withdraw: 0n, tokenGasFee: 0n })).toBe(
    80n,
  );
  expect(lockWalletBalance({ before: 100n, deposit: 0n, withdraw: 20n, tokenGasFee: 3n })).toBe(
    117n,
  );
  expect(() =>
    lockWalletBalance({ before: 2n, deposit: 0n, withdraw: 0n, tokenGasFee: 3n }),
  ).toThrow();
});
