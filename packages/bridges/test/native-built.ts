import assert from "node:assert/strict";
import {
  createNativeDeliveryObserver,
  createNativeTransferReader,
  createNativeTransferWriter,
} from "@mezo-dev-kit/bridges";
import { nativeFixture } from "./native-fixture.ts";
import { nativeTransferFixture } from "./native-transfer-fixture.ts";
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
for (const inbound of [true, false]) {
  const f = await nativeTransferFixture(inbound),
    reader = createNativeTransferReader(f.config),
    writer = createNativeTransferWriter({ ...f.config, reader, execution: f.execution });
  const prepared = await writer.prepare({ operationId: "native-built", quote: f.input });
  const record = await writer.submit(prepared, await writer.simulate(prepared));
  f.source.state.mined = true;
  f.source.state.receiptLogs = f.sourceLogs();
  const result = await writer.reconcile(prepared, record);
  assert.equal(result.outcome.state, "source-confirmed");
  assert.equal(result.outcome.tuple.amount, f.input.amount);
  assert.equal(f.sent.length, 1);
  process.stdout.write(
    `${f.config.routeId}: captured runtime/configuration and modeled source lifecycle passed through built entrypoints.\n`,
  );
}
