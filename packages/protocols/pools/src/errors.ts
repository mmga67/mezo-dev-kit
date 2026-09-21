export type PoolErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "UnavailablePool"
  | "UnsafeState"
  | "BoundExceeded"
  | "ReconciliationMismatch";
/**
 * Typed pools failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
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
