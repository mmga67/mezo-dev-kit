export type PoolErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "UnavailablePool"
  | "UnsafeState"
  | "BoundExceeded"
  | "ReconciliationMismatch";
export class PoolError extends Error {
  readonly code: PoolErrorCode;
  constructor(code: PoolErrorCode, message: string) {
    super(message);
    this.name = "PoolError";
    this.code = code;
  }
}
export function poolRequire(
  condition: boolean,
  code: PoolErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new PoolError(code, message);
}
