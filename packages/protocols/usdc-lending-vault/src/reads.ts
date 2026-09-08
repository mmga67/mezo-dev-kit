import { createHash } from "node:crypto";
import type { ContractAbiEntry, ContractAddress } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import { isAddress, isHexData, parseAddress } from "@mezo-dev-kit/evm";
import type { LendingAbiValue } from "@mezo-dev-kit/musdc-lending";
import { VaultReadError } from "./errors.ts";
import { VAULT_MODEL } from "./model.generated.ts";
import type { VaultReaderConfig, VaultReadValue } from "./types.ts";
export function address(value: unknown, field: string): ContractAddress {
  if (!isAddress(value) || value === `0x${"0".repeat(40)}`)
    throw new VaultReadError("InvalidValue", field);
  return parseAddress(value);
}
export function same(actual: unknown, expected: ContractAddress, field: string): void {
  if (address(actual, field) !== expected.toLowerCase())
    throw new VaultReadError("TopologyMismatch", field);
}
export function tuple(value: unknown, length: number, field: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length)
    throw new VaultReadError("InvalidValue", field);
  return value as readonly unknown[];
}
export function available<T>(value: T): VaultReadValue<T> {
  return Object.freeze({ status: "available", value: Object.freeze(value) });
}
export function unavailable<T>(error: unknown, field: string): VaultReadValue<T> {
  if (
    error instanceof VaultReadError &&
    ["TopologyMismatch", "InconsistentCoordinate"].includes(error.code)
  )
    throw error;
  const failure =
    error instanceof VaultReadError
      ? error
      : new VaultReadError("ReadUnavailable", field, { cause: error });
  return Object.freeze({ status: "unavailable", error: failure.toJSON() });
}
export async function optional<T>(
  field: string,
  read: () => Promise<T>,
): Promise<VaultReadValue<T>> {
  try {
    return available(await read());
  } catch (error) {
    return unavailable(error, field);
  }
}
export function attempt<T>(field: string, read: () => T): VaultReadValue<T> {
  try {
    return available(read());
  } catch (error) {
    return unavailable(error, field);
  }
}
export async function readValue(
  config: VaultReaderConfig,
  coordinate: ReadCoordinate,
  target: ContractAddress,
  abi: readonly ContractAbiEntry[],
  functionName: string,
  args: readonly LendingAbiValue[] = [],
): Promise<unknown> {
  const entries = abi.filter(
    (x) =>
      x.type === "function" &&
      x.name === functionName &&
      (x.stateMutability === "view" || x.stateMutability === "pure"),
  );
  if (entries.length !== 1) throw new VaultReadError("UnsupportedRuntime", functionName);
  const call = { abi: entries, functionName, args };
  const data = config.codec.encodeRead(call);
  if (!isHexData(data) || data.length < 10)
    throw new VaultReadError("InvalidValue", "codec.encodeRead");
  const raw = await config.transport.read({ ...coordinate, address: target, data });
  try {
    return config.codec.decodeRead({ ...call, data: raw });
  } catch (cause) {
    throw new VaultReadError("InvalidValue", functionName, { cause });
  }
}
export async function verifyRole(
  config: VaultReaderConfig,
  coordinate: ReadCoordinate,
  target: ContractAddress,
  role: keyof typeof VAULT_MODEL.profiles,
): Promise<void> {
  const raw = await config.transport.getCode({ ...coordinate, address: target });
  if (!isHexData(raw) || raw.length === 2) throw new VaultReadError("InvalidValue", "runtimeCode");
  if (
    createHash("sha256")
      .update(Buffer.from(raw.slice(2), "hex"))
      .digest("hex") !== VAULT_MODEL.profiles[role].runtimeSha256
  )
    throw new VaultReadError("UnsupportedRuntime", role);
}
