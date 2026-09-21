import { createRpcTransport } from "@mezo-dev-kit/core";
import {
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
} from "@mezo-dev-kit/evm";
import { createFileSubmissionStore } from "./submission-store.ts";
import { createHttpRequest } from "./rpc-request.ts";
import { invariant, object } from "./validation.ts";
import type { Report } from "./output.ts";

/** Inspect durable intents after a restart. Receipt inspection does not replace domain settlement. */
export async function inspectSavedSubmissions(options: {
  readonly url: string;
  readonly directory: string;
  readonly report: Report;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const request = createHttpRequest({
    url: options.url,
    policy: "read-only",
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const transport = createRpcTransport({ id: "example-resume", request });
  const store = await createFileSubmissionStore(options.directory);
  const records = await store.list();
  invariant(records.length > 0, "No saved submissions in this run");
  const chainId = parseUint(await transport.getChainId());
  for (const record of records) {
    invariant(chainId === BigInt(record.call.chainId), "Resume endpoint belongs to another chain");
    if (record.hash === null) {
      options.report("Submission uncertain", {
        operationId: record.operationId,
        from: record.call.from,
        nonce: record.call.nonce,
        next: "Locate the wallet transaction for this nonce and inspect its exact call. Do not replay.",
      });
      continue;
    }
    const rawReceipt = await transport.getReceipt(record.hash);
    if (rawReceipt === null) {
      options.report("Receipt missing", { operationId: record.operationId, hash: record.hash });
      continue;
    }
    const receipt = object(rawReceipt);
    const number = parseRpcQuantity(receipt.blockNumber);
    const block = await transport.getBlock(number);
    if (!block || parseHash32(block.hash) !== parseHash32(receipt.blockHash)) {
      options.report("Receipt reorged", { operationId: record.operationId, hash: record.hash });
      continue;
    }
    const transaction = object(await transport.getTransaction(record.hash));
    invariant(
      parseRpcQuantity(transaction.blockNumber) === number &&
        parseHash32(transaction.blockHash) === parseHash32(receipt.blockHash),
      "Transaction and receipt anchors disagree",
    );
    invariant(
      parseHash32(transaction.hash) === record.hash &&
        parseHash32(receipt.transactionHash) === record.hash,
      "RPC returned evidence for another transaction",
    );
    invariant(
      parseAddress(transaction.from) === record.call.from &&
        parseAddress(transaction.to) === record.call.to &&
        parseRpcQuantity(transaction.nonce) === BigInt(record.call.nonce) &&
        parseRpcQuantity(transaction.value) === BigInt(record.call.value) &&
        parseHexData(transaction.input) === record.call.data,
      "Saved hash belongs to a different call",
    );
    const head = parseUint(await transport.getBlockNumber());
    invariant(head >= number, "Receipt lies beyond the current head");
    const status = parseRpcQuantity(receipt.status);
    invariant(status === 0n || status === 1n, "Invalid receipt status");
    options.report("Canonical saved transaction", {
      operationId: record.operationId,
      hash: record.hash,
      status: status === 1n ? "succeeded" : "reverted",
      confirmations: head - number + 1n,
      next: "Inspect protocol state using the owning reader before any subsequent action",
    });
  }
}
