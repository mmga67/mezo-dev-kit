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
