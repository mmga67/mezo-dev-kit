import { resolveRoleInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { lendingToAssets, lendingToShares } from "@mezo-dev-kit/musdc-lending";
import { VAULT_MODEL } from "./model.generated.ts";
import type { VaultSnapshot } from "./types.ts";
import { VaultWriteError, vaultRequired } from "./forecast.ts";
import type { VaultAction, VaultForecast } from "./forecast.ts";

export interface VaultWriteState {
  readonly liquidityData: `0x${string}`;
  readonly gates: Readonly<
    Record<"receiveShares" | "sendShares" | "receiveAssets" | "sendAssets", `0x${string}`>
  >;
  readonly allocations: readonly Readonly<{
    id: `0x${string}`;
    allocation: bigint;
    absoluteCap: bigint;
    relativeCap: bigint;
  }>[];
  readonly expectedAllocationChange: bigint;
}
export async function readVaultWriteState(
  config: { readonly registry: ContractRegistry; readonly transport: RpcTransport },
  snapshot: VaultSnapshot,
  action: VaultAction,
  forecast: VaultForecast,
): Promise<Readonly<VaultWriteState>> {
  const codec = createAbiCodec();
  const coordinate = snapshot.coordinate;
  const profile = resolveRoleInterface({ role: "vault-v2", networkId: coordinate.networkId });
  const adapter = config.registry.resolve({
    contractId: "vaults.usdc-lending-market-adapter",
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
  const morpho = config.registry.resolve({
    contractId: "lending.morpho",
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
  async function read(
    address: `0x${string}`,
    abi: readonly ContractAbiEntry[],
    name: string,
    args: readonly AbiValue[] = [],
  ) {
    const entries = abi.filter((entry) => entry.type === "function" && entry.name === name);
    if (entries.length !== 1)
      throw new VaultWriteError("UnavailableState", `missing or ambiguous ${name}`);
    return codec.decodeFunction(
      entries[0],
      await config.transport.read({
        ...coordinate,
        contractId: "vaults.usdc-lending-wrapper",
        address,
        data: codec.encodeFunction(entries[0], args),
      }),
    );
  }
  const v = (name: string, args: readonly AbiValue[] = []) =>
    read(snapshot.vault, profile.abi, name, args);
  const a = (name: string, args: readonly AbiValue[] = []) =>
    read(snapshot.adapter, adapter.readAbi, name, args);
  const gateValues = await Promise.all(
    ["receiveSharesGate", "sendSharesGate", "receiveAssetsGate", "sendAssetsGate"].map(
      async (name) => parseAddress((await v(name))[0]),
    ),
  );
  const [receiveShares, sendShares, receiveAssets, sendAssets] = gateValues;
  if (!receiveShares || !sendShares || !receiveAssets || !sendAssets)
    throw new VaultWriteError("UnavailableState", "gate identities missing");
  const gates = Object.freeze({ receiveShares, sendShares, receiveAssets, sendAssets });
  const enter = action.kind === "deposit" || action.kind === "mint";
  const wrap = action.kind === "wrap-and-stake";
  const unwrap = action.kind === "unwrap";
  const checks: readonly (readonly [string, `0x${string}`])[] = enter
    ? [
        ["canReceiveShares", snapshot.account],
        ["canSendAssets", snapshot.account],
      ]
    : wrap
      ? [
          ["canSendShares", snapshot.account],
          ["canReceiveShares", snapshot.wrapper],
        ]
      : unwrap
        ? [
            ["canSendShares", snapshot.wrapper],
            ["canReceiveShares", snapshot.account],
          ]
        : [
            ["canSendShares", snapshot.account],
            ["canReceiveAssets", snapshot.account],
          ];
  for (const [name, account] of checks)
    if ((await v(name, [account]))[0] !== true)
      throw new VaultWriteError("GateClosed", `${name} rejected account`);
  const liquidityData = parseHexData((await v("liquidityData"))[0]);
  if (wrap || unwrap)
    return Object.freeze({ liquidityData, gates, allocations: [], expectedAllocationChange: 0n });
  if (!vaultRequired(snapshot.allocationReconciled))
    throw new VaultWriteError("UnavailableState", "adapter ownership does not reconcile");
  if ((await v("isAdapter", [snapshot.adapter]))[0] !== true)
    throw new VaultWriteError("UnavailableState", "liquidity adapter disabled");
  const idsEntry = adapter.readAbi.find(
    (entry) => entry.type === "function" && entry.name === "ids",
  );
  if (!idsEntry) throw new VaultWriteError("UnavailableState", "missing allocation interface");
  const decoded = codec.decodeFunction(
    {
      type: "function",
      name: "liquidityTuple",
      stateMutability: "pure",
      inputs: [],
      outputs: idsEntry.inputs,
    },
    liquidityData,
  )[0];
  if (!Array.isArray(decoded))
    throw new VaultWriteError("UnavailableState", "invalid liquidity tuple");
  const actual = await read(morpho.address, morpho.readAbi, "idToMarketParams", [
    VAULT_MODEL.marketId,
  ]);
  if (
    JSON.stringify(decoded, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ) !==
    JSON.stringify(actual, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    )
  )
    throw new VaultWriteError("UnavailableState", "liquidity tuple differs from current market");
  const rawIds = (await a("ids", [decoded]))[0];
  if (!Array.isArray(rawIds) || rawIds.length !== 3)
    throw new VaultWriteError("UnavailableState", "unsupported allocation ID set");
  const ids = rawIds.map((id) => parseHash32(id));
  if (new Set(ids).size !== ids.length)
    throw new VaultWriteError("UnavailableState", "duplicate allocation ID");
  const allocations = Object.freeze(
    await Promise.all(
      ids.map(async (id) => {
        const [allocation, absoluteCap, relativeCap] = await Promise.all(
          ["allocation", "absoluteCap", "relativeCap"].map(async (name) =>
            parseUint((await v(name, [id]))[0]),
          ),
        );
        if (allocation === undefined || absoluteCap === undefined || relativeCap === undefined)
          throw new VaultWriteError("UnavailableState", "missing cap");
        return Object.freeze({ id, allocation, absoluteCap, relativeCap });
      }),
    ),
  );
  const idle = vaultRequired(snapshot.idleLiquidity).baseUnits;
  const assets = enter ? forecast.assets : forecast.assets > idle ? forecast.assets - idle : 0n;
  let change = 0n;
  if (enter || assets > 0n) {
    const market = snapshot.underlyingMarket.accruedMarket;
    if (market.status !== "available")
      throw new VaultWriteError("UnavailableState", "accrued allocation market missing");
    const internalShares = parseUint((await a("supplyShares", [VAULT_MODEL.marketId]))[0]);
    const oldAllocation = parseUint((await a("allocation", [decoded]))[0]);
    const shares = lendingToShares(
      assets,
      market.value.totalSupplyAssets,
      market.value.totalSupplyShares,
      enter ? "down" : "up",
    );
    if (enter && shares < assets)
      throw new VaultWriteError("CapacityExceeded", "adapter share-price bound exceeded");
    if (!enter && shares > internalShares)
      throw new VaultWriteError("InsufficientLiquidity", "deallocation exceeds adapter shares");
    const direction = enter ? 1n : -1n;
    const nextAssets = parseUint(market.value.totalSupplyAssets + direction * assets, 128);
    const nextShares = parseUint(market.value.totalSupplyShares + direction * shares, 128);
    const nextAllocation = lendingToAssets(
      parseUint(internalShares + direction * shares),
      nextAssets,
      nextShares,
      "down",
    );
    change = nextAllocation - oldAllocation;
    const firstAssets = vaultRequired(snapshot.vaultState).newTotalAssets || forecast.assets;
    for (const cap of allocations) {
      const allocation = parseUint(cap.allocation + change);
      if (cap.relativeCap > 10n ** 18n)
        throw new VaultWriteError("UnavailableState", "relative cap exceeds one");
      if (enter) {
        const relativeLimit = parseUint(firstAssets * cap.relativeCap) / 10n ** 18n;
        if (
          cap.absoluteCap === 0n ||
          allocation > cap.absoluteCap ||
          (cap.relativeCap !== 10n ** 18n && allocation > relativeLimit)
        )
          throw new VaultWriteError("CapacityExceeded", "allocation exceeds current cap");
      } else if (cap.allocation === 0n)
        throw new VaultWriteError(
          "InsufficientLiquidity",
          "deallocation has no recorded allocation",
        );
    }
  }
  return Object.freeze({ liquidityData, gates, allocations, expectedAllocationChange: change });
}
