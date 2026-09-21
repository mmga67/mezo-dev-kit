export type BorrowingErrorCode =
  | "InvalidInput"
  | "InvalidState"
  | "UnsupportedDeployment"
  | "IneligibleOperation"
  | "BoundsExceeded"
  | "StaleState"
  | "ReconciliationMismatch";

/**
 * Typed musd-borrowing failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class BorrowingError extends Error {
  readonly code: BorrowingErrorCode;
  constructor(code: BorrowingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BorrowingError";
    this.code = code;
  }
}
