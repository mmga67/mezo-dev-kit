import { getNetwork } from "@mezo-dev-kit/chains";
import { resolveEvent, resolveOperation } from "@mezo-dev-kit/contracts";
import type {
  ExactTransaction,
  ReadCoordinate,
  RpcRequest,
  RpcTransport,
} from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { redemptionRequire } from "./errors.ts";

export interface RedemptionAmounts {
  readonly attemptedAmount: bigint;
  readonly actualAmount: bigint;
  readonly grossCollateral: bigint;
  readonly collateralFee: bigint;
  readonly netCollateral: bigint;
}
export interface RedemptionTraceInput {
  readonly call: Readonly<ExactTransaction>;
  readonly coordinate: Readonly<ReadCoordinate>;
}
export interface RedemptionOutputSimulator {
  simulate(input: RedemptionTraceInput): Promise<Readonly<RedemptionAmounts>>;
}
export interface RedemptionTraceConfig {
  readonly request: RpcRequest;
  readonly transport: RpcTransport;
  readonly providerId: string;
  readonly timeoutMs: number;
  readonly maxFrames: number;
  readonly maxLogs: number;
  readonly maxDepth: number;
  readonly maxDataBytes: number;
}
export interface RedemptionLog {
  readonly address: `0x${string}`;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
}
const codec = createAbiCodec();
function object(value: unknown): Record<string, unknown> {
  redemptionRequire(
    !!value && typeof value === "object" && !Array.isArray(value),
    "SimulationFailed",
    "invalid trace object",
  );
  return value as Record<string, unknown>;
}
function array(value: unknown, max: number): readonly unknown[] {
  redemptionRequire(
    Array.isArray(value) && value.length <= max,
    "LimitExceeded",
    "trace array exceeds budget",
  );
  return value as readonly unknown[];
}
export function decodeRedemptionAmounts(input: {
  readonly logs: readonly RedemptionLog[];
  readonly contract: `0x${string}`;
  readonly coordinate: ReadCoordinate;
}): Readonly<RedemptionAmounts> {
  const address = parseAddress(input.contract),
    operation = resolveOperation({
      contractId: "musd.trove-manager",
      networkId: input.coordinate.networkId,
      blockNumber: input.coordinate.blockNumber,
      functionName: "redeemCollateral",
    });
  redemptionRequire(
    operation.contract.address === address,
    "IdentityMismatch",
    "redemption log source differs",
  );
  const event = resolveEvent({
    contractId: "musd.trove-manager",
    networkId: input.coordinate.networkId,
    blockNumber: input.coordinate.blockNumber,
    eventName: "Redemption",
  });
  const rows = input.logs
      .filter((log) => parseAddress(log.address) === address)
      .map((log) => codec.decodeEvent(event, log))
      .filter((row) => row !== null),
    row = rows[0];
  redemptionRequire(
    rows.length === 1 && row !== undefined,
    "SimulationFailed",
    "exactly one Redemption event required",
  );
  const attemptedAmount = parseUint(row[0]),
    actualAmount = parseUint(row[1]),
    grossCollateral = parseUint(row[2]),
    collateralFee = parseUint(row[3]);
  redemptionRequire(
    actualAmount > 0n &&
      actualAmount <= attemptedAmount &&
      grossCollateral > 0n &&
      collateralFee <= grossCollateral,
    "SimulationFailed",
    "invalid redemption amount relationships",
  );
  return Object.freeze({
    attemptedAmount,
    actualAmount,
    grossCollateral,
    collateralFee,
    netCollateral: grossCollateral - collateralFee,
  });
}
/** Strict callTracer/withLog adapter. A compatible node is required; no silent eth_call fallback. */
export function createRedemptionTraceSimulator(
  inputConfig: RedemptionTraceConfig,
): Readonly<RedemptionOutputSimulator> {
  const config = Object.freeze({ ...inputConfig });
  redemptionRequire(
    typeof config.providerId === "string" && config.providerId.trim().length > 0,
    "InvalidInput",
    "trace provider identity required",
  );
  for (const [value, ceiling] of [
    [config.timeoutMs, 60000],
    [config.maxFrames, 4096],
    [config.maxLogs, 4096],
    [config.maxDepth, 64],
    [config.maxDataBytes, 4 * 1024 * 1024],
  ] as const)
    redemptionRequire(
      Number.isSafeInteger(value) && value > 0 && value <= ceiling,
      "InvalidInput",
      "invalid trace budget",
    );
  return Object.freeze({
    async simulate(input) {
      const { coordinate, call } = input;
      const network = getNetwork(coordinate.networkId);
      redemptionRequire(
        coordinate.networkId === "mezo-mainnet" &&
          parseUint(call.chainId) === network.evmChainId &&
          parseUint(coordinate.chainId) === call.chainId,
        "IdentityMismatch",
        "trace network differs",
      );
      parseUint(coordinate.blockNumber);
      parseHash32(coordinate.blockHash);
      parseUint(call.nonce);
      const from = parseAddress(call.from),
        to = parseAddress(call.to),
        data = parseHexData(call.data),
        value = parseUint(call.value);
      redemptionRequire(value === 0n, "InvalidInput", "redemption sends zero native value");
      const operation = resolveOperation({
        contractId: "musd.trove-manager",
        networkId: coordinate.networkId,
        blockNumber: coordinate.blockNumber,
        functionName: "redeemCollateral",
      });
      redemptionRequire(
        to === operation.contract.address,
        "IdentityMismatch",
        "trace destination differs",
      );
      const args = codec.decodeFunction(
        { ...operation.functionAbi, outputs: operation.functionAbi.inputs },
        `0x${data.slice(10)}`,
      );
      redemptionRequire(
        codec.encodeFunction(operation.functionAbi, args) === data &&
          parseUint(args[0]) > 0n &&
          parseUint(args[5]) > 0n &&
          parseUint(args[5]) <= 64n,
        "InvalidInput",
        "bounded canonical redemption call required",
      );
      async function anchor() {
        const [chain, block] = await Promise.all([
          config.request({ method: "eth_chainId", params: [] }),
          config.request({
            method: "eth_getBlockByNumber",
            params: [toRpcQuantity(coordinate.blockNumber), false],
          }),
        ]);
        const header = object(block);
        redemptionRequire(
          parseRpcQuantity(chain) === call.chainId &&
            parseRpcQuantity(header.number) === coordinate.blockNumber &&
            parseHash32(header.hash) === coordinate.blockHash &&
            parseUint(await config.transport.getChainId()) === call.chainId &&
            (await config.transport.getBlock(coordinate.blockNumber))?.hash ===
              coordinate.blockHash,
          "IdentityMismatch",
          "trace anchor changed",
        );
      }
      await anchor();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let raw: unknown;
      try {
        raw = await Promise.race([
          config.request({
            method: "debug_traceCall",
            params: [
              { from, to, data, value: toRpcQuantity(value), nonce: toRpcQuantity(call.nonce) },
              toRpcQuantity(coordinate.blockNumber),
              {
                tracer: "callTracer",
                tracerConfig: { withLog: true },
                timeout: `${config.timeoutMs}ms`,
              },
            ],
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error("trace timeout"));
            }, config.timeoutMs);
          }),
        ]);
      } catch {
        redemptionRequire(
          false,
          "SimulationUnavailable",
          "output tracing unavailable or timed out; compatible provider required",
        );
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      const root = object(raw);
      redemptionRequire(
        root.type === "CALL" &&
          parseAddress(root.from) === from &&
          parseAddress(root.to) === to &&
          parseHexData(root.input) === data &&
          parseRpcQuantity(root.value) === value &&
          root.error === undefined &&
          (root.output === undefined || parseHexData(root.output).length === 2),
        "SimulationFailed",
        "trace root identity or success differs",
      );
      let frames = 0,
        bytes = 0,
        count = 0;
      const logs: RedemptionLog[] = [];
      function walk(rawFrame: unknown, depth: number, reverted: boolean) {
        redemptionRequire(
          ++frames <= config.maxFrames && depth <= config.maxDepth,
          "LimitExceeded",
          "trace frame/depth budget exceeded",
        );
        const frame = object(rawFrame),
          failed = reverted || frame.error !== undefined;
        for (const field of [frame.input, frame.output])
          if (field !== undefined) {
            bytes += (parseHexData(field).length - 2) / 2;
            redemptionRequire(
              bytes <= config.maxDataBytes,
              "LimitExceeded",
              "trace byte budget exceeded",
            );
          }
        for (const rawLog of array(frame.logs === undefined ? [] : frame.logs, config.maxLogs)) {
          redemptionRequire(
            ++count <= config.maxLogs,
            "LimitExceeded",
            "trace log budget exceeded",
          );
          const log = object(rawLog),
            topics = array(log.topics, 4).map((topic) => parseHash32(topic)),
            logData = parseHexData(log.data),
            address = parseAddress(log.address);
          bytes += (logData.length - 2) / 2 + topics.length * 32;
          redemptionRequire(
            bytes <= config.maxDataBytes,
            "LimitExceeded",
            "trace byte budget exceeded",
          );
          if (!failed)
            logs.push(Object.freeze({ address, topics: Object.freeze(topics), data: logData }));
        }
        for (const child of array(frame.calls === undefined ? [] : frame.calls, config.maxFrames))
          walk(child, depth + 1, failed);
      }
      walk(root, 0, false);
      const result = decodeRedemptionAmounts({ logs, contract: to, coordinate });
      redemptionRequire(
        result.attemptedAmount === parseUint(args[0]),
        "SimulationFailed",
        "simulated attempted amount differs from exact call",
      );
      await anchor();
      return result;
    },
  } satisfies RedemptionOutputSimulator);
}
