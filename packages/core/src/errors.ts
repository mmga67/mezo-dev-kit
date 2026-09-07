import { GENERATED_ERROR_DEFINITIONS } from "./model.generated.ts";

export type CoreErrorCode = keyof typeof GENERATED_ERROR_DEFINITIONS;

export type CoreErrorContext = Readonly<Record<string, unknown>>;

export interface CoreErrorOptions {
  readonly cause?: unknown;
  readonly message?: string;
  readonly retry?: string;
  readonly stage?: string;
}

export interface SerializedError {
  readonly name: string;
  readonly code: string;
  readonly message: string;
  readonly stage?: string;
  readonly retry?: string;
  readonly context?: CoreErrorContext;
}

const ERROR_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(GENERATED_ERROR_DEFINITIONS).map(([id, value]) => [
      id,
      Object.freeze({
        ...value,
        requiredContext: Object.freeze([...value.requiredContext]),
      }),
    ]),
  ),
);

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly stage: string;
  readonly retry: string;
  readonly context: CoreErrorContext;
  lifecycle?: unknown;

  constructor(
    code: CoreErrorCode,
    message: string,
    context: CoreErrorContext,
    options: CoreErrorOptions = {},
  ) {
    const metadata = ERROR_DEFINITIONS[code];
    if (!metadata) throw new TypeError(`unknown core error code '${code}'`);
    assertRequiredContext(code, context, metadata.requiredContext);
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = code;
    this.code = code;
    this.stage = options.stage ?? metadata.stage;
    this.retry = options.retry ?? metadata.retry;
    this.context = Object.freeze({ ...context });
  }

  toJSON(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      stage: this.stage,
      retry: this.retry,
      context: this.context,
    };
  }
}

export function createCoreError(
  code: CoreErrorCode,
  context: CoreErrorContext,
  options: CoreErrorOptions = {},
): CoreError {
  return new CoreError(code, options.message ?? humanizeCode(code), context, options);
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof CoreError) return error.toJSON();
  return {
    name: error instanceof Error ? error.name : "Error",
    code: "ProviderError",
    message: error instanceof Error ? error.message : "Unknown provider error",
  };
}

export function getErrorDefinitions(): typeof ERROR_DEFINITIONS {
  return ERROR_DEFINITIONS;
}

function assertRequiredContext(
  code: CoreErrorCode,
  context: CoreErrorContext,
  requiredKeys: readonly string[],
): void {
  if (!context || typeof context !== "object") {
    throw new TypeError(`${code} requires structured context`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(context, key)) throw new TypeError(`${code} context is missing '${key}'`);
  }
}

function humanizeCode(code: string): string {
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}
