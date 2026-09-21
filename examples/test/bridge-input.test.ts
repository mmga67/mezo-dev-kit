import { expect, test } from "vitest";
import { parseObservationInput } from "../bridge-musd/evidence-input.ts";

const sourceHash = `0x${"11".repeat(32)}`;
const destinationHash = `0x${"22".repeat(32)}`;
const blockHash = `0x${"33".repeat(32)}`;

test("restarting from an observation preserves hashes and reorg anchors", () => {
  const input = parseObservationInput({
    digest: null,
    source: {
      transactionHash: sourceHash,
      anchor: { transactionHash: sourceHash, blockNumber: "12", blockHash },
    },
    destinations: [{ transactionHash: destinationHash, anchor: null }],
  });
  expect(input.sourceTransactionHash).toBe(sourceHash);
  expect(input.destinationTransactionHashes).toEqual([destinationHash]);
  expect(input.previous?.source).toEqual({
    transactionHash: sourceHash,
    blockNumber: 12n,
    blockHash,
  });
  expect(input.previous?.destinations).toEqual([]);
});

test("receipt candidates are bounded and malformed saved anchors are rejected", () => {
  expect(() =>
    parseObservationInput({
      sourceTransactionHash: sourceHash,
      destinationTransactionHashes: Array.from({ length: 33 }, () => destinationHash),
    }),
  ).toThrow("at most 32");
  expect(() =>
    parseObservationInput({
      source: {
        transactionHash: sourceHash,
        anchor: { transactionHash: sourceHash, blockNumber: "-1", blockHash },
      },
      destinations: [],
    }),
  ).toThrow();
});
