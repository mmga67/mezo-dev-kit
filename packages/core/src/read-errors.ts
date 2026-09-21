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

/**
 * Typed core failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
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

  /**
   * Serialize owned fields without exposing the raw cause or stack.
   */
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

/**
 * Serialize an owned read failure without including its raw cause or stack.
 *
 * @returns Stable code, stage, retryability, message and caller-provided context.
 */
export function serializeCoreReadError(error: CoreReadError): SerializedCoreReadError {
  return error.toJSON();
}
