export type EvmValueErrorCode =
  | "InvalidAddress"
  | "InvalidChecksum"
  | "InvalidHash"
  | "InvalidHexData"
  | "InvalidRpcQuantity"
  | "InvalidInteger"
  | "InvalidBitWidth"
  | "InvalidDecimals"
  | "InvalidAmount"
  | "ExcessPrecision";

/** Representation failure. Consumers retain responsibility for domain error mapping. */
export class EvmValueError extends Error {
  readonly code: EvmValueErrorCode;
  readonly field: string;

  constructor(code: EvmValueErrorCode, field: string) {
    super(`${field}: ${code}`);
    this.name = "EvmValueError";
    this.code = code;
    this.field = field;
  }
}
