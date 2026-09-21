export type LendingReadErrorCode =
  | "InvalidValue"
  | "UnsupportedNetwork"
  | "UnsupportedRuntime"
  | "TopologyMismatch"
  | "ReadUnavailable"
  | "InconsistentCoordinate"
  | "PriceStale"
  | "PriceFuture"
  | "PriceMissingTime"
  | "PriceDisagreement";
/**
 * Typed musdc-lending failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class LendingReadError extends Error {
  readonly code: LendingReadErrorCode;
  readonly field: string;
  constructor(code: LendingReadErrorCode, field: string, options?: ErrorOptions) {
    super(`${code}: ${field}`, options);
    this.name = "LendingReadError";
    this.code = code;
    this.field = field;
  }
  toJSON(): Readonly<{ code: LendingReadErrorCode; field: string }> {
    return Object.freeze({ code: this.code, field: this.field });
  }
}
