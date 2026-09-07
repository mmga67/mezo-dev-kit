export type SavingsReadErrorCode =
  | "InvalidInput"
  | "InvalidReadValue"
  | "UnsupportedNetwork"
  | "UnsupportedRole"
  | "TopologyMismatch"
  | "InconsistentCoordinate"
  | "ReadUnavailable"
  | "ArithmeticOverflow"
  | "InvalidIndex"
  | "AmountTooSmall";

export class SavingsReadError extends Error {
  readonly code: SavingsReadErrorCode;
  readonly field: string;
  constructor(code: SavingsReadErrorCode, field: string, options?: ErrorOptions) {
    super(`Savings ${code}: ${field}`, options);
    this.name = "SavingsReadError";
    this.code = code;
    this.field = field;
  }
  toJSON(): Readonly<{ code: SavingsReadErrorCode; field: string }> {
    return Object.freeze({ code: this.code, field: this.field });
  }
}
