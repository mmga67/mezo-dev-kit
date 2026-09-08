export type BorrowingErrorCode =
  | "InvalidInput"
  | "InvalidState"
  | "UnsupportedDeployment"
  | "IneligibleOperation"
  | "BoundsExceeded"
  | "StaleState"
  | "ReconciliationMismatch";

export class BorrowingError extends Error {
  readonly code: BorrowingErrorCode;
  constructor(code: BorrowingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BorrowingError";
    this.code = code;
  }
}
