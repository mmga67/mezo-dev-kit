export type SyntheticReaderErrorCode =
  "InconsistentBlock" | "InvalidInput" | "InvalidResponse" | "PartialRead" | "ProviderFailure";

export type SyntheticReaderErrorContext = Readonly<Record<string, unknown>>;

export class SyntheticReaderError extends Error {
  readonly code: SyntheticReaderErrorCode;
  readonly context: SyntheticReaderErrorContext;

  constructor(
    code: SyntheticReaderErrorCode,
    message: string,
    context: SyntheticReaderErrorContext,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = "SyntheticReaderError";
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}
