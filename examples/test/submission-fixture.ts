import { getNetwork } from "@mezo-dev-kit/chains";
import { parseSubmissionRecord } from "@mezo-dev-kit/core";
import type { SubmissionRecord } from "@mezo-dev-kit/core";

/** Synthetic call identity for runtime tests; no deployed contract is implied. */
export function submissionFixture(operationId = "reserved", nonce = "0"): SubmissionRecord {
  return parseSubmissionRecord({
    schemaVersion: 1,
    operationId,
    networkId: "mezo-mainnet",
    contractId: "musd.token",
    blockNumber: "1",
    blockHash: `0x${"11".repeat(32)}`,
    hash: null,
    inclusion: null,
    call: {
      chainId: getNetwork("mezo-mainnet").evmChainId.toString(),
      from: `0x${"22".repeat(20)}`,
      to: `0x${"33".repeat(20)}`,
      value: "0",
      data: "0x",
      nonce,
    },
  });
}
