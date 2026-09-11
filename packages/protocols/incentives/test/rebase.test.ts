import { expect, test } from "vitest";
import { calculateRebaseClaim, forecastRebaseClaim } from "../src/index.ts";
import { verifyRebaseSettlement } from "../src/rebase-settlement.ts";
import { rebaseFixture, rebaseSettlement } from "./rebase-fixture.ts";
import { week } from "./lock-fixture.ts";
test("weekly fractions floor separately and zero total voting power uses denominator one", () => {
  const snapshot = rebaseFixture();
  expect(calculateRebaseClaim(snapshot)).toMatchObject({
    amount: 6n,
    periods: 2n,
    nextCursor: 3n * week,
    hasMore: false,
  });
  expect(
    calculateRebaseClaim({
      ...snapshot,
      periods: snapshot.periods.map((row) => ({ ...row, totalVotingPower: 0n })),
    }).amount,
  ).toBe(20n);
});
test("a claim consumes at most 50 complete weeks and the next call resumes its cursor", () => {
  const cursor = {
      startTime: week,
      lastTokenTime: 52n * week,
      timeCursor: 0n,
      firstUserTimestamp: week + 1n,
    },
    periods = Array.from({ length: 50 }, (_, i) => ({
      week: BigInt(i + 1) * week,
      votingPower: 1n,
      totalVotingPower: 1n,
      allocated: 1n,
    }));
  const first = calculateRebaseClaim({ ...cursor, periods });
  expect(first).toEqual({
    amount: 50n,
    epochStart: week,
    nextCursor: 51n * week,
    periods: 50n,
    hasMore: true,
  });
  expect(
    calculateRebaseClaim({
      ...cursor,
      timeCursor: first.nextCursor,
      periods: [{ ...periods[0]!, week: 51n * week }],
    }),
  ).toEqual({
    amount: 1n,
    epochStart: 51n * week,
    nextCursor: 52n * week,
    periods: 1n,
    hasMore: false,
  });
});
test("initial claim preserves the pre-clamp event start and early-return cursor", () => {
  const snapshot = rebaseFixture();
  expect(
    calculateRebaseClaim({ ...snapshot, startTime: 2n * week, periods: snapshot.periods.slice(1) }),
  ).toMatchObject({ epochStart: week, amount: 3n, nextCursor: 3n * week });
  expect(
    calculateRebaseClaim({ ...snapshot, firstUserTimestamp: 3n * week + 1n, periods: [] }),
  ).toMatchObject({ epochStart: 3n * week, nextCursor: 3n * week, amount: 0n });
  expect(
    calculateRebaseClaim({ ...snapshot, firstUserTimestamp: null, periods: [] }),
  ).toMatchObject({ epochStart: 0n, nextCursor: 0n, amount: 0n });
});
test("missing, reordered, misaligned and overflowing claim history fails closed", () => {
  const snapshot = rebaseFixture();
  for (const input of [
    { ...snapshot, periods: [] },
    { ...snapshot, periods: [...snapshot.periods].reverse() },
    { ...snapshot, timeCursor: 1n },
    {
      ...snapshot,
      periods: snapshot.periods.map((row) => ({ ...row, allocated: 1n << 255n, votingPower: 2n })),
    },
  ])
    expect(() => calculateRebaseClaim(input)).toThrow();
});
test("expiry equality switches to liquid MEZO; minter upkeep is a separate precondition", () => {
  const snapshot = rebaseFixture("active"),
    end = snapshot.escrow.locks[0]!.end;
  expect(forecastRebaseClaim({ snapshot }).disposition).toBe("locked");
  const atExpiry = { ...snapshot, activePeriod: end };
  expect(forecastRebaseClaim({ snapshot: atExpiry, atTimestamp: end - 1n }).disposition).toBe(
    "locked",
  );
  expect(forecastRebaseClaim({ snapshot: atExpiry, atTimestamp: end }).disposition).toBe("liquid");
  expect(() => forecastRebaseClaim({ snapshot, atTimestamp: end })).toThrow(/minter period/);
});
test("voted ordinary NFT remains eligible, but custody and ownership restrictions fail closed", () => {
  const snapshot = rebaseFixture();
  expect(forecastRebaseClaim({ snapshot }).amount).toBe(6n);
  for (const next of [
    { ...snapshot, custody: { ...snapshot.custody, allowance: 5n } },
    { ...snapshot, tokenLastBalance: 5n },
    {
      ...snapshot,
      escrow: {
        ...snapshot.escrow,
        locks: snapshot.escrow.locks.map((lock) => ({ ...lock, delegatee: 2n })),
      },
    },
  ])
    expect(() => forecastRebaseClaim({ snapshot: next })).toThrow();
});
test.for(["permanent", "active", "expired", "zero"] as const)(
  "%s claim reconciles exact cursor, recipient and escrow accounting with separate native gas",
  (kind) => {
    const fixture = rebaseSettlement(kind),
      outcome = verifyRebaseSettlement(fixture);
    expect(outcome.amount).toBe(kind === "zero" ? 0n : 6n);
    expect(outcome.disposition).toBe(
      kind === "zero" ? "none" : kind === "expired" ? "liquid" : "locked",
    );
    expect(fixture.after.timeCursor).toBe(3n * week);
  },
);
test.for(["cursor", "voter", "wallet", "custody", "supply", "checkpoint", "event"] as const)(
  "%s corruption cannot be reported as a settled rebase",
  (kind) => {
    const fixture = rebaseSettlement();
    let after = fixture.after,
      receipt = fixture.receipt;
    if (kind === "cursor") after = { ...after, timeCursor: after.timeCursor + week };
    if (kind === "voter")
      after = {
        ...after,
        escrow: {
          ...after.escrow,
          locks: after.escrow.locks.map((lock) => ({ ...lock, voted: false, voters: [] })),
        },
      };
    if (kind === "wallet")
      after = {
        ...after,
        escrow: {
          ...after.escrow,
          token: { ...after.escrow.token, balance: after.escrow.token.balance + 1n },
        },
      };
    if (kind === "custody")
      after = { ...after, custody: { ...after.custody, balance: after.custody.balance + 1n } };
    if (kind === "supply")
      after = { ...after, escrow: { ...after.escrow, supply: after.escrow.supply + 1n } };
    if (kind === "checkpoint") after = { ...after, userPointEpoch: after.userPointEpoch + 1n };
    if (kind === "event") receipt = { ...receipt, logs: [] };
    expect(() => verifyRebaseSettlement({ ...fixture, after, receipt })).toThrow();
  },
);
