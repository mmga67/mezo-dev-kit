import assert from "node:assert/strict";
import { createNativeDeliveryObserver } from "@mezo-dev-kit/bridges";
import { nativeFixture } from "./native-fixture.ts";
for (const inbound of [true, false]) {
  const f = await nativeFixture(inbound),
    r = await createNativeDeliveryObserver(f.config).observe(f.input);
  assert.equal(r.state, "completed");
  assert.deepEqual(r.completionTransactions, f.input.destinationTransactionHashes);
  const delivered = r.destinations[0]?.settlement;
  assert(delivered);
  assert.equal(delivered.net + delivered.fee, delivered.gross);
  process.stdout.write(
    `${r.routeId}: historical tuple and recipient settlement passed through built entrypoints.\n`,
  );
}
