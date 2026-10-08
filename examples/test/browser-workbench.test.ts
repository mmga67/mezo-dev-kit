import { expect, test, vi } from "vitest";
import type { ExecutionObservation } from "@mezo-dev-kit/core";
import { createAccountLoader } from "../browser-workbench/accounts.ts";
import type { AccountContext, AccountState, SourceValue } from "../browser-workbench/accounts.ts";
import { freshness, presentAmount } from "../browser-workbench/presentation.ts";
import { parsePreference, restore, save } from "../browser-workbench/storage.ts";
import {
  advanceDemo,
  demoProgress,
  describeObservation,
  encodeCheckpoint,
  parseCheckpoint,
} from "../browser-workbench/transaction.ts";
import type { DemoCheckpoint } from "../browser-workbench/transaction.ts";
import { watchWallet } from "../browser-workbench/wallet-resume.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const alice = { account: "alice", chain: "demo-a" } as const;
const bob = { account: "bob", chain: "demo-a" } as const;
const sourceValue = (units: bigint): SourceValue => ({
  units,
  observedAt: 1000,
  source: "fixture",
});

test.for([
  {
    units: 9007199254740993000001n,
    decimals: 6,
    locale: "en-US" as const,
    display: "9,007,199,254,740,993.0000",
    exact: "9007199254740993.000001",
    shortened: true,
  },
  {
    units: 1n,
    decimals: 6,
    locale: "de-DE" as const,
    display: "<0,0001",
    exact: "0.000001",
    shortened: true,
  },
  { units: 0n, decimals: 6, locale: "en-US" as const, display: "0", exact: "0", shortened: false },
  {
    units: 125n,
    decimals: 2,
    locale: "de-DE" as const,
    display: "1,25",
    exact: "1.25",
    shortened: false,
  },
  {
    units: 100n,
    decimals: 0,
    locale: "en-US" as const,
    display: "100",
    exact: "100",
    shortened: false,
  },
])(
  "preserves exact disclosure for $exact ($locale)",
  ({ units, decimals, locale, ...expected }) => {
    expect(presentAmount(units, decimals, locale, Math.min(4, decimals))).toEqual(expected);
  },
);

test("freshness uses supplied time including the boundary and clock mismatch", () => {
  expect(freshness(1000, 2000, 1000)).toBe("Fresh fixture");
  expect(freshness(1000, 2001, 1000)).toBe("Stale fixture");
  expect(freshness(2000, 1000, 1000)).toBe("Clock mismatch");
});

test("late account results and errors cannot overwrite the new account; failures remain partial", async () => {
  const reads = Array.from({ length: 4 }, () => deferred<SourceValue>());
  let index = 0;
  const source = () => {
    const read = reads[index++];
    if (!read) throw new Error("Unexpected read");
    return read.promise;
  };
  const states: AccountState[] = [];
  const loader = createAccountLoader({ balance: source, valuation: source }, (state) => {
    states.push(state);
  });
  const old = loader.refresh(alice);
  const current = loader.refresh(bob);
  reads[2]?.resolve(sourceValue(1n));
  reads[3]?.reject(new Error("Missing valuation"));
  await current;
  const count = states.length;
  reads[0]?.resolve(sourceValue(100n));
  reads[1]?.reject(new Error("Old error"));
  await old;
  expect(states).toHaveLength(count);
  expect(states.at(-1)).toMatchObject({
    context: bob,
    balance: { status: "available", value: { units: 1n } },
    valuation: { status: "unavailable", value: null },
  });
});

test("same-context refresh retains data, chain changes clear it, and disposal suppresses publication", async () => {
  const states: AccountState[] = [];
  const balance = vi.fn(async () => sourceValue(20n));
  const loader = createAccountLoader({ balance, valuation: balance }, (state) => {
    states.push(state);
  });
  await loader.refresh(alice);
  const refresh = loader.refresh(alice);
  expect(states.at(-1)?.balance).toMatchObject({ status: "loading", value: { units: 20n } });
  await refresh;
  const changed = loader.refresh({ ...alice, chain: "demo-b" });
  expect(states.at(-1)?.balance.value).toBeNull();
  loader.dispose();
  const count = states.length;
  await changed;
  await loader.refresh(bob);
  expect(states).toHaveLength(count);
  expect(balance).toHaveBeenCalledTimes(6);
});

