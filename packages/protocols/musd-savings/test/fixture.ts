import { readFile } from "node:fs/promises";

import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ContractAddress } from "@mezo-dev-kit/contracts";
import type { HexData } from "@mezo-dev-kit/core";

import type {
  SavingsCall,
  SavingsReaderConfig,
  SavingsTransportReadRequest,
} from "../src/index.ts";
import { SAVINGS_ROOTS } from "../src/model.generated.ts";

export const ACCOUNT = `0x${"12".repeat(20)}` as const;
export const BLOCK = 11_341_710n;
export const HASH = `0x${"ab".repeat(32)}` as const;
export const STRATEGY = `0x${"21".repeat(20)}` as const;
export const GAUGE = `0x${"22".repeat(20)}` as const;
export const CONVERTER = `0x${"23".repeat(20)}` as const;
export const CONVERTER_IMPL = `0x${"24".repeat(20)}` as const;
export const REWARD = `0x${"25".repeat(20)}` as const;

export interface ObservedRead {
  readonly request: SavingsTransportReadRequest;
  readonly call: SavingsCall;
}
export async function fixture(): Promise<{
  config: SavingsReaderConfig;
  reads: ObservedRead[];
  inspected: { address: ContractAddress; blockNumber: bigint; blockHash: string }[];
  values: Map<string, unknown>;
  fail: Set<string>;
  code: Map<ContractAddress, string>;
  state: { chainId: bigint; changedHash: boolean; wrongImplementation: boolean };
  savings: ContractAddress;
}> {
  const registry = createContractRegistry();
  const resolve = (contractId: Parameters<typeof registry.resolve>[0]["contractId"]) =>
    registry.resolve({ contractId, networkId: "mezo-mainnet", blockNumber: BLOCK });
  const savings = resolve(SAVINGS_ROOTS["savings-deployment"]);
  const musd = resolve(SAVINGS_ROOTS["musd-token"]);
  const pcv = resolve(SAVINGS_ROOTS.pcv);
  const voter = resolve(SAVINGS_ROOTS["pools-voter"]);
  const values = new Map<string, unknown>();
  const put = (target: ContractAddress, entries: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(entries))
      values.set(`${target.toLowerCase()}:${name}`, value);
  };
  put(savings.address, {
    totalSupply: 1000n,
    pendingYield: 7n,
    yieldIndex: 100000000000000000n,
    gaugeYieldClaimCap: 50n,
    strategy: STRATEGY,
    vaultGauge: GAUGE,
    musdToken: musd.address,
    yieldToken: musd.address,
    pcv: pcv.address,
    [`balanceOf:${ACCOUNT}`]: 10n,
    [`supplyYieldIndex:${ACCOUNT}`]: 0n,
    [`claimableYield:${ACCOUNT}`]: 2n,
    [`balanceOf:${GAUGE}`]: 120n,
  });
  put(pcv.address, { feeRecipient: savings.address, btcRecipient: CONVERTER });
  put(voter.address, { [`gauges:${savings.address}`]: GAUGE });
  put(STRATEGY, { vault: savings.address, token: musd.address });
  put(CONVERTER, {
    musdSavingsRate: savings.address,
    musdToken: musd.address,
    maxSlippageBps: 200n,
  });
  put(GAUGE, {
    stakingToken: savings.address,
    voter: voter.address,
    rewardToken: REWARD,
    [`balanceOf:${ACCOUNT}`]: 90n,
    totalSupply: 100n,
    [`earned:${ACCOUNT}`]: 13n,
    fees: 17n,
  });
  const code = new Map<ContractAddress, string>();
  const savingsSource: unknown = JSON.parse(
    await readFile(
      new URL(
        "../../../../knowledge/contracts/artifacts/dynamic-interfaces/savings-current-explorer.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    !savingsSource ||
    typeof savingsSource !== "object" ||
    !("deployed_bytecode" in savingsSource) ||
    typeof savingsSource.deployed_bytecode !== "string" ||
    !savings.implementationAddress
  )
    throw new Error("missing Savings source fixture");
  code.set(savings.implementationAddress, savingsSource.deployed_bytecode);
  for (const [role, target] of [
    ["strategy", STRATEGY],
    ["converter", CONVERTER_IMPL],
    ["gauge", GAUGE],
  ] as const) {
    const data: unknown = JSON.parse(
      await readFile(
        new URL(
          `../../../../knowledge/contracts/artifacts/dynamic-interfaces/savings-${role}-explorer.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (
      !data ||
      typeof data !== "object" ||
      !("deployed_bytecode" in data) ||
      typeof data.deployed_bytecode !== "string"
    )
      throw new Error("missing canonical runtime fixture");
    code.set(target, data.deployed_bytecode);
  }
  const reads: ObservedRead[] = [];
  const inspected: { address: ContractAddress; blockNumber: bigint; blockHash: string }[] = [];
  const fail = new Set<string>();
  const state = { chainId: 31612n, changedHash: false, wrongImplementation: false };
  const encoded = new Map<HexData, SavingsCall>();
  let nextCall = 0;
  let blockReads = 0;
  return {
    reads,
    inspected,
    values,
    fail,
    code,
    state,
    savings: savings.address,
    config: {
      networkId: "mezo-mainnet",
      registry,
      // A typed fake for the injected codec, not an ABI-encoding integration claim.
      codec: {
        encodeRead(call) {
          const data = `0x${(++nextCall).toString(16).padStart(8, "0")}` as const;
          encoded.set(data, call);
          return data;
        },
        decodeRead({ data }) {
          return data;
        },
      },
      transport: {
        id: "synthetic-savings-fixture",
        getChainId() {
          return state.chainId;
        },
        getBlockNumber() {
          return BLOCK;
        },
        getBlock(number) {
          blockReads += 1;
          return {
            number,
            hash: state.changedHash && blockReads > 1 ? `0x${"cd".repeat(32)}` : HASH,
          };
        },
        read(request) {
          const call = encoded.get(request.data);
          if (!call) throw new Error("unencoded fixture call");
          reads.push({ request, call });
          const key = `${request.address.toLowerCase()}:${call.functionName}${call.args.length ? `:${call.args.join(":")}` : ""}`;
          if (fail.has(key)) throw new Error("synthetic unavailable read");
          if (!values.has(key)) throw new Error(`unconfigured fixture field ${key}`);
          return values.get(key);
        },
        getCode(request) {
          inspected.push(request);
          return code.get(request.address);
        },
        getStorage(request) {
          inspected.push(request);
          const impl = state.wrongImplementation
            ? STRATEGY
            : request.address === savings.address
              ? savings.implementationAddress
              : CONVERTER_IMPL;
          if (!impl) throw new Error("missing implementation");
          return `0x${"0".repeat(24)}${impl.slice(2)}`;
        },
      },
    },
  };
}
