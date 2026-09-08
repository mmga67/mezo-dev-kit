import { expect, test } from "vitest";
import { getReceiptLogs } from "../src/index.ts";
import type { ExecutionReceipt } from "../src/index.ts";
const address = `0x${"11".repeat(20)}` as const,
  transactionHash = `0x${"ab".repeat(32)}` as const,
  blockHash = `0x${"cd".repeat(32)}` as const;
const log = {
  address,
  transactionHash,
  blockHash,
  blockNumber: "0x1",
  logIndex: "0x0",
  removed: false,
  topics: [transactionHash],
  data: "0x",
};
const receipt: ExecutionReceipt = { transactionHash, blockHash, blockNumber: 1n, logs: [log] };
test("receipt logs retain canonical order and reject duplicate ownership", () => {
  expect(
    getReceiptLogs({ ...receipt, logs: [{ ...log, logIndex: "0x2" }, log] }, address).map(
      (item) => item.logIndex,
    ),
  ).toEqual([0n, 2n]);
  expect(() => getReceiptLogs({ ...receipt, logs: [log, log] }, address)).toThrow("duplicate");
});
test.for([
  { removed: true },
  { blockHash: transactionHash },
  { transactionHash: blockHash },
  { blockNumber: "0x2" },
  { topics: ["0x1234"] },
  { data: "0x1" },
])("malformed or foreign receipt evidence fails: %j", (change) => {
  expect(() => getReceiptLogs({ ...receipt, logs: [{ ...log, ...change }] }, address)).toThrow();
});
