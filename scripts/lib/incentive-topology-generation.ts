interface Coordinate {
  readonly blockNumber: number;
}

interface TopologyDeployment {
  readonly validity: {
    readonly currentCodeFrom: Coordinate;
    readonly effectiveUntilExclusive: Coordinate | null;
  };
  readonly proxy: {
    readonly currentImplementationAddress: string;
    readonly implementationHistory: readonly {
      readonly implementationAddress: string;
      readonly effectiveFrom: Coordinate;
      readonly effectiveUntilExclusive: Coordinate | null;
    }[];
  } | null;
}

/** Bind a block-final snapshot to the same implementation as the accepted ABI.
 * A restored implementation can also cover an earlier recorded interval. This
 * does not qualify a different historical ABI or an intermediate transaction state.
 */
export function topologyGenerationMatches(
  deployment: TopologyDeployment,
  blockNumber: number,
  observedImplementation: string | null,
): boolean {
  if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) return false;
  if (deployment.validity.effectiveUntilExclusive !== null) return false;
  if (deployment.proxy === null) {
    return (
      observedImplementation === null &&
      deployment.validity.currentCodeFrom.blockNumber <= blockNumber
    );
  }
  if (observedImplementation !== deployment.proxy.currentImplementationAddress) return false;
  return recordedGenerationMatches(deployment, blockNumber, observedImplementation);
}

/** Block-final generation coverage only. ABI qualification is a separate requirement. */
export function recordedGenerationMatches(
  deployment: TopologyDeployment,
  blockNumber: number,
  observedImplementation: string | null,
): boolean {
  if (
    !Number.isSafeInteger(blockNumber) ||
    blockNumber < 0 ||
    deployment.validity.effectiveUntilExclusive !== null ||
    deployment.proxy === null ||
    observedImplementation === null
  )
    return false;
  const covering = deployment.proxy.implementationHistory.filter(
    (generation) =>
      generation.effectiveFrom.blockNumber <= blockNumber &&
      (generation.effectiveUntilExclusive === null ||
        generation.effectiveUntilExclusive.blockNumber > blockNumber),
  );
  return covering.length === 1 && covering[0]?.implementationAddress === observedImplementation;
}
