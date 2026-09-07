import { createHash } from "node:crypto";
import type { ContractAbiEntry, ContractAddress, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import { uint } from "./accounting.ts";
import { LendingReadError } from "./errors.ts";
import { LENDING_MODEL } from "./model.generated.ts";
import type {
  LendingAbiValue,
  LendingCall,
  LendingReadValue,
  LendingReaderConfig,
} from "./types.ts";

export function address(value: unknown, field: string): ContractAddress {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value))
    throw new LendingReadError("InvalidValue", field);
  return value.toLowerCase() as ContractAddress;
}
export function sameAddress(actual: unknown, expected: ContractAddress, field: string): void {
  if (address(actual, field) !== expected.toLowerCase())
    throw new LendingReadError("TopologyMismatch", field);
}
export function tuple(value: unknown, length: number, field: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length)
    throw new LendingReadError("InvalidValue", field);
  return value as readonly unknown[];
}
export function readCall(
  abi: readonly ContractAbiEntry[],
  functionName: string,
  args: readonly LendingAbiValue[] = [],
): LendingCall {
  const entries = abi.filter(
    (entry) =>
      entry.type === "function" &&
      entry.name === functionName &&
      (entry.stateMutability === "view" || entry.stateMutability === "pure"),
  );
  if (entries.length !== 1) throw new LendingReadError("UnsupportedRuntime", functionName);
  return Object.freeze({
    abi: Object.freeze(entries),
    functionName,
    args: Object.freeze([...args]),
  });
}
export function encode(config: LendingReaderConfig, call: LendingCall): HexData {
  const result = config.codec.encodeRead(call);
  if (typeof result !== "string" || !/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(result))
    throw new LendingReadError("InvalidValue", "codec.encodeRead");
  return result;
}
export function available<T>(value: T): LendingReadValue<T> {
  return Object.freeze({ status: "available", value: Object.freeze(value) });
}
export function unavailable<T>(error: unknown, field: string): LendingReadValue<T> {
  if (
    error instanceof LendingReadError &&
    ["TopologyMismatch", "InconsistentCoordinate", "UnsupportedRuntime"].includes(error.code)
  )
    throw error;
  const failure =
    error instanceof LendingReadError
      ? error
      : new LendingReadError("ReadUnavailable", field, { cause: error });
  return Object.freeze({ status: "unavailable", error: failure.toJSON() });
}
export function attempt<T>(field: string, read: () => T): LendingReadValue<T> {
  try {
    return available(read());
  } catch (error) {
    return unavailable(error, field);
  }
}
function codeHash(value: unknown): string {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value))
    throw new LendingReadError("InvalidValue", "runtimeCode");
  return createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex");
}
export async function verifyRuntime(
  config: LendingReaderConfig,
  coordinate: ReadCoordinate,
  contract: ResolvedContract,
  id: keyof typeof LENDING_MODEL.roots,
): Promise<void> {
  const profile = LENDING_MODEL.roots[id];
  if (
    codeHash(await config.transport.getCode({ ...coordinate, address: contract.address })) !==
    profile.runtimeSha256
  )
    throw new LendingReadError("UnsupportedRuntime", id);
  if (profile.implementationSlot !== null) {
    const slot = await config.transport.getStorage({
      ...coordinate,
      address: contract.address,
      slot: profile.implementationSlot,
    });
    if (
      typeof slot !== "string" ||
      !/^0x0{24}[0-9a-fA-F]{40}$/.test(slot) ||
      contract.implementationAddress === null
    )
      throw new LendingReadError("InvalidValue", `${id}.implementation`);
    sameAddress(`0x${slot.slice(-40)}`, contract.implementationAddress, `${id}.implementation`);
    if (
      codeHash(
        await config.transport.getCode({ ...coordinate, address: contract.implementationAddress }),
      ) !== profile.implementationSha256
    )
      throw new LendingReadError("UnsupportedRuntime", `${id}.implementation`);
  }
}
export function blockTime(value: unknown): bigint {
  return uint(value, "block.timestamp");
}
