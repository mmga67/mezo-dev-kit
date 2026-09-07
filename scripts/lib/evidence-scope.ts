/** Explicit network scope for oracle maintenance and reader acceptance. */
export type EvidenceNetwork = "mezo-mainnet" | "mezo-testnet";

export function parseEvidenceArguments(
  args: readonly string[],
  positionalCount = 0,
): { network: EvidenceNetwork | undefined; paths: string[] } {
  let network: EvidenceNetwork | undefined;
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--network") {
      const value = args[++index];
      if (network !== undefined || (value !== "mezo-mainnet" && value !== "mezo-testnet")) {
        throw new Error("--network requires exactly one of mezo-mainnet or mezo-testnet");
      }
      network = value;
    } else if (argument !== undefined && !argument.startsWith("-")) {
      paths.push(argument);
    } else {
      throw new Error(`Unknown evidence argument: ${argument}`);
    }
  }
  if (paths.length !== positionalCount) {
    throw new Error(`Expected ${positionalCount} path arguments; received ${paths.length}`);
  }
  return { network, paths };
}

export interface DeploymentEvidenceScope {
  networkId: string;
  evidenceReference: { resourceId: string };
}

/** Full checks retain every current envelope; scoped checks follow current deployment references. */
export function requiresEvidenceFreshness(
  evidenceId: string,
  network: EvidenceNetwork | undefined,
  deployments: readonly DeploymentEvidenceScope[],
): boolean {
  return (
    network === undefined ||
    deployments.some(
      (deployment) =>
        deployment.networkId === network && deployment.evidenceReference.resourceId === evidenceId,
    )
  );
}
