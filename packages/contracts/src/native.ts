import { parseAddress, parseHash32 } from "@mezo-dev-kit/evm";
import type { Address, Hash32 } from "@mezo-dev-kit/evm";
import type { NetworkId } from "@mezo-dev-kit/chains";
import { ContractRegistryError } from "./errors.ts";
import { NATIVE_CONTRACT_INTERFACES, NATIVE_TOKEN_PROFILES } from "./native.generated.ts";
import { resolveContract } from "./registry.ts";
import type { ContractAbiEntry, ContractResolutionInput } from "./registry.ts";

/** Expected bytes for one bounded Native token generation; verify against RPC before use. */
export interface NativeTokenProfile {
  readonly networkId: NetworkId;
  readonly tokenAddress: Address;
  readonly decimals: number;
  readonly addressCodeSha256: string;
  readonly implementationAddress: Address | null;
  readonly implementationSlot: Hash32 | null;
  readonly implementationCodeSha256: string | null;
  readonly extraReadAbi: readonly ContractAbiEntry[];
}

/** Resolve a private Native token profile, including its proxy slot and expected implementation. */
export function getNativeTokenProfile(input: {
  readonly networkId: NetworkId;
  readonly tokenAddress: Address;
}): Readonly<NativeTokenProfile> {
  const token = parseAddress(input.tokenAddress);
  const profile = NATIVE_TOKEN_PROFILES.find(
    (p) => p.networkId === input.networkId && parseAddress(p.tokenAddress) === token,
  );
  if (!profile)
    throw new ContractRegistryError("AbiUnavailable", "Native token profile unavailable", {});
  return Object.freeze({
    ...structuredClone(profile),
    tokenAddress: token,
    implementationAddress:
      profile.implementationAddress === null ? null : parseAddress(profile.implementationAddress),
    implementationSlot:
      profile.implementationSlot === null ? null : parseHash32(profile.implementationSlot),
  });
}

/** Decode observed Native source/system calls. This interface does not authorize system injection. */
export function getNativeBridgeCalldataAbi(
  input: ContractResolutionInput,
): readonly ContractAbiEntry[] {
  const contract = resolveContract(input);
  const profile = NATIVE_CONTRACT_INTERFACES.find((p) => p.deploymentId === contract.deploymentId);
  if (!profile)
    throw new ContractRegistryError("AbiUnavailable", "Native calldata interface unavailable", {});
  return structuredClone(profile.calldataAbi);
}
