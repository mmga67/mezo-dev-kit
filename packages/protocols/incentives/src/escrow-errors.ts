export type IncentiveErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "LimitExceeded"
  | "UnavailableState"
  | "IneligibleOperation"
  | "ApprovalRequired"
  | "BoundExceeded"
  | "ReconciliationMismatch";
export class IncentiveError extends Error {
  readonly code: IncentiveErrorCode;
  constructor(code: IncentiveErrorCode, message: string) {
    super(message);
    this.name = "IncentiveError";
    this.code = code;
  }
}
export function incentiveRequire(
  condition: unknown,
  code: IncentiveErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new IncentiveError(code, message);
}
