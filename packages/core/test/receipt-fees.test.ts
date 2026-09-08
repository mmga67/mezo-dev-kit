import { expect, test } from "vitest";
import { getReceiptExecutionFee } from "../src/index.ts";
const receipt = {
  transactionHash: `0x${"ab".repeat(32)}`,
  blockHash: `0x${"cd".repeat(32)}`,
  blockNumber: 10n,
  logs: [],
} as const;
const from = `0x${"11".repeat(20)}` as const,
  to = `0x${"22".repeat(20)}` as const;
const raw = {
  transactionHash: receipt.transactionHash,
  blockHash: receipt.blockHash,
  blockNumber: "0xa",
  from,
  to,
  status: "0x1",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x3",
};
test("execution fee uses actual receipt gas and effective price, including zero price", () => {
  expect(getReceiptExecutionFee({ receipt, raw, from, to })).toBe(63000n);
  expect(
    getReceiptExecutionFee({ receipt, raw: { ...raw, effectiveGasPrice: "0x0" }, from, to }),
  ).toBe(0n);
});
test("foreign, failed or incomplete fee evidence rejects", () => {
  for (const change of [
    { transactionHash: receipt.blockHash },
    { blockHash: receipt.transactionHash },
    { blockNumber: "0xb" },
    { from: to },
    { to: from },
    { status: "0x0" },
    { gasUsed: undefined },
    { effectiveGasPrice: undefined },
    { effectiveGasPrice: `0x${"f".repeat(64)}` },
  ])
    expect(() =>
      getReceiptExecutionFee({ receipt, raw: { ...raw, ...change }, from, to }),
    ).toThrow();
});
