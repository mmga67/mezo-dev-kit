import {
  EvmValueError,
  isAddress,
  isHash32,
  isHexData,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUnitsExact,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
import { CoreError, createCoreError } from "./errors.ts";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type TransactionHash = `0x${string}`;

export interface Call {
  readonly to: Address;
  readonly from?: Address;
  readonly data: Hex;
  readonly value: bigint;
}

export interface CallInput {
  readonly to: string;
  readonly from?: string;
  readonly data: string;
  readonly value?: bigint | string;
}

export interface UnitOptions {
  readonly decimals: number;
  readonly assetId: string;
  readonly field?: string;
}

export interface BaseUnits {
  readonly assetId: string;
  readonly decimals: number;
  readonly amount: bigint;
}

export interface CallDescription {
  readonly to: Address;
  readonly from: Address | null;
  readonly value: string;
  readonly selector: string;
  readonly calldataBytes: number;
}

export function normalizeAddress(value: unknown, field = "address"): Address {
  if (!isAddress(value)) {
    throw createCoreError(
      "InvalidUnits",
      { field, input: printable(value), expectedDecimals: null },
      { message: `${field} must be a 20-byte EVM address` },
    );
  }
  return parseAddress(value);
}

export function normalizeCall(call: unknown): Readonly<Call> {
  if (!isRecord(call)) throw new TypeError("call must be an object");
  const to = normalizeAddress(call.to, "call.to");
  const from = call.from === undefined ? undefined : normalizeAddress(call.from, "call.from");
  if (!isHexData(call.data)) {
    throw new TypeError("call.data must be even-length 0x-prefixed bytes");
  }
  const value = normalizeUnsignedInteger(call.value ?? 0n, "call.value");
  return Object.freeze({
    to,
    ...(from === undefined ? {} : { from }),
    data: parseHexData(call.data),
    value,
  });
}

export function parseDisplayUnits(
  input: unknown,
  { decimals, assetId, field = "amount" }: UnitOptions,
): Readonly<BaseUnits> {
  assertDecimals(decimals);
  if (typeof assetId !== "string" || assetId.length === 0)
    throw new TypeError("assetId is required");
  if (typeof input !== "string") {
    throw createCoreError(
      "InvalidUnits",
      { field, input: printable(input), expectedDecimals: decimals },
      { message: `${field} must be a decimal string; JavaScript numbers are not accepted` },
    );
  }
  let amount: bigint;
  try {
    amount = parseUnitsExact(input, decimals, field);
  } catch (error) {
    if (!(error instanceof EvmValueError)) throw error;
    throw createCoreError(
      "InvalidUnits",
      { field, input, expectedDecimals: decimals },
      { message: `${field} has invalid decimal precision` },
    );
  }
  return Object.freeze({ assetId, decimals, amount });
}

export function assertBaseUnits(
  input: unknown,
  { decimals, assetId, field = "amount" }: UnitOptions,
): Readonly<BaseUnits> {
  assertDecimals(decimals);
  if (typeof assetId !== "string" || assetId.length === 0)
    throw new TypeError("assetId is required");
  try {
    return Object.freeze({
      assetId,
      decimals,
      amount: normalizeUnsignedInteger(input, field),
    });
  } catch (error) {
    if (error instanceof CoreError && error.code === "InvalidUnits") throw error;
    throw createCoreError(
      "InvalidUnits",
      { field, input: printable(input), expectedDecimals: decimals },
      { message: `${field} must be a non-negative bigint or integer string`, cause: error },
    );
  }
}

export function normalizeChainId(value: unknown, field = "chainId"): bigint {
  try {
    const normalized = normalizeUnsignedInteger(value, field);
    if (normalized === 0n) throw new TypeError(`${field} must be positive`);
    return normalized;
  } catch (error) {
    throw new TypeError(`${field} must be a positive integer`, { cause: error });
  }
}

export function normalizeBlockNumber(value: unknown, field = "blockNumber"): bigint {
  return normalizeUnsignedInteger(value, field);
}

export function normalizeTransactionHash(
  value: unknown,
  field = "transactionHash",
): TransactionHash {
  if (!isHash32(value)) {
    throw new TypeError(`${field} must be a 32-byte hash`);
  }
  return parseHash32(value);
}

export function describeCall(call: unknown): Readonly<CallDescription> {
  const normalized = normalizeCall(call);
  return Object.freeze({
    to: normalized.to,
    from: normalized.from ?? null,
    value: normalized.value.toString(),
    selector: normalized.data.length >= 10 ? normalized.data.slice(0, 10) : normalized.data,
    calldataBytes: (normalized.data.length - 2) / 2,
  });
}

export function callsEqual(left: unknown, right: unknown): boolean {
  const a = normalizeCall(left);
  const b = normalizeCall(right);
  return a.to === b.to && a.from === b.from && a.data === b.data && a.value === b.value;
}

function normalizeUnsignedInteger(value: unknown, field: string): bigint {
  if (typeof value === "number") {
    throw createCoreError(
      "InvalidUnits",
      { field, input: printable(value), expectedDecimals: 0 },
      { message: `${field} cannot be a JavaScript number` },
    );
  }
  try {
    return parseUnsignedInteger(value, field);
  } catch (error) {
    if (!(error instanceof EvmValueError)) throw error;
    throw createCoreError(
      "InvalidUnits",
      { field, input: printable(value), expectedDecimals: 0 },
      {
        message:
          typeof value === "bigint" && value < 0n
            ? `${field} must not be negative`
            : `${field} must be a non-negative bigint or integer string`,
      },
    );
  }
}

function assertDecimals(decimals: number): void {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new TypeError("decimals must be an integer from 0 through 255");
  }
}

function printable(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
