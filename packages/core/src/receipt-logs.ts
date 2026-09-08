import { parseAddress, parseHash32, parseHexData, parseRpcQuantity } from "@mezo-dev-kit/evm";
import type { ExecutionReceipt } from "./execution-types.ts";
import { ExecutionError } from "./execution.ts";
import { rpcObject } from "./rpc.ts";

export interface ExecutionLog {
  readonly address: `0x${string}`;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
  readonly logIndex: bigint;
}
/** Validate receipt ownership before exposing logs to a protocol-specific decoder. */
export function getReceiptLogs(
  receipt: ExecutionReceipt,
  address: `0x${string}`,
): readonly ExecutionLog[] {
  const target = parseAddress(address);
  const seen = new Set<bigint>();
  const result: ExecutionLog[] = [];
  for (const raw of receipt.logs) {
    const log = rpcObject(raw);
    if (parseAddress(log.address) !== target) continue;
    if (
      log.removed !== false ||
      parseHash32(log.transactionHash) !== receipt.transactionHash ||
      parseHash32(log.blockHash) !== receipt.blockHash ||
      parseRpcQuantity(log.blockNumber) !== receipt.blockNumber ||
      !Array.isArray(log.topics)
    )
      throw new ExecutionError("InvalidTransaction", "receipt log identity mismatch");
    const logIndex = parseRpcQuantity(log.logIndex);
    if (seen.has(logIndex))
      throw new ExecutionError("InvalidTransaction", "duplicate receipt log index");
    seen.add(logIndex);
    result.push(
      Object.freeze({
        address: target,
        topics: Object.freeze(log.topics.map((topic: unknown) => parseHash32(topic))),
        data: parseHexData(log.data),
        logIndex,
      }),
    );
  }
  return Object.freeze(
    result.sort((a, b) => (a.logIndex < b.logIndex ? -1 : a.logIndex > b.logIndex ? 1 : 0)),
  );
}
