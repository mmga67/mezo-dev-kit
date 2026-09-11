export type NttObserverErrorCode =
  | "InvalidInput"
  | "UnknownRoute"
  | "ChainMismatch"
  | "TransportFailure"
  | "InvalidEvidence"
  | "RegistryUnavailable";
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
