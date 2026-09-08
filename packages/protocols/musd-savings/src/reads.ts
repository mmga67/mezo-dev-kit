import { createHash } from "node:crypto";

import type { ContractAbiEntry, ContractAddress } from "@mezo-dev-kit/contracts";
import type { HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import { isAddress, isHexData, parseAddress } from "@mezo-dev-kit/evm";

import { uint256 } from "./accounting.ts";
import { SavingsReadError } from "./errors.ts";
import { IMPLEMENTATION_SLOT, SAVINGS_ROLE_TEMPLATES } from "./model.generated.ts";
import type { SavingsCall, SavingsReadValue, SavingsReaderConfig } from "./types.ts";

export function address(value: unknown, field: string): ContractAddress {
  if (!isAddress(value) || value === `0x${"0".repeat(40)}`)
    throw new SavingsReadError("InvalidReadValue", field);
  return parseAddress(value);
}
export function sameAddress(actual: unknown, expected: ContractAddress, field: string): void {
  if (address(actual, field) !== expected.toLowerCase())
    throw new SavingsReadError("TopologyMismatch", field);
}
export function readCall(
  abi: readonly ContractAbiEntry[],
  functionName: string,
  args: readonly ContractAddress[] = [],
): SavingsCall {
  const matches = abi.filter(
    (entry) =>
      entry.type === "function" &&
      entry.name === functionName &&
      (entry.stateMutability === "view" || entry.stateMutability === "pure"),
  );
  if (matches.length !== 1) throw new SavingsReadError("UnsupportedRole", functionName);
  return Object.freeze({
    abi: Object.freeze(matches),
    functionName,
    args: Object.freeze([...args]),
  });
}
export function encode(config: SavingsReaderConfig, call: SavingsCall): HexData {
  const data = config.codec.encodeRead(call);
  if (!isHexData(data) || data.length < 10)
    throw new SavingsReadError("InvalidInput", "codec.encodeRead");
  return data;
}
export function available<T>(value: T): SavingsReadValue<T> {
  return Object.freeze({ status: "available", value: Object.freeze(value) });
}
export function unavailable<T>(error: unknown, field: string): SavingsReadValue<T> {
  if (
    error instanceof SavingsReadError &&
    ["TopologyMismatch", "InconsistentCoordinate"].includes(error.code)
  )
    throw error;
  const failure =
    error instanceof SavingsReadError
      ? error
      : new SavingsReadError("ReadUnavailable", field, { cause: error });
  return Object.freeze({ status: "unavailable", error: failure.toJSON() });
}
export async function optional<T>(
  field: string,
  action: () => Promise<T>,
): Promise<SavingsReadValue<T>> {
  try {
    return available(await action());
  } catch (error) {
    return unavailable(error, field);
  }
}
export function scalar(value: unknown, field: string): bigint {
  return uint256(value, field);
}
export function codeHash(value: unknown): string {
  if (!isHexData(value) || value.length === 2)
    throw new SavingsReadError("InvalidReadValue", "runtimeCode");
  return createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex");
}
export async function implementation(
  config: SavingsReaderConfig,
  coordinate: ReadCoordinate,
  target: ContractAddress,
): Promise<ContractAddress> {
  const slot = await config.transport.getStorage({
    ...coordinate,
    address: target,
    slot: IMPLEMENTATION_SLOT,
  });
  if (typeof slot !== "string" || !/^0x0{24}[0-9a-fA-F]{40}$/.test(slot))
    throw new SavingsReadError("InvalidReadValue", "implementationSlot");
  return address(`0x${slot.slice(-40)}`, "implementationSlot");
}
export async function verifyRole(
  config: SavingsReaderConfig,
  coordinate: ReadCoordinate,
  role: keyof typeof SAVINGS_ROLE_TEMPLATES,
  target: ContractAddress,
): Promise<ContractAddress> {
  const profile = SAVINGS_ROLE_TEMPLATES[role];
  const codeAddress = profile.proxy ? await implementation(config, coordinate, target) : target;
  const code = await config.transport.getCode({ ...coordinate, address: codeAddress });
  if (codeHash(code) !== profile.runtimeSha256)
    throw new SavingsReadError("UnsupportedRole", `${role}.runtime`);
  return codeAddress;
}
export async function dynamicRead(
  config: SavingsReaderConfig,
  coordinate: ReadCoordinate,
  target: ContractAddress,
  call: SavingsCall,
): Promise<unknown> {
  const data = await config.transport.read({
    ...coordinate,
    address: target,
    data: encode(config, call),
  });
  return config.codec.decodeRead({ ...call, data });
}
