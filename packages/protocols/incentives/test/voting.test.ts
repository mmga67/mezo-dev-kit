import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { forecastVoting, createVotingReader } from "../src/index.ts";
import { verifyVotingSettlement } from "../src/voting-settlement.ts";
import { target, target2, votingFixture, votingSettlement } from "./voting-fixture.ts";
import { account, week } from "./lock-fixture.ts";
const action = { kind: "vote", targets: [target, target2], relativeWeights: [1n, 2n] } as const;
test("voting floors each relative allocation and preserves dust without assigning it", () => {
  expect(forecastVoting({ snapshot: votingFixture(), action })).toMatchObject({
    allocations: [33n, 67n],
    usedWeight: 100n,
    votingPower: 101n,
  });
});
test.for([
  { label: "at opening", time: 3n * week + 3600n, ok: false },
  { label: "after opening", time: 3n * week + 3601n, ok: true },
  { label: "at closing", time: 4n * week - 3600n, ok: true },
  { label: "after closing", time: 4n * week - 3599n, ok: false },
])("voting window $label", ({ time, ok }) => {
  const source = votingFixture(),
    snapshot = { ...source, escrow: { ...source.escrow, timestamp: time } };
  const vote = () => forecastVoting({ snapshot, action });
  if (ok) expect(vote().usedWeight).toBe(100n);
  else expect(vote).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
});
test("reset after close preserves lastVoted and can remove killed targets; whitelist only relaxes vote closing", () => {
  const source = votingFixture(),
    snapshot = {
      ...source,
      escrow: { ...source.escrow, timestamp: 4n * week - 1n },
      targets: source.targets.map((row) => ({ ...row, alive: false })),
    };
  expect(forecastVoting({ snapshot, action: { kind: "reset" } })).toMatchObject({
    usedWeight: 0n,
    lastVoted: snapshot.lastVoted,
  });
  expect(() => forecastVoting({ snapshot: { ...snapshot, whitelisted: true }, action })).toThrow(
    expect.objectContaining({ code: "IneligibleOperation" }),
  );
  expect(
    forecastVoting({
      snapshot: { ...snapshot, whitelisted: true, targets: source.targets },
      action,
    }).usedWeight,
  ).toBe(100n);
});
test("same-epoch voting and reset fail even for whitelisted NFTs", () => {
  const snapshot = { ...votingFixture(), lastVoted: 3n * week, whitelisted: true };
  for (const selected of [action, { kind: "reset" } as const])
    expect(() => forecastVoting({ snapshot, action: selected })).toThrow(
      expect.objectContaining({ code: "IneligibleOperation" }),
    );
});
test("suppressed voting power, zero floor, duplicate targets and invalid limits fail before encoding", () => {
  const snapshot = votingFixture();
  for (const selected of [
    { ...action, targets: [target, target] },
    { ...action, relativeWeights: [0n, 1n] },
    { ...action, targets: [] },
    { ...action, relativeWeights: [1n] },
  ])
    expect(() => forecastVoting({ snapshot, action: selected })).toThrow();
  expect(() => forecastVoting({ snapshot: { ...snapshot, maxVotingNum: 1n }, action })).toThrow();
  expect(() =>
    forecastVoting({
      snapshot: {
        ...snapshot,
        escrow: {
          ...snapshot.escrow,
          locks: snapshot.escrow.locks.map((row) => ({
            ...row,
            currentVotingPower: 0n,
            ownershipChangeSuppressed: true,
          })),
        },
      },
      action,
    }),
  ).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
});
test("ordinary self-owned locks require their voter authorization", () => {
  const snapshot = votingFixture();
  for (const changes of [
    { owner: target },
    { kind: "managed" as const },
    { delegatee: 2n },
    { grantManager: target },
    { callerApproved: false },
  ])
    expect(() =>
      forecastVoting({
        snapshot: {
          ...snapshot,
          escrow: {
            ...snapshot.escrow,
            locks: snapshot.escrow.locks.map((row) => ({ ...row, ...changes })),
          },
        },
        action,
      }),
    ).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
  expect(() =>
    forecastVoting({ snapshot: { ...snapshot, voterAuthorized: false }, action }),
  ).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
});
test("an explicit snapshot timestamp retains same-block ownership suppression", () => {
  const source = votingFixture();
  const snapshot = {
    ...source,
    escrow: {
      ...source.escrow,
      locks: source.escrow.locks.map((row) => ({
        ...row,
        currentVotingPower: 0n,
        ownershipChangeSuppressed: true,
      })),
    },
  };
  expect(() =>
    forecastVoting({ snapshot, action, atTimestamp: snapshot.escrow.timestamp }),
  ).toThrow(expect.objectContaining({ code: "IneligibleOperation" }));
  expect(
    forecastVoting({ snapshot, action, atTimestamp: snapshot.escrow.timestamp + 1n }).usedWeight,
  ).toBe(100n);
});
test.for(["pools", "boost", "validator"] as const)(
  "%s replacement vote reconciles reset, events and same-epoch overwritten checkpoints",
  (domain) => {
    expect(verifyVotingSettlement(votingSettlement(domain)).usedWeight).toBe(101n);
  },
);
test("settlement rejects missing reward events, forged allocations, checkpoint increments and unrelated totals", () => {
  const fixture = votingSettlement();
  for (const after of [
    { ...fixture.after, totalWeight: 132n },
    { ...fixture.after, lastVoted: fixture.after.lastVoted + 1n },
    {
      ...fixture.after,
      targets: fixture.after.targets.map((row) => ({
        ...row,
        rewards: row.rewards.map((reward) => ({
          ...reward,
          numCheckpoints: reward.numCheckpoints + 1n,
        })),
      })),
    },
    { ...fixture.after, escrow: { ...fixture.after.escrow, nativeBalance: 0n } },
  ])
    expect(() => verifyVotingSettlement({ ...fixture, after })).toThrow(
      expect.objectContaining({ code: "ReconciliationMismatch" }),
    );
  expect(() =>
    verifyVotingSettlement({
      ...fixture,
      receipt: { ...fixture.receipt, logs: fixture.receipt.logs.slice(1) },
    }),
  ).toThrow(expect.objectContaining({ code: "ReconciliationMismatch" }));
});
test("reset clears this voter, keeps an independent voter and does not consume the epoch", () => {
  const f = votingSettlement();
  const before = {
    ...f.before,
    escrow: {
      ...f.before.escrow,
      locks: f.before.escrow.locks.map((row) => ({ ...row, voters: [...row.voters, target2] })),
    },
  };
  const after = {
    ...f.after,
    totalWeight: 30n,
    usedWeight: 0n,
    lastVoted: before.lastVoted,
    previousTargets: [],
    escrow: {
      ...f.after.escrow,
      locks: f.after.escrow.locks.map((row) => ({ ...row, voters: [target2], voted: true })),
    },
    targets: f.after.targets.map((row) =>
      row.target !== target
        ? row
        : {
            ...row,
            vote: 0n,
            weight: 20n,
            rewards: row.rewards.map((reward) => ({ ...reward, balance: 0n, totalSupply: 20n })),
          },
    ),
  };
  const reset = {
    ...f,
    before,
    after,
    action: { kind: "reset" } as const,
    receipt: { ...f.receipt, logs: f.receipt.logs.slice(0, 3) },
  };
  expect(verifyVotingSettlement(reset)).toMatchObject({
    usedWeight: 0n,
    lastVoted: before.lastVoted,
  });
  expect(() =>
    verifyVotingSettlement({
      ...reset,
      after: {
        ...after,
        escrow: {
          ...after.escrow,
          locks: after.escrow.locks.map((row) => ({ ...row, voters: [], voted: false })),
        },
      },
    }),
  ).toThrow(expect.objectContaining({ code: "ReconciliationMismatch" }));
});
test("voting reader rejects oversized, duplicate and zero IDs without provider I/O", async () => {
  let calls = 0;
  const reader = createVotingReader({
    networkId: "mezo-mainnet",
    domain: "pools",
    registry: createContractRegistry(),
    transport: createRpcTransport({
      id: "unreachable",
      request: async () => {
        calls++;
        throw new Error("unexpected RPC");
      },
    }),
  });
  for (const input of [
    { tokenId: 0n, targets: [] },
    { tokenId: 1n, targets: [target, target] },
    { tokenId: 1n, targets: Array.from({ length: 33 }, () => target) },
  ])
    await expect(reader.read({ account, ...input })).rejects.toThrow();
  expect(calls).toBe(0);
});
