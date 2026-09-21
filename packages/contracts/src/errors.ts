export type ContractRegistryErrorCode =
  | "AbiUnavailable"
  | "HistoricalGenerationUnsupported"
  | "HistoricalEvidenceUnavailable"
  | "InvalidContractInput"
  | "MalformedGeneratedContract"
  | "MissingDeployment"
  | "OverlappingDeployments"
  | "UnknownContractId"
  | "UnsupportedDeploymentState";

export type ContractRegistryErrorContext = Readonly<Record<string, unknown>>;

/**
 * Typed contracts failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class ContractRegistryError extends Error {
  readonly code: ContractRegistryErrorCode;
  readonly context: ContractRegistryErrorContext;

  constructor(
    code: ContractRegistryErrorCode,
    message: string,
    context: ContractRegistryErrorContext,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.name = "ContractRegistryError";
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}
