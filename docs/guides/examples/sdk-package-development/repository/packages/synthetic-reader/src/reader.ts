import { SyntheticReaderError } from "./errors.ts";
import { SYNTHETIC_MODEL } from "./model.generated.ts";
import { validateBlockNumber, validateResponse } from "./validation.ts";
import type { BlockHash } from "./validation.ts";

export interface SyntheticReadPort {
  readonly readSnapshot: (input: {
    readonly kind: typeof SYNTHETIC_MODEL.kind;
    readonly blockNumber: bigint;
  }) => Promise<unknown>;
}

export type OptionalSyntheticValue =
  | Readonly<{ status: "available"; valueBaseUnits: bigint }>
  | Readonly<{ status: "unavailable"; reason: "not-returned" }>;

export interface SyntheticSnapshot {
  readonly coordinate: Readonly<{
    blockNumber: bigint;
    blockHash: BlockHash;
  }>;
  readonly consistency: "block";
  readonly assetId: typeof SYNTHETIC_MODEL.assetId;
  readonly decimals: typeof SYNTHETIC_MODEL.decimals;
  readonly requiredValueBaseUnits: bigint;
  readonly optionalValue: OptionalSyntheticValue;
}

export async function readSyntheticSnapshot(input: {
  readonly port: SyntheticReadPort;
  readonly blockNumber: bigint;
}): Promise<Readonly<SyntheticSnapshot>> {
  const blockNumber = validateBlockNumber(input.blockNumber);
  let untrustedResponse: unknown;
  try {
    untrustedResponse = await input.port.readSnapshot({
      kind: SYNTHETIC_MODEL.kind,
      blockNumber,
    });
  } catch (error) {
    throw new SyntheticReaderError(
      "ProviderFailure",
      "synthetic read provider failed",
      { operation: "readSnapshot", blockNumber: blockNumber.toString() },
      { cause: error },
    );
  }
  const response = validateResponse(untrustedResponse);
  if (response.blockNumber !== blockNumber) {
    throw new SyntheticReaderError(
      "InconsistentBlock",
      "response block differs from the requested block",
      {
        requestedBlockNumber: blockNumber.toString(),
        responseBlockNumber: response.blockNumber.toString(),
      },
    );
  }
  const optionalValue: OptionalSyntheticValue =
    response.optionalValueBaseUnits === null
      ? Object.freeze({ status: "unavailable", reason: "not-returned" })
      : Object.freeze({ status: "available", valueBaseUnits: response.optionalValueBaseUnits });
  return Object.freeze({
    coordinate: Object.freeze({
      blockNumber: response.blockNumber,
      blockHash: response.blockHash,
    }),
    consistency: "block",
    assetId: SYNTHETIC_MODEL.assetId,
    decimals: SYNTHETIC_MODEL.decimals,
    requiredValueBaseUnits: response.requiredValueBaseUnits,
    optionalValue,
  });
}

export function sumAvailableBaseUnits(snapshot: SyntheticSnapshot): bigint {
  return (
    snapshot.requiredValueBaseUnits +
    (snapshot.optionalValue.status === "available" ? snapshot.optionalValue.valueBaseUnits : 0n)
  );
}
