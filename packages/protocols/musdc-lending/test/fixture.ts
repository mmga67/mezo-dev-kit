import { readFile } from "node:fs/promises";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ContractAddress } from "@mezo-dev-kit/contracts";
import type { CoreTransportReadRequest, HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingCall, LendingReaderConfig } from "../src/index.ts";
import { LENDING_MODEL as MODEL } from "../src/model.generated.ts";
export const ACCOUNT = `0x${"12".repeat(20)}` as const;
export const BLOCK = 11_660_852n;
export const HASH = `0x${"ab".repeat(32)}` as const;
export const TIME = 1_787_510_000n;
export async function fixture(): Promise<{
  config: LendingReaderConfig;
  values: Map<string, unknown>;
  fail: Set<string>;
  code: Map<ContractAddress, string>;
  state: {
    chainId: bigint;
    reorg: boolean;
    wrongImplementation: boolean;
    tokenBalance: bigint;
    tokenFailure: boolean;
  };
  reads: { request: CoreTransportReadRequest; call: LendingCall }[];
  inspected: ReadCoordinate[];
  morpho: ReturnType<ReturnType<typeof createContractRegistry>["resolve"]>;
  oracle: ReturnType<ReturnType<typeof createContractRegistry>["resolve"]>;
}> {
  const registry = createContractRegistry();
  const resolve = (contractId: keyof typeof MODEL.roots) =>
    registry.resolve({ contractId, networkId: "mezo-mainnet", blockNumber: BLOCK });
  const morpho = resolve("lending.morpho"),
    irm = resolve("lending.adaptive-curve-irm"),
    oracle = resolve("lending.musdc-btc-oracle"),
    skip = resolve("oracle.skip-btc-usd");
  const values = new Map<string, unknown>([
    [
      "idToMarketParams",
      [MODEL.loanToken, MODEL.collateralToken, oracle.address, irm.address, BigInt(MODEL.lltv)],
    ],
    ["market", [2_000_000n, 2_000_000_000_000n, 1_000_000n, 1_000_000_000_000n, TIME - 3600n, 0n]],
    ["position", [200_000_000_000n, 100_000_000_000n, 10n ** 18n]],
    ["feeRecipient", ACCOUNT],
    ["MORPHO", morpho.address],
    ["priceFeed", skip.address],
    ["scaleFactor", BigInt(MODEL.oracle.scaleFactor)],
    ["loanDecimals", 6n],
    ["collateralDecimals", 18n],
    ["decimals", 18n],
    ["borrowRateView", 10n ** 12n],
    ["price", 10n ** 30n],
    ["latestRoundData", [0n, 10n ** 24n, 0n, TIME - 60n, 0n]],
  ]);
  const fail = new Set<string>(),
    code = new Map<ContractAddress, string>();
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
    throw new Error("missing runtime fixtures");
  for (const item of capture.records as unknown[]) {
    if (
      !item ||
      typeof item !== "object" ||
      !("address" in item) ||
      !("code" in item) ||
      typeof item.address !== "string" ||
      !/^0x[0-9a-f]{40}$/.test(item.address) ||
      typeof item.code !== "string"
    )
      throw new Error("invalid runtime fixture");
    code.set(item.address as ContractAddress, item.code);
  }
  const calls = new Map<HexData, LendingCall>(),
    reads: { request: CoreTransportReadRequest; call: LendingCall }[] = [],
    inspected: ReadCoordinate[] = [];
  const state = {
    chainId: 31612n,
    reorg: false,
    wrongImplementation: false,
    tokenBalance: 900_000n,
    tokenFailure: false,
  };
  const config: LendingReaderConfig = {
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
      id: "lending-fixture",
      getChainId() {
        return state.chainId;
      },
      getBlockNumber() {
        return BLOCK;
      },
      getBlock(number) {
        return {
          number,
          hash: state.reorg && inspected.length > 0 ? `0x${"cd".repeat(32)}` : HASH,
          timestamp: TIME,
        };
      },
      read(request) {
        const call = calls.get(request.data);
        if (!call) throw new Error("missing codec call");
        reads.push({ request, call });
        if (fail.has(call.functionName)) throw new Error("synthetic provider failure");
        return values.get(call.functionName);
      },
      getCode(request) {
        inspected.push(request);
        return code.get(request.address);
      },
      getStorage(request) {
        inspected.push(request);
        const implementation = state.wrongImplementation ? ACCOUNT : oracle.implementationAddress;
        if (!implementation) throw new Error("missing implementation");
        return `0x${"0".repeat(24)}${implementation.slice(2)}`;
      },
      getTokenBalance(request) {
        inspected.push(request);
        if (request.token !== MODEL.loanToken || request.account !== morpho.address)
          throw new Error("wrong token/account");
        if (state.tokenFailure) throw new Error("token failure");
        return state.tokenBalance;
      },
    },
  };
  return { config, values, fail, code, state, reads, inspected, morpho, oracle };
}
