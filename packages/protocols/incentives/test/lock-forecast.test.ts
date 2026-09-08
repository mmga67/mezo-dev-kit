import { expect, test } from "vitest";
import { forecastLock } from "../src/index.ts";
import { lockFixture, account, W, week } from "./lock-fixture.ts";
test("create, increase and extend preserve exact amount and rounded duration", () => {
  const snapshot = lockFixture();
  expect(
    forecastLock({ snapshot, action: { kind: "create", amount: W, duration: week } }),
  ).toMatchObject({ amount: W, deposit: W, end: 3n * week, permanent: false });
  expect(
    forecastLock({ snapshot, action: { kind: "increase", tokenId: 1n, amount: W } }),
  ).toMatchObject({ amount: 11n * W, deposit: W, end: 4n * week });
  expect(
    forecastLock({ snapshot, action: { kind: "extend", tokenId: 1n, duration: 3n * week } }),
  ).toMatchObject({ end: 5n * week, amount: 10n * W });
  expect(() =>
    forecastLock({ snapshot, action: { kind: "extend", tokenId: 1n, duration: week } }),
  ).toThrow();
});
test("permanent transitions and expiry equality use operation-specific rules", () => {
  const snapshot = lockFixture(),
    lock = snapshot.locks[0];
  if (!lock) throw new Error("missing fixture");
  expect(forecastLock({ snapshot, action: { kind: "make-permanent", tokenId: 1n } })).toMatchObject(
    { end: 0n, permanent: true, unboostedPower: 10n * W },
  );
  const permanent = { ...snapshot, locks: [{ ...lock, end: 0n, permanent: true }] };
  expect(
    forecastLock({ snapshot: permanent, action: { kind: "unlock-permanent", tokenId: 1n } }),
  ).toMatchObject({ end: 6n * week, permanent: false });
  expect(() =>
    forecastLock({
      snapshot: permanent,
      action: { kind: "withdraw", tokenId: 1n },
      atTimestamp: 20n * week,
    }),
  ).toThrow();
  expect(() =>
    forecastLock({
      snapshot,
      action: { kind: "withdraw", tokenId: 1n },
      atTimestamp: lock.end - 1n,
    }),
  ).toThrow();
  expect(
    forecastLock({ snapshot, action: { kind: "withdraw", tokenId: 1n }, atTimestamp: lock.end }),
  ).toMatchObject({ amount: 0n, withdraw: 10n * W, unboostedPower: 0n });
});
test("managed/granted/delegated/voted locks and operators cannot enter the initial writer", () => {
  const snapshot = lockFixture(),
    lock = snapshot.locks[0];
  if (!lock) throw new Error("missing fixture");
  for (const change of [
    { kind: "managed" as const },
    { grantManager: account },
    { delegatee: 2n },
    { voted: true },
    { boostGauge: account },
    { owner: snapshot.underlying },
  ])
    expect(() =>
      forecastLock({
        snapshot: { ...snapshot, locks: [{ ...lock, ...change }] },
        action: { kind: "increase", tokenId: 1n, amount: W },
      }),
    ).toThrow();
  expect(() =>
    forecastLock({
      snapshot: { ...snapshot, forwarder: account },
      action: { kind: "increase", tokenId: 1n, amount: W },
    }),
  ).toThrow();
});
test("withdrawal uses available direct custody without equating global supply and custody", () => {
  const snapshot = lockFixture(),
    action = { kind: "withdraw", tokenId: 1n } as const;
  expect(() =>
    forecastLock({
      snapshot: { ...snapshot, escrowTokenBalance: 9n * W },
      action,
      atTimestamp: 4n * week,
    }),
  ).toThrow("liquidity");
  expect(
    forecastLock({ snapshot: { ...snapshot, supply: 100n * W }, action, atTimestamp: 4n * week })
      .withdraw,
  ).toBe(10n * W);
});
