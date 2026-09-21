import type { NttSourceOutcome } from "@mezo-dev-kit/bridges";
import type { Hash32 } from "@mezo-dev-kit/evm";

/** Source result to retain across delivery-observer restarts; it does not prove destination receipt. */
export interface BridgeCheckpoint {
  readonly sourceTransactionHash: Hash32;
  readonly outcome: NttSourceOutcome;
}
