import {
  EvmValueError,
  isHash32,
  isHexData,
  parseHash32,
  parseHexData,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
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
  try {
    const chainId = parseUnsignedInteger(value, field);
    if (chainId > 0n) return chainId;
  } catch (error) {
    if (!(error instanceof EvmValueError)) throw error;
  }
  throw new CoreReadError(
    "InvalidTransportResult",
    `${field} must be a positive bigint or canonical decimal string`,
    { field, receivedType: typeof value },
    { stage: "chain-assertion" },
  );
}

export function validateHexData(value: unknown, field = "data"): HexData {
  if (!isHexData(value)) {
    throw new CoreReadError(
      "InvalidReadInput",
      `${field} must be even-length hexadecimal data`,
      { field, receivedType: typeof value },
      { stage: "validation" },
    );
  }
  return parseHexData(value);
}

export function validateBlockHash(value: unknown): BlockHash {
  if (!isHash32(value)) {
    throw new CoreReadError(
      "InvalidTransportResult",
      "block hash must be a 32-byte hexadecimal value",
      { field: "block.hash", receivedType: typeof value },
      { stage: "coordinate" },
    );
  }
  return parseHash32(value);
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
