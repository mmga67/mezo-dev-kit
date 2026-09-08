import { parseAddress, parseHash32, parseRpcQuantity, parseUint } from "@mezo-dev-kit/evm";
import type { ExecutionReceipt } from "./execution-types.ts";
import { ExecutionError } from "./execution.ts";
import { rpcObject } from "./rpc.ts";
/** EVM execution gas only. Does not include chain-specific L1/blob or other fees. */
export function getReceiptExecutionFee(input: {
  readonly receipt: ExecutionReceipt;
  readonly raw: unknown;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
}): bigint {
  const raw = rpcObject(input.raw),
    { receipt } = input;
  if (
    parseHash32(raw.transactionHash) !== receipt.transactionHash ||
    parseHash32(raw.blockHash) !== receipt.blockHash ||
    parseRpcQuantity(raw.blockNumber) !== receipt.blockNumber ||
    parseAddress(raw.from) !== parseAddress(input.from) ||
    parseAddress(raw.to) !== parseAddress(input.to) ||
    parseRpcQuantity(raw.status) !== 1n
  )
    throw new ExecutionError("InvalidTransaction", "receipt fee identity differs");
  return parseUint(parseRpcQuantity(raw.gasUsed) * parseRpcQuantity(raw.effectiveGasPrice));
}
