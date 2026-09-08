import { expect, test } from "vitest";
import { createContractRegistry, resolveRoleInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, parseHexData } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createVaultReader, forecastVault } from "../src/index.ts";
import { readVaultWriteState } from "../src/write-state.ts";
import { VAULT_MODEL } from "../src/model.generated.ts";
import { fixture, ACCOUNT, VAULT } from "./fixture.ts";
async function setup(
  input: { gate?: boolean; absoluteCap?: bigint; relativeCap?: bigint; allocation?: bigint } = {},
) {
  const f = await fixture();
  const snapshot = await createVaultReader(f.config).read({
    account: ACCOUNT,
    previewAssets: 1_000_000n,
    previewShares: 10n ** 18n,
    maxPriceAgeSeconds: 60n,
  });
  const registry = createContractRegistry(),
    codec = createAbiCodec(),
    calls = new Map<string, `0x${string}`>();
  const resolve = (contractId: Parameters<typeof registry.resolve>[0]["contractId"]) =>
    registry.resolve({
      contractId,
      networkId: snapshot.coordinate.networkId,
      blockNumber: snapshot.coordinate.blockNumber,
    });
  const adapter = resolve("vaults.usdc-lending-market-adapter"),
    morpho = resolve("lending.morpho");
  const vaultAbi = resolveRoleInterface({
    role: "vault-v2",
    networkId: snapshot.coordinate.networkId,
  }).abi;
  const tuple = [
    VAULT_MODEL.loanToken,
    VAULT_MODEL.collateralToken,
    resolve("lending.musdc-btc-oracle").address,
    resolve("lending.adaptive-curve-irm").address,
    BigInt(VAULT_MODEL.lltv),
  ] as const;
  const ids = [1, 2, 3].map((id) => `0x${id.toString(16).padStart(64, "0")}` as const);
  function put(
    address: `0x${string}`,
    abi: readonly ContractAbiEntry[],
    name: string,
    args: readonly AbiValue[],
    values: readonly AbiValue[],
  ) {
    const entry = abi.find((item) => item.type === "function" && item.name === name);
    if (!entry) throw new Error(`missing ${name}`);
    calls.set(
      `${address}:${codec.encodeFunction(entry, args)}`,
      parseHexData(
        `0x${codec.encodeFunction({ type: "function", name: "result", stateMutability: "pure", inputs: entry.outputs, outputs: [] }, values).slice(10)}`,
      ),
    );
  }
  const idsEntry = adapter.readAbi.find((item) => item.name === "ids");
  if (!idsEntry) throw new Error("missing IDs");
  const liquidityData = parseHexData(
    `0x${codec.encodeFunction({ type: "function", name: "params", stateMutability: "pure", inputs: idsEntry.inputs, outputs: [] }, [tuple]).slice(10)}`,
  );
  const zero = `0x${"0".repeat(40)}` as const;
  for (const name of ["receiveSharesGate", "sendSharesGate", "receiveAssetsGate", "sendAssetsGate"])
    put(VAULT, vaultAbi, name, [], [zero]);
  for (const name of ["canReceiveShares", "canSendAssets"])
    put(VAULT, vaultAbi, name, [ACCOUNT], [input.gate ?? true]);
  put(VAULT, vaultAbi, "liquidityData", [], [liquidityData]);
  put(VAULT, vaultAbi, "isAdapter", [snapshot.adapter], [true]);
  put(morpho.address, morpho.readAbi, "idToMarketParams", [VAULT_MODEL.marketId], tuple);
  put(snapshot.adapter, adapter.readAbi, "ids", [tuple], [ids]);
  put(
    snapshot.adapter,
    adapter.readAbi,
    "supplyShares",
    [VAULT_MODEL.marketId],
    [1_000_000_000_000n],
  );
  put(snapshot.adapter, adapter.readAbi, "allocation", [tuple], [1_000_000n]);
  for (const id of ids) {
    put(VAULT, vaultAbi, "allocation", [id], [input.allocation ?? 1_000_000n]);
    put(VAULT, vaultAbi, "absoluteCap", [id], [input.absoluteCap ?? 1_000_010n]);
    put(VAULT, vaultAbi, "relativeCap", [id], [input.relativeCap ?? 10n ** 18n]);
  }
  const transport = {
    ...createRpcTransport({
      id: "unreachable",
      request: async () => {
        throw new Error("unexpected RPC");
      },
    }),
    read: async (request: { address: `0x${string}`; data: `0x${string}` }) => {
      const result = calls.get(`${request.address}:${request.data}`);
      if (!result) throw new Error("unexpected vault call");
      return result;
    },
  };
  const action = { kind: "deposit", assets: 10n } as const;
  const forecast = forecastVault(snapshot, action, {
    maxBlockAge: 10n,
    maxPriceAgeSeconds: 60n,
    minOutput: 1n,
    maxInput: 10n,
  });
  return () => readVaultWriteState({ registry, transport }, snapshot, action, forecast);
}
test("allocation equals its cap at the inclusive boundary", async () => {
  const read = await setup();
  await expect(read()).resolves.toMatchObject({ expectedAllocationChange: 10n });
});
test.for([
  { gate: false, code: "GateClosed" },
  { absoluteCap: 1_000_009n, code: "CapacityExceeded" },
  { absoluteCap: 0n, code: "CapacityExceeded" },
  { relativeCap: 5n * 10n ** 17n, code: "CapacityExceeded" },
])("closed gate or exhausted cap blocks entry: $code", async ({ code, ...input }) => {
  const read = await setup(input);
  await expect(read()).rejects.toMatchObject({ code });
});
