import { expect, test } from "vitest";
import {
  getNativeBridgeCalldataAbi,
  getNativeTokenProfile,
  resolveContract,
  resolveOperation,
  resolveRuntimeIdentity,
} from "../src/index.ts";
import { parseAddress } from "@mezo-dev-kit/evm";
import { NATIVE_TOKEN_PROFILES } from "../src/native.generated.ts";

test.for([
  ["bridge.native-assets-precompile", "mezo-mainnet", "bridgeOut", 4, false],
  ["bridge.native-mezo-bridge", "ethereum-mainnet", "bridgeERC20", 3, true],
] as const)(
  "resolves the current ordinary Native source call for %s",
  ([contractId, networkId, functionName, arity, proxy]) => {
    const input = { contractId, networkId, blockNumber: 99_999_990n };
    const operation = resolveOperation({ ...input, functionName });
    expect(operation.functionAbi.inputs).toHaveLength(arity);
    expect(operation.functionAbi.stateMutability).toBe("nonpayable");
    expect(operation.contract.deploymentId).toBe(resolveContract(input).deploymentId);
    const runtime = resolveRuntimeIdentity(input);
    expect(runtime.addressCodeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(runtime.implementationSlot !== null).toBe(proxy);
    expect(runtime.implementationCodeSha256 !== null).toBe(proxy);
    for (const name of [
      "bridge",
      "attestBridgeOut",
      "setOutflowLimit",
      "bridgeTBTC",
      "bridgeTriparty",
    ])
      expect(() => resolveOperation({ ...input, functionName: name })).toThrow(
        expect.objectContaining({ code: "AbiUnavailable" }),
      );
    expect(() => resolveOperation({ ...input, functionName, inputTypes: [] })).toThrow(
      expect.objectContaining({ code: "AbiUnavailable" }),
    );
  },
);

test("does not apply the current Native projection to old transfer generations", () => {
  for (const input of [
    {
      contractId: "bridge.native-assets-precompile",
      networkId: "mezo-mainnet",
      blockNumber: 8944561n,
    },
    {
      contractId: "bridge.native-mezo-bridge",
      networkId: "ethereum-mainnet",
      blockNumber: 25094211n,
    },
  ] as const) {
    expect(() => resolveRuntimeIdentity(input)).toThrow();
    expect(() => resolveOperation({ ...input, functionName: "bridgeOut" })).toThrow();
  }
});

test("system calldata is available for observation without making it an executable operation", () => {
  const input = {
    contractId: "bridge.native-assets-precompile" as const,
    networkId: "mezo-mainnet" as const,
    blockNumber: 99_999_990n,
  };
  expect(getNativeBridgeCalldataAbi(input).map((e) => e.name)).toEqual(
    expect.arrayContaining(["bridge", "bridgeOut"]),
  );
  expect(() => resolveOperation({ ...input, functionName: "bridge" })).toThrow(
    expect.objectContaining({ code: "AbiUnavailable" }),
  );
});
test("Native token profiles reject unknown representations and isolate returned ABI data", () => {
  const row = NATIVE_TOKEN_PROFILES.find((p) => p.extraReadAbi.length > 0);
  expect(row).toBeDefined();
  if (!row) throw new Error("missing mapped-token profile");
  const input = { networkId: row.networkId, tokenAddress: parseAddress(row.tokenAddress) };
  const profile = getNativeTokenProfile(input);
  expect(profile.implementationAddress).not.toBeNull();
  expect(profile.extraReadAbi).toHaveLength(1);
  Reflect.set(profile.extraReadAbi, "length", 0);
  expect(getNativeTokenProfile(input).extraReadAbi).toHaveLength(1);
  expect(() =>
    getNativeTokenProfile({ ...input, tokenAddress: parseAddress(`0x${"a".repeat(40)}`) }),
  ).toThrow(expect.objectContaining({ code: "AbiUnavailable" }));
});
