export type CoreReadErrorCode =
  | "ChainMismatch"
  | "InvalidReadInput"
  | "InvalidTransportResult"
  | "PartialReadFailure"
  | "ProviderFailure";

export type CoreReadErrorContext = Readonly<Record<string, unknown>>;

export interface CoreReadErrorOptions {
  readonly cause?: unknown;
  readonly retryable?: boolean;
  readonly stage?: string;
}

export interface SerializedCoreReadError {
  readonly name: "CoreReadError";
  readonly code: CoreReadErrorCode;
  readonly message: string;
  readonly stage: string;
  readonly retryable: boolean;
  readonly context: CoreReadErrorContext;
}

export class CoreReadError extends Error {
  readonly code: CoreReadErrorCode;
  readonly stage: string;
  readonly retryable: boolean;
  readonly context: CoreReadErrorContext;

  constructor(
    code: CoreReadErrorCode,
    message: string,
    context: CoreReadErrorContext,
    options: CoreReadErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CoreReadError";
    this.code = code;
    this.stage = options.stage ?? "read";
    this.retryable = options.retryable ?? false;
    this.context = Object.freeze({ ...context });
  }

  toJSON(): SerializedCoreReadError {
    return {
      name: "CoreReadError",
      code: this.code,
      message: this.message,
      stage: this.stage,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

export function serializeCoreReadError(error: CoreReadError): SerializedCoreReadError {
  return error.toJSON();
}
