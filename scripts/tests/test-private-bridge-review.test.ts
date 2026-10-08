import { expect, test } from "vitest";
import { validatePrivateBridgeReview } from "../lib/private-bridge-review.ts";

const accepted = () => ({
  supportStatus: "proposed",
  reviewStatus: "accepted",
  review: {
    acceptedOn: "2026-10-07",
    disposition: "Accepted existing bounded private evidence as-is.",
    continuityReference: { moduleId: "workflows/bridges", resourceId: "synthetic-review" },
  },
});
const receipt = () => ({
  kind: "bridge-private-scope-reverification",
  reviewStatus: "accepted",
  supportStatus: "none",
});

test("recorded private acceptance is usable without promoting support", async () => {
  const record = accepted();
  await validatePrivateBridgeReview(record, async () => receipt());
  expect(record.supportStatus).toBe("proposed");
});

test("unreviewed private evidence retains its pending state without a fabricated receipt", async () => {
  let reads = 0;
  await validatePrivateBridgeReview(
    { supportStatus: "proposed", reviewStatus: "pending-qualified-review" },
    async () => {
      reads++;
      return receipt();
    },
  );
  expect(reads).toBe(0);
});

test("accepted status alone cannot replace a recorded decision", async () => {
  await expect(
    validatePrivateBridgeReview({ supportStatus: "proposed", reviewStatus: "accepted" }, async () =>
      receipt(),
    ),
  ).rejects.toThrow("disposition");
});

test("a private acceptance cannot promote support", async () => {
  await expect(
    validatePrivateBridgeReview({ ...accepted(), supportStatus: "supported" }, async () =>
      receipt(),
    ),
  ).rejects.toThrow();
});

test("a pending or unrelated receipt cannot authorize accepted review", async () => {
  await expect(
    validatePrivateBridgeReview(accepted(), async () => ({
      ...receipt(),
      reviewStatus: "pending-qualified-review",
    })),
  ).rejects.toThrow();
  await expect(
    validatePrivateBridgeReview(accepted(), async () => ({ ...receipt(), kind: "unrelated" })),
  ).rejects.toThrow();
});
