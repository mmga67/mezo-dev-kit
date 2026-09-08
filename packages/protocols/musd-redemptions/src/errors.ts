export type RedemptionErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "LimitExceeded"
  | "UnavailableRedemption"
  | "SimulationUnavailable"
  | "SimulationFailed"
  | "BoundExceeded"
  | "ReconciliationMismatch";
export class RedemptionError extends Error {
  readonly code: RedemptionErrorCode;
  constructor(code: RedemptionErrorCode, message: string) {
    super(message);
    this.name = "RedemptionError";
    this.code = code;
  }
}
export function redemptionRequire(
  condition: boolean,
  code: RedemptionErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new RedemptionError(code, message);
}
