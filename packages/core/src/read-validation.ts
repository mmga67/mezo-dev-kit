import { CoreReadError } from "./read-errors.ts";

export type HexData = `0x${string}`;
export type BlockHash = `0x${string}`;

export function validateBlockNumber(
  value: unknown,
  field = "blockNumber",
  source: "input" | "transport" = "input",
): bigint {
  if (typeof value !== "bigint" || value < 0n) {
    throw new CoreReadError(
      source === "input" ? "InvalidReadInput" : "InvalidTransportResult",
      `${field} must be a non-negative bigint`,
      { field, receivedType: typeof value },
      { stage: source === "input" ? "validation" : "coordinate" },
    );
  }
  return value;
}

export function validateChainId(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value > 0n) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return BigInt(value);
  throw new CoreReadError(
    "InvalidTransportResult",
    `${field} must be a positive bigint or canonical decimal string`,
    { field, receivedType: typeof value },
    { stage: "chain-assertion" },
  );
}

export function validateHexData(value: unknown, field = "data"): HexData {
  if (typeof value !== "string" || !/^0x(?:[a-fA-F0-9]{2})*$/.test(value)) {
    throw new CoreReadError(
      "InvalidReadInput",
      `${field} must be even-length hexadecimal data`,
      { field, receivedType: typeof value },
      { stage: "validation" },
    );
  }
  return value.toLowerCase() as HexData;
}

export function validateBlockHash(value: unknown): BlockHash {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new CoreReadError(
      "InvalidTransportResult",
      "block hash must be a 32-byte hexadecimal value",
      { field: "block.hash", receivedType: typeof value },
      { stage: "coordinate" },
    );
  }
  return value.toLowerCase() as BlockHash;
}

export function validateIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new CoreReadError(
      "InvalidReadInput",
      `${field} must be a non-empty, trimmed string`,
      { field, receivedType: typeof value },
      { stage: "validation" },
    );
  }
  return value;
}
