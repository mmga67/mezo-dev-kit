export type NttObserverErrorCode =
  | "InvalidInput"
  | "UnknownRoute"
  | "ChainMismatch"
  | "TransportFailure"
  | "InvalidEvidence"
  | "RegistryUnavailable";
/**
 * Typed bridges failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class NttObserverError extends Error {
  readonly code: NttObserverErrorCode;
  readonly stage: string;
  constructor(code: NttObserverErrorCode, stage: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.stage = stage;
    this.name = "NttObserverError";
  }
}
