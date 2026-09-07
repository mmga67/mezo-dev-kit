import { SyntheticReaderError } from "./errors.ts";
import { SYNTHETIC_MODEL } from "./model.generated.ts";

export type BlockHash = `0x${string}`;

export interface ValidatedResponse {
  readonly blockNumber: bigint;
  readonly blockHash: BlockHash;
  readonly requiredValueBaseUnits: bigint;
  readonly optionalValueBaseUnits: bigint | null;
}

const blockHashPattern = /^0x[a-fA-F0-9]{64}$/;
const unsignedIntegerPattern = /^(0|[1-9][0-9]*)$/;

export function validateBlockNumber(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new SyntheticReaderError("InvalidInput", "blockNumber must be a non-negative bigint", {
      field: "blockNumber",
      receivedType: typeof value,
    });
  }
  return value;
}

export function validateResponse(value: unknown): Readonly<ValidatedResponse> {
  const response = record(value, "reader response");
  if (response.kind !== SYNTHETIC_MODEL.kind) {
    throw invalidResponse("kind does not match the generated model", "kind");
  }
  if (!Object.hasOwn(response, "requiredValueBaseUnits")) {
    throw new SyntheticReaderError("PartialRead", "required read item is unavailable", {
      failedItems: ["requiredValueBaseUnits"],
      requiredItems: ["requiredValueBaseUnits"],
    });
  }
  const blockNumber = unsignedInteger(response.blockNumber, "blockNumber");
  const blockHash = hash(response.blockHash, "blockHash");
  const requiredValueBaseUnits = unsignedInteger(
    response.requiredValueBaseUnits,
    "requiredValueBaseUnits",
  );
  const optionalValueBaseUnits =
    response.optionalValueBaseUnits === null || response.optionalValueBaseUnits === undefined
      ? null
      : unsignedInteger(response.optionalValueBaseUnits, "optionalValueBaseUnits");
  return Object.freeze({
    blockNumber,
    blockHash,
    requiredValueBaseUnits,
    optionalValueBaseUnits,
  });
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(`${label} must be an object`, label);
  }
  return value as Record<string, unknown>;
}

function unsignedInteger(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !unsignedIntegerPattern.test(value)) {
    throw invalidResponse(`${field} must be a non-negative decimal string`, field);
  }
  return BigInt(value);
}

function hash(value: unknown, field: string): BlockHash {
  if (typeof value !== "string" || !blockHashPattern.test(value)) {
    throw invalidResponse(`${field} must be a 32-byte hash`, field);
  }
  return value.toLowerCase() as BlockHash;
}

function invalidResponse(message: string, field: string): SyntheticReaderError {
  return new SyntheticReaderError("InvalidResponse", message, { field });
}
