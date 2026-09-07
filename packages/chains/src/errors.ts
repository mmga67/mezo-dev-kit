export type ChainRegistryErrorCode =
  "InvalidNetworkId" | "MalformedGeneratedNetwork" | "UnsupportedNetworkState";

export type ChainRegistryErrorContext = Readonly<Record<string, unknown>>;

export class ChainRegistryError extends Error {
  readonly code: ChainRegistryErrorCode;
  readonly context: ChainRegistryErrorContext;

  constructor(
    code: ChainRegistryErrorCode,
    message: string,
    context: ChainRegistryErrorContext,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = "ChainRegistryError";
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}