test.for(["{", '{"version":2,"locale":"en-US"}', '{"version":1,"locale":"unknown"}', "[]"])(
  "invalid preference %s is disclosed",
  (raw) => {
    expect(
      restore({ getItem: () => raw, setItem: () => undefined }, "key", parsePreference, "en-US"),
    ).toEqual({ value: "en-US", status: "invalid" });
  },
);
test("SSR/missing storage and denied reads/writes remain explicit", () => {
  const denied = {
    getItem: () => {
      throw new Error("Denied");
    },
    setItem: () => {
      throw new Error("Denied");
    },
  };
  expect(restore(null, "key", parsePreference, "en-US").status).toBe("unavailable");
  expect(restore(denied, "key", parsePreference, "en-US").status).toBe("unavailable");
  expect(save(denied, "key", { version: 1, locale: "de-DE" })).toBe("memory-only");
  expect(
    restore(
      { getItem: () => '{"version":1,"locale":"de-DE"}', setItem: () => undefined },
      "key",
      parsePreference,
      "en-US",
    ).value,
  ).toBe("de-DE");
});

test("uncertain progress reload preserves exact amount and later hash; confirmed refresh failure is distinct", () => {
  let checkpoint: DemoCheckpoint = {
    version: 1,
    scenario: "uncertain",
    step: 1,
    amount: 9007199254740993000001n,
  };
  expect(demoProgress(checkpoint)).toMatchObject({ phase: "submission-uncertain", hash: null });
  expect(parseCheckpoint(JSON.parse(JSON.stringify(encodeCheckpoint(checkpoint))))).toEqual(
    checkpoint,
  );
  checkpoint = advanceDemo(checkpoint);
  const restored = parseCheckpoint(JSON.parse(JSON.stringify(encodeCheckpoint(checkpoint))));
  expect(restored).toEqual(checkpoint);
  expect(demoProgress(checkpoint).hash).toHaveLength(66);
  const failed: DemoCheckpoint = { ...checkpoint, scenario: "refresh-failed", step: 4 };
  expect(demoProgress(failed).label).toContain("Receipt confirmed");
  expect(demoProgress(advanceDemo(failed)).phase).toBe("reconciled");
  expect(demoProgress(advanceDemo(failed)).hash).toBe(demoProgress(failed).hash);
});
test.for([
  { version: 2, scenario: "success", step: 1, amount: "1" },
  { version: 1, scenario: "success", step: 99, amount: "1" },
  { version: 1, scenario: "success", step: 1, amount: 1 },
  { version: 1, scenario: "success", step: 1, amount: "1.1" },
  { version: 1, scenario: "__proto__", step: 1, amount: "1" },
])("rejects malformed checkpoint $scenario/$step/$amount", (value) => {
  expect(() => parseCheckpoint(value)).toThrow();
});

test("Core observation adaptation retains operation identity and does not claim protocol success", () => {
  const record = {
    schemaVersion: 1,
    operationId: "synthetic-intent",
    networkId: "mezo-testnet",
    contractId: "bridge.musd-ntt-manager",
    blockNumber: "1",
    blockHash: `0x${"aa".repeat(32)}`,
    hash: null,
    inclusion: null,
    call: {
      chainId: "1",
      from: `0x${"11".repeat(20)}`,
      to: `0x${"22".repeat(20)}`,
      value: "0",
      data: "0x",
      nonce: "0",
    },
  } as const;
  const result: ExecutionObservation = { state: "submission-uncertain", record };
  expect(describeObservation(result)).toContain("synthetic-intent: Submission uncertain");
});

test("resume coalesces, provider changes invalidate pending reads, and cleanup removes subscriptions", async () => {
  const read = deferred<AccountContext | null>();
  const inspect = vi.fn(() => read.promise);
  const apply = vi.fn();
  const stopVisible = vi.fn();
  const stopChange = vi.fn();
  let event: ((context: AccountContext | null) => void) | undefined;
  const watcher = watchWallet({
    inspect,
    apply,
    unavailable: vi.fn(),
    onVisible: () => stopVisible,
    onChange: (listener) => {
      event = listener;
      return stopChange;
    },
  });
  const first = watcher.resume();
  const second = watcher.resume();
  expect(first).toBe(second);
  event?.(bob);
  event?.(null);
  read.resolve(alice);
  await first;
  expect(inspect).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls).toEqual([[bob], [null]]);
  watcher.dispose();
  await watcher.resume();
  expect(stopVisible).toHaveBeenCalledOnce();
  expect(stopChange).toHaveBeenCalledOnce();
  expect(inspect).toHaveBeenCalledTimes(1);
});
test("rejected resume is unavailable, never assumed connected", async () => {
  const apply = vi.fn();
  const unavailable = vi.fn();
  const watcher = watchWallet({
    inspect: async () => {
      throw new Error("Connection rejected");
    },
    apply,
    unavailable,
    onVisible: () => () => undefined,
    onChange: () => () => undefined,
  });
  await watcher.resume();
  expect(unavailable).toHaveBeenCalledOnce();
  expect(apply).not.toHaveBeenCalled();
  watcher.dispose();
});
