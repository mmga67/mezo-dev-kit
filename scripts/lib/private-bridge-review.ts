import assert from "node:assert/strict";
import { object, text, type JsonObject } from "./json.ts";

/** Accept a recorded private review without promoting its proposed support. */
export async function validatePrivateBridgeReview(
  record: JsonObject,
  load: (reference: unknown) => Promise<unknown>,
): Promise<void> {
  assert.equal(record.supportStatus, "proposed");
  if (record.reviewStatus === "pending-qualified-review") return;
  assert.equal(record.reviewStatus, "accepted", "Private bridge review is not accepted or pending");
  const review = object(record.review, "private bridge review disposition");
  const date = text(review.acceptedOn, "private bridge acceptance date");
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)),
    "Invalid acceptance date",
  );
  assert(text(review.disposition, "private bridge disposition").length > 0);
  const reference = object(review.continuityReference, "private bridge review evidence reference");
  assert.equal(reference.moduleId, "workflows/bridges");
  const evidence = object(await load(reference), "private bridge review evidence");
  assert.equal(evidence.kind, "bridge-private-scope-reverification");
  assert.equal(evidence.reviewStatus, "accepted");
  assert.equal(evidence.supportStatus, "none");
}
