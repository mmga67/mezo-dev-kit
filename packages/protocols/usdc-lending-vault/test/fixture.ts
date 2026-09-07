import { readFile } from "node:fs/promises";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ContractAddress } from "@mezo-dev-kit/contracts";
import type { HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingCall } from "@mezo-dev-kit/musdc-lending";
import type { VaultReaderConfig } from "../src/index.ts";
import { VAULT_MODEL as MODEL } from "../src/model.generated.ts";
export const ACCOUNT = `0x${"12".repeat(20)}` as const;
export const VAULT = `0x${"21".repeat(20)}` as const;
export const GAUGE = `0x${"22".repeat(20)}` as const;
export const REWARD = `0x${"23".repeat(20)}` as const;
export const TIME = 1787510000n,
  BLOCK = 11660852n,
  HASH = `0x${"ab".repeat(32)}` as const;
export async function fixture(): Promise<{
  config: VaultReaderConfig;
  values: Map<string, unknown>;
  code: Map<string, string>;
  fail: Set<string>;
  reads: { address: ContractAddress; name: string; coordinate: ReadCoordinate }[];
  state: { reorg: boolean; chainId: bigint; tokenFailure: boolean };
  wrapper: ContractAddress;
  adapter: ContractAddress;
}> {
  const registry = createContractRegistry();
  const resolve = (contractId: Parameters<typeof registry.resolve>[0]["contractId"]) =>
    registry.resolve({ contractId, networkId: "mezo-mainnet", blockNumber: BLOCK });
  const wrapper = resolve("vaults.usdc-lending-wrapper"),
    adapter = resolve("vaults.usdc-lending-market-adapter"),
    morpho = resolve("lending.morpho"),
    irm = resolve("lending.adaptive-curve-irm"),
    oracle = resolve("lending.musdc-btc-oracle"),
    skip = resolve("oracle.skip-btc-usd"),
    voter = resolve("incentives.pools-voter");
  const values = new Map<string, unknown>(),
    code = new Map<string, string>(),
    fail = new Set<string>();
  function put(target: ContractAddress, entries: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(entries)) values.set(`${target}:${name}`, value);
  }
  put(morpho.address, {
    idToMarketParams: [
      MODEL.loanToken,
      MODEL.collateralToken,
      oracle.address,
      irm.address,
      BigInt(MODEL.lltv),
    ],
    market: [2_000_000n, 2_000_000_000_000n, 1_000_000n, 1_000_000_000_000n, TIME, 0n],
    position: [1_000_000_000_000n, 0n, 0n],
    feeRecipient: ACCOUNT,
  });
  put(irm.address, { MORPHO: morpho.address, borrowRateView: 0n });
  put(oracle.address, {
    priceFeed: skip.address,
    scaleFactor: 1000000n,
    loanDecimals: 6n,
    collateralDecimals: 18n,
    price: 10n ** 30n,
  });
  put(skip.address, { decimals: 18n, latestRoundData: [0n, 10n ** 24n, 0n, TIME, 0n] });
  put(wrapper.address, {
    vault: VAULT,
    gauge: GAUGE,
    yieldToken: VAULT,
    totalSupply: 10n ** 18n,
    accumulatedYield: 10n ** 16n,
    lastShareRatio: 1_000_000n,
    [`balanceOf:${ACCOUNT}`]: 2n * 10n ** 17n,
    [`balanceOf:${GAUGE}`]: 8n * 10n ** 17n,
  });
  put(adapter.address, {
    parentVault: VAULT,
    asset: MODEL.loanToken,
    morpho: morpho.address,
    marketIdsLength: 1n,
    marketIds: MODEL.marketId,
    realAssets: 1_000_000n,
    supplyShares: 1_000_000_000_000n,
  });
  put(VAULT, {
    asset: MODEL.loanToken,
    adaptersLength: 1n,
    adapters: adapter.address,
    liquidityAdapter: adapter.address,
    virtualShares: 10n ** 12n,
    totalSupply: 10n ** 18n,
    totalAssets: 1_000_000n,
    accrueInterestView: [1_000_000n, 0n, 0n],
    [`balanceOf:${wrapper.address}`]: 10n ** 18n,
    [`balanceOf:${ACCOUNT}`]: 0n,
    convertToAssets: 1_000_000n,
    previewDeposit: 10n ** 18n,
    previewMint: 1_000_000n,
    previewWithdraw: 10n ** 18n,
    previewRedeem: 1_000_000n,
  });
  put(GAUGE, {
    stakingToken: wrapper.address,
    voter: voter.address,
    rewardToken: REWARD,
    totalSupply: 8n * 10n ** 17n,
    [`balanceOf:${ACCOUNT}`]: 8n * 10n ** 17n,
    earned: 123n,
    fees: 456n,
  });
  put(voter.address, { gauges: GAUGE });
  const capture: unknown = JSON.parse(
    await readFile(
      new URL(
        "../../../../knowledge/contracts/artifacts/read-runtime/lending-mainnet.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    !capture ||
    typeof capture !== "object" ||
    !("records" in capture) ||
    !Array.isArray(capture.records)
  )
    throw new Error("bad runtime fixture");
  for (const item of capture.records as unknown[]) {
    if (
      !item ||
      typeof item !== "object" ||
      !("address" in item) ||
      !("code" in item) ||
      typeof item.address !== "string" ||
      typeof item.code !== "string"
    )
      throw new Error("bad runtime");
    code.set(item.address, item.code);
  }
  for (const [role, target] of [
    ["vault-v2", VAULT],
    ["vault-gauge", GAUGE],
    ["receipt-wrapper", wrapper.implementationAddress],
    ["morpho-market-adapter", adapter.address],
  ] as const) {
    const snapshot: unknown = JSON.parse(
      await readFile(
        new URL(
          `../../../../knowledge/contracts/artifacts/dynamic-interfaces/vault-${role}-explorer.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !("deployed_bytecode" in snapshot) ||
      typeof snapshot.deployed_bytecode !== "string" ||
      !target
    )
      throw new Error("missing role runtime");
    code.set(target, snapshot.deployed_bytecode);
  }
  const calls = new Map<HexData, LendingCall>(),
    reads: { address: ContractAddress; name: string; coordinate: ReadCoordinate }[] = [];
  const state = { reorg: false, chainId: 31612n, tokenFailure: false };
  const config: VaultReaderConfig = {
    networkId: "mezo-mainnet",
    registry,
    codec: {
      encodeRead(call) {
        const data = `0x${(calls.size + 1).toString(16).padStart(8, "0")}` as const;
        calls.set(data, call);
        return data;
      },
      decodeRead({ data }) {
        return data;
      },
    },
    transport: {
      id: "vault-fixture",
      getChainId() {
        return state.chainId;
      },
      getBlockNumber() {
        return BLOCK;
      },
      getBlock(number) {
        return {
          number,
          hash:
            state.reorg && reads.some((x) => x.address === VAULT) ? `0x${"cd".repeat(32)}` : HASH,
          timestamp: TIME,
        };
      },
      read(request) {
        const call = calls.get(request.data);
        if (!call) throw new Error("missing call");
        reads.push({ address: request.address, name: call.functionName, coordinate: request });
        const key = `${request.address}:${call.functionName}`;
        if (fail.has(key)) throw new Error("synthetic read failure");
        return values.get(
          call.functionName === "balanceOf" ? `${key}:${String(call.args[0])}` : key,
        );
      },
      getCode(request) {
        return code.get(request.address);
      },
      getStorage(request) {
        const target = request.address === wrapper.address ? wrapper : oracle;
        if (!target.implementationAddress) throw new Error("missing implementation");
        return `0x${"0".repeat(24)}${target.implementationAddress.slice(2)}`;
      },
      getTokenBalance(request) {
        if (request.token !== MODEL.loanToken) throw new Error("wrong token");
        if (state.tokenFailure && request.account === VAULT) throw new Error("idle balance failed");
        return request.account === VAULT ? 0n : 1_000_000n;
      },
    },
  };
  return {
    config,
    values,
    code,
    fail,
    reads,
    state,
    wrapper: wrapper.address,
    adapter: adapter.address,
  };
}
