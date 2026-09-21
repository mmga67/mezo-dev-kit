export type CliErrorCode =
  "InvalidInput" | "Incompatible" | "Conflict" | "Unavailable" | "Integrity" | "RecoveryRequired";

export class CliError extends Error {
  readonly code: CliErrorCode;
  constructor(code: CliErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliError";
    this.code = code;
  }
}

export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
