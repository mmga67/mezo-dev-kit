export type VaultReadErrorCode =
  | "InvalidValue"
  | "UnsupportedNetwork"
  | "UnsupportedRuntime"
  | "TopologyMismatch"
  | "ReadUnavailable"
  | "InconsistentCoordinate";
export class VaultReadError extends Error {
  readonly code: VaultReadErrorCode;
  readonly field: string;
  constructor(code: VaultReadErrorCode, field: string, options?: ErrorOptions) {
    super(`Vault ${code}: ${field}`, options);
    this.name = "VaultReadError";
    this.code = code;
    this.field = field;
  }
  toJSON(): Readonly<{ code: VaultReadErrorCode; field: string }> {
    return Object.freeze({ code: this.code, field: this.field });
  }
}
