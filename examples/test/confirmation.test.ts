import { expect, test } from "vitest";
import type { ExecutionObservation } from "@mezo-dev-kit/core";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { submissionFixture } from "./submission-fixture.ts";

test("confirmation polling preserves uncertainty and never retries submission", async () => {
  const record = submissionFixture();
  let reads = 0,
    pauses = 0;
  const execution = {
    observe: (): Promise<ExecutionObservation> => {
      reads++;
      return Promise.resolve({ state: "submission-uncertain", record });
    },
  };
  await expect(
    waitForConfirmation(execution, record, {
      attempts: 3,
      pause: async () => {
        pauses++;
      },
    }),
  ).rejects.toThrow("Recover the reserved");
  expect(reads).toBe(1);
  expect(pauses).toBe(0);
});

test("pending receipts stop at the poll budget and retain the original intent", async () => {
  const record = submissionFixture();
  let reads = 0,
    pauses = 0;
  await expect(
    waitForConfirmation(
      {
        observe: async (input) => {
          expect(input).toBe(record);
          reads++;
          return { state: "submitted", record };
        },
      },
      record,
      {
        attempts: 3,
        pause: async () => {
          pauses++;
        },
      },
    ),
  ).rejects.toThrow("Confirmation pending");
  expect(reads).toBe(3);
  expect(pauses).toBe(2);
});

test.each(["execution-reverted", "reorged"] as const)(
  "%s stops before the next protocol step",
  async (state) => {
    const record = submissionFixture();
    let reads = 0;
    await expect(
      waitForConfirmation(
        {
          observe: async (): Promise<ExecutionObservation> => {
            reads++;
            return state === "reorged"
              ? { state, record }
              : {
                  state,
                  record,
                  receipt: {
                    transactionHash: `0x${"44".repeat(32)}`,
                    blockNumber: 2n,
                    blockHash: `0x${"55".repeat(32)}`,
                    logs: [],
                  },
                };
          },
        },
        record,
        {
          attempts: 3,
          pause: async () => {
            throw new Error("Unexpected pause");
          },
        },
      ),
    ).rejects.toThrow();
    expect(reads).toBe(1);
  },
);
