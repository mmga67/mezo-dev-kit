import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { getNetwork } from "@mezo-dev-kit/chains";
import {
  createContractRegistry,
  getNativeTokenProfile,
  getTokenInterface,
  resolveContract,
  resolveEvent,
  resolveOperation,
} from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcTransport,
} from "@mezo-dev-kit/core";
import type { ExactTransaction, RpcRequest } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { AbiValue, Address, Hash32, HexData } from "@mezo-dev-kit/evm";
import type { NativeTransferQuoteInput } from "@mezo-dev-kit/bridges";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, text, values } from "../../../scripts/lib/json.ts";

const codec = createAbiCodec();
export function nativeReturn(entry: ContractAbiEntry, result: readonly AbiValue[]): HexData {
  return parseHexData(
    `0x${codec.encodeFunction({ type: "function", name: "result", inputs: entry.outputs, outputs: [], stateMutability: "view" }, result).slice(10)}`,
  );
}
/** Real captured runtime/configuration; wallet, receipt and simulation values are explicit SDK models. */
async function buildNativeTransferFixture(inbound: boolean) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const load = async (moduleId: string, resourceId: string) =>
    object((await loadKnowledgeReference(root, { moduleId, resourceId })).document, resourceId);
  const capture = await load("contracts", "native-transfer-current-rpc");
  const qualification = await load("workflows/bridges", "native-transfer-qualification-2026-09-15");
  const evidence = await load("workflows/bridges", "bridge-native-evidence");
  const transfer = objects(evidence.completedTransfers, "transfers").find(
    (t) => t.sourceNetwork === (inbound ? "ethereum-mainnet" : "mezo-mainnet"),
  );
  assert(transfer);
  const account = parseAddress(`0x${"a".repeat(40)}`),
    recipient = parseAddress(`0x${"b".repeat(40)}`);
  const sourceHash = parseHash32(`0x${"7".repeat(64)}`),
    destinationHash = parseHash32(`0x${"8".repeat(64)}`);
  const sent: ExactTransaction[] = [];
  const input: NativeTransferQuoteInput = {
    account,
    recipient,
    amount: inbound ? 100_000_000n : 200_000_000_000_000n,
    maxEstimatedDestinationFee: inbound ? 0n : 30_000_000_000_000n,
    sourceGasReserve: 10_000n,
    maxSourceAgeBlocks: 2n,
    maxDestinationAgeBlocks: 2n,
  };
  function side(
    networkId: "ethereum-mainnet" | "mezo-mainnet",
    tokenValue: unknown,
    transactionHash: Hash32,
  ) {
    const token = parseAddress(tokenValue),
      contractId =
        networkId === "ethereum-mainnet"
          ? "bridge.native-mezo-bridge"
          : "bridge.native-assets-precompile";
    const row = objects(capture.records, "records").find(
      (r) => r.stage === "runtime" && object(r.coordinate, "coordinate").networkId === networkId,
    );
    assert(row);
    const coordinate = object(row.coordinate, "coordinate"),
      blockNumber = BigInt(text(coordinate.blockNumber, "block")),
      blockHash = parseHash32(coordinate.blockHash);
    const contract = resolveContract({ contractId, networkId, blockNumber });
    const profile = getNativeTokenProfile({ networkId, tokenAddress: token });
    const probes = objects(capture.requests, "requests").filter(
      (p) => p.networkId === networkId && p.response !== undefined,
    );
    const state = {
      head: blockNumber,
      reorg: false,
      mined: false,
      reverted: false,
      uncertain: false,
      tokenBalance: 10n ** 24n,
      allowance: 10n ** 24n,
      nativeBalance: 10n ** 24n,
      simulateSuccess: true,
      receiptLogs: [] as unknown[],
      transaction: undefined as Record<string, unknown> | undefined,
    };
    const overrides = new Map<string, readonly AbiValue[]>();
    const calls: { method: string; params: readonly unknown[] }[] = [];
    const operation = resolveOperation({
      contractId,
      networkId,
      blockNumber,
      functionName: networkId === "ethereum-mainnet" ? "bridgeERC20" : "bridgeOut",
    }).functionAbi;
    const request: RpcRequest = async ({ method, params }) => {
      calls.push({ method, params });
      if (method === "eth_blockNumber") return toRpcQuantity(state.head);
      if (method === "eth_getBalance") return toRpcQuantity(state.nativeBalance);
      if (method === "eth_getTransactionCount") return "0x0";
      if (method === "eth_getCode" && params[0] === account) return "0x";
      if (method === "eth_getTransactionReceipt")
        return state.mined
          ? {
              transactionHash,
              from: account,
              to: contract.address,
              blockNumber: toRpcQuantity(blockNumber),
              blockHash,
              transactionIndex: "0x0",
              status: state.reverted ? "0x0" : "0x1",
              logs: state.receiptLogs,
            }
          : null;
      if (method === "eth_getTransactionByHash") {
        if (state.transaction) return state.transaction;
        const call = sent.at(-1);
        assert(call, "a source call must be submitted first");
        return {
          hash: transactionHash,
          from: call.from,
          to: call.to,
          input: call.data,
          value: toRpcQuantity(call.value),
          nonce: toRpcQuantity(call.nonce),
          chainId: toRpcQuantity(call.chainId),
          blockNumber: toRpcQuantity(blockNumber),
          blockHash,
          transactionIndex: "0x0",
        };
      }
      if (method === "eth_call") {
        const call = object(params[0], "call"),
          data = text(call.data, "data");
        if (
          call.from === account &&
          call.to === contract.address &&
          data.slice(0, 10) ===
            codec
              .encodeFunction(
                operation,
                networkId === "ethereum-mainnet"
                  ? [token, input.amount, recipient]
                  : [token, input.amount, 0n, recipient],
              )
              .slice(0, 10)
        ) {
          return nativeReturn(
            operation,
            networkId === "mezo-mainnet" ? [state.simulateSuccess] : [],
          );
        }
        const entries =
          call.to === token ? [...getTokenInterface(), ...profile.extraReadAbi] : contract.readAbi;
        for (const entry of entries.filter((e) => e.type === "function")) {
          let args: readonly AbiValue[];
          try {
            args = codec.decodeCalldata(entry, data);
          } catch {
            continue;
          }
          const name = text(entry.name, "name");
          const overridden = overrides.get(name);
          if (overridden) return nativeReturn(entry, overridden);
          if (call.to === token && name === "balanceOf")
            return nativeReturn(entry, [
              parseAddress(args[0]) === account ? state.tokenBalance : 10n ** 24n,
            ]);
          if (call.to === token && name === "allowance")
            return nativeReturn(entry, [state.allowance]);
          if (call.to === token && name === "minter")
            return nativeReturn(entry, [
              parseAddress(object(qualification.client, "client").mintAuthority),
            ]);
          if (name === "percentWithdrawalFeeExempts") return nativeReturn(entry, [false]);
        }
      }
      const probe = probes.find((p) => {
        if (p.method !== method) return false;
        const expected = values(p.params, "params");
        if (method === "eth_getBlockByNumber") return parseRpcQuantity(expected[0]) === blockNumber;
        if (method === "eth_getCode") return expected[0] === params[0];
        if (method === "eth_getStorageAt")
          return expected[0] === params[0] && expected[1] === params[1];
        if (method === "eth_call")
          return (
            object(expected[0], "expected").to === object(params[0], "actual").to &&
            object(expected[0], "expected").data === object(params[0], "actual").data
          );
        return JSON.stringify(expected) === JSON.stringify(params);
      });
      assert(probe, `uncaptured Native ${networkId} ${method}`);
      const result = structuredClone(object(probe.response, "response").result);
      if (method === "eth_getBlockByNumber") {
        const block = object(result, "block");
        block.number = params[0];
        block.hash = state.reorg ? sourceHash : blockHash;
      }
      return result;
    };
    return {
      networkId,
      token,
      contract,
      operation,
      blockNumber,
      blockHash,
      transactionHash,
      state,
      overrides,
      calls,
      transport: { ...createRpcTransport({ id: networkId, request }) },
    };
  }
  const source = side(
      inbound ? "ethereum-mainnet" : "mezo-mainnet",
      transfer.sourceToken,
      sourceHash,
    ),
    destination = side(
      inbound ? "mezo-mainnet" : "ethereum-mainnet",
      transfer.destinationToken,
      destinationHash,
    );
  const mezoRuntime = objects(capture.records, "records").find(
    (r) => r.stage === "runtime" && object(r.coordinate, "coordinate").networkId === "mezo-mainnet",
  );
  assert(mezoRuntime);
  const client = { version: text(mezoRuntime.clientVersion, "captured Mezo version") };
  const config = {
    routeId: inbound
      ? ("mezo-native-usdc-ethereum-to-mezo" as const)
      : ("mezo-native-btc-mezo-to-ethereum" as const),
    sourceTransport: source.transport,
    destinationTransport: destination.transport,
    getMezoClientVersion: async () => client.version,
  };
  const store = createMemorySubmissionStore();
  const execution = createExecutionClient({
    network: getNetwork(source.networkId),
    registry: createContractRegistry(),
    transport: source.transport,
    signer: {
      getChainId: async () => getNetwork(source.networkId).evmChainId,
      getAddress: async () => account,
      sendTransaction: async (call) => {
        sent.push(call);
        if (source.state.uncertain) throw new Error("lost submission response");
        return sourceHash;
      },
    },
    store,
    maxBlockAge: 2n,
    confirmations: 1n,
  });
  function log(
    endpoint: typeof source,
    name: string,
    args: readonly AbiValue[],
    index: number,
    tokenEvent = false,
  ) {
    const entry = tokenEvent
      ? getTokenInterface().find((e) => e.type === "event" && e.name === name)
      : resolveEvent({
          contractId: endpoint.contract.contractId,
          networkId: endpoint.networkId,
          blockNumber: endpoint.blockNumber,
          eventName: name,
        });
    assert(entry);
    const inputs = objects(entry.inputs, "event inputs");
    const topics = [
      keccak256(
        parseHexData(
          `0x${Buffer.from(`${name}(${inputs.map((p) => text(p.type, "type")).join(",")})`).toString("hex")}`,
        ),
      ),
    ];
    const nonIndexed: Record<string, unknown>[] = [];
    const data: AbiValue[] = [];
    for (const [i, part] of inputs.entries()) {
      const value = args[i];
      assert(value !== undefined);
      if (part.indexed)
        topics.push(
          part.type === "bytes"
            ? keccak256(parseHexData(value))
            : parseHash32(
                `0x${codec.encodeFunction({ type: "function", name: "fixture", inputs: [part], outputs: [], stateMutability: "pure" }, [value]).slice(10)}`,
              ),
        );
      else {
        nonIndexed.push(part);
        data.push(value);
      }
    }
    return {
      address: tokenEvent ? endpoint.token : endpoint.contract.address,
      topics,
      data: parseHexData(
        `0x${codec.encodeFunction({ type: "function", name: "fixture", inputs: nonIndexed, outputs: [], stateMutability: "pure" }, data).slice(10)}`,
      ),
      transactionHash: endpoint.transactionHash,
      blockNumber: toRpcQuantity(endpoint.blockNumber),
      blockHash: endpoint.blockHash,
      transactionIndex: "0x0",
      logIndex: toRpcQuantity(BigInt(index)),
      removed: false,
    };
  }
  function sourceLogs() {
    return inbound
      ? [
          log(source, "AssetsLocked", [42n, recipient, source.token, input.amount], 0),
          log(
            source,
            "Transfer",
            [account, parseAddress(source.contract.address), input.amount],
            1,
            true,
          ),
        ]
      : [
          log(
            source,
            "AssetsUnlocked",
            [42n, recipient, destination.token, account, input.amount, 0n],
            0,
          ),
        ];
  }
  function outboundLogs(
    fee = 27_000_000_000_000n,
    failed = false,
    collector: Address = parseAddress(`0x${"c".repeat(40)}`),
  ) {
    const logs = [
      log(
        destination,
        "AssetsUnlockConfirmed",
        [42n, recipient, destination.token, input.amount, 0n],
        0,
      ),
    ];
    if (fee > 0n)
      logs.push(
        log(
          destination,
          "WithdrawalFeeCollected",
          [destination.token, collector, fee],
          logs.length,
        ),
        log(
          destination,
          "Transfer",
          [parseAddress(destination.contract.address), collector, fee],
          logs.length + 1,
          true,
        ),
      );
    logs.push(
      failed
        ? log(
            destination,
            "WithdrawalFailed",
            [42n, destination.token, recipient, input.amount - fee],
            logs.length,
          )
        : log(
            destination,
            "Transfer",
            [parseAddress(destination.contract.address), recipient, input.amount - fee],
            logs.length,
            true,
          ),
    );
    return logs;
  }
  return {
    config,
    input,
    source,
    destination,
    execution,
    store,
    sent,
    client,
    log,
    sourceLogs,
    outboundLogs,
    mintAuthority: parseAddress(object(qualification.client, "client").mintAuthority),
  };
}
export function nativeTransferFixture(
  inbound = true,
): ReturnType<typeof buildNativeTransferFixture> {
  return buildNativeTransferFixture(inbound);
}
