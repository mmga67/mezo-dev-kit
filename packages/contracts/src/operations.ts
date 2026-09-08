import { BORROWER_OPERATION_ABI, BORROWING_RUNTIME_IDENTITIES } from "./operations.generated.ts";
import { ContractRegistryError } from "./errors.ts";
import { resolveContract } from "./registry.ts";
import type { ContractAbiEntry, ContractResolutionInput, ResolvedContract } from "./registry.ts";
import {
  PROTOCOL_OPERATION_ABIS,
  PROTOCOL_ROLE_INTERFACES,
  PROTOCOL_RUNTIME_IDENTITIES,
  TOKEN_ABI,
  BASIC_POOL_INTERFACES,
} from "./protocol-operations.generated.ts";
import type { ContractId } from "./registry.ts";

export interface BasicPoolInterface {
  readonly anchorContractId: ContractId;
  readonly getter: string;
  readonly runtimeSha256: string;
  readonly sourceSha256: string;
  readonly abi: readonly ContractAbiEntry[];
}
/** Getter-discovered implementation/registry profiles; dynamic pools still require topology checks. */
export function resolveBasicPoolInterface(input: {
  readonly networkId: string;
  readonly role: "pool" | "factory-registry";
}): Readonly<BasicPoolInterface> {
  if (input.networkId !== "mezo-mainnet" || !Object.hasOwn(BASIC_POOL_INTERFACES, input.role))
    throw new ContractRegistryError("AbiUnavailable", "unknown basic pool interface", {
      networkId: input.networkId,
    });
  return Object.freeze(structuredClone(BASIC_POOL_INTERFACES[input.role]));
}

export type ProtocolRole = keyof typeof PROTOCOL_ROLE_INTERFACES;
export interface ProtocolRoleInterface {
  readonly role: ProtocolRole;
  readonly anchorContractId: ContractId;
  readonly runtimeSha256: string;
  readonly abi: readonly ContractAbiEntry[];
}
/** ABI/runtime template only. The protocol must prove discovery and topology at the call block. */
export function resolveRoleInterface(input: {
  readonly role: ProtocolRole;
  readonly networkId: string;
}): Readonly<ProtocolRoleInterface> {
  if (input.networkId !== "mezo-mainnet" || !Object.hasOwn(PROTOCOL_ROLE_INTERFACES, input.role))
    throw new ContractRegistryError("AbiUnavailable", "unknown role interface", {
      networkId: input.networkId,
    });
  return Object.freeze({
    role: input.role,
    ...structuredClone(PROTOCOL_ROLE_INTERFACES[input.role]),
  });
}
/** Canonical scalar ERC-20 call/event shapes, without token or spender identity assumptions. */
export function getTokenInterface(): readonly ContractAbiEntry[] {
  return structuredClone(TOKEN_ABI);
}

export interface ResolvedOperation {
  readonly contract: Readonly<ResolvedContract>;
  readonly functionAbi: ContractAbiEntry;
}

/** Curated receipt event, including operation events outside the legacy read projection. */
export function resolveEvent(
  input: ContractResolutionInput & { readonly eventName: string },
): ContractAbiEntry {
  const contract = resolveContract(input);
  const abi =
    input.networkId === "mezo-mainnet"
      ? (PROTOCOL_OPERATION_ABIS[input.contractId] ?? contract.readAbi)
      : contract.readAbi;
  const matches = abi.filter((entry) => entry.type === "event" && entry.name === input.eventName);
  if (matches.length !== 1 || !matches[0])
    throw new ContractRegistryError("AbiUnavailable", "missing or ambiguous event", {
      contractId: input.contractId,
      networkId: input.networkId,
    });
  return structuredClone(matches[0]);
}

export interface ContractRuntimeIdentity {
  readonly addressCodeSha256: string;
  readonly implementationCodeSha256: string | null;
  readonly implementationSlot: `0x${string}` | null;
}

export function resolveRuntimeIdentity(
  input: ContractResolutionInput,
): Readonly<ContractRuntimeIdentity> {
  resolveContract(input);
  const identity =
    input.networkId === "mezo-mainnet"
      ? (BORROWING_RUNTIME_IDENTITIES[input.contractId] ??
        PROTOCOL_RUNTIME_IDENTITIES[input.contractId])
      : undefined;
  if (!identity)
    throw new ContractRegistryError(
      "AbiUnavailable",
      "runtime identity is not projected for this deployment",
      { contractId: input.contractId, networkId: input.networkId },
    );
  return Object.freeze({ ...identity });
}

/** Curated ABI availability only; execution and protocol checks remain required. */
export function resolveOperation(
  input: ContractResolutionInput & {
    readonly functionName: string;
    readonly inputTypes?: readonly string[];
  },
): Readonly<ResolvedOperation> {
  const contract = resolveContract(input);
  const abi =
    input.networkId !== "mezo-mainnet"
      ? []
      : input.contractId === "musd.borrower-operations"
        ? BORROWER_OPERATION_ABI
        : (PROTOCOL_OPERATION_ABIS[input.contractId] ?? []);
  const matches = abi.filter(
    (entry) =>
      entry.type === "function" &&
      entry.name === input.functionName &&
      entry.stateMutability !== "view" &&
      entry.stateMutability !== "pure" &&
      (input.inputTypes === undefined ||
        (Array.isArray(entry.inputs) &&
          JSON.stringify(
            entry.inputs.map((part: unknown) =>
              part && typeof part === "object" && "type" in part ? part.type : null,
            ),
          ) === JSON.stringify(input.inputTypes))),
  );
  const entry = matches.length === 1 ? matches[0] : undefined;
  if (!entry)
    throw new ContractRegistryError(
      "AbiUnavailable",
      "operation ABI is unavailable for this contract/network/method",
      {
        contractId: input.contractId,
        networkId: input.networkId,
        functionName: input.functionName,
      },
    );
  // The generated data is private; return a deep copy so callers cannot mutate future resolutions.
  return Object.freeze({ contract, functionAbi: structuredClone(entry) });
}
