import { getNetwork } from "@mezo-dev-kit/chains";
import {
  getNativeBridgeCalldataAbi,
  resolveContract,
  resolveHistoricalContractEvidence,
} from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, HistoricalContractEvidence } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionReceipt, ReadCoordinate } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { Address, AbiValue, AbiEventValue, Hash32 } from "@mezo-dev-kit/evm";
import type { NATIVE_ROUTES } from "./model.generated.ts";
import { checkNativeClient, transferTokenRuntime } from "./native-transfer-runtime.ts";
import type {
  NativeObservationIssue,
  NativeObservationTransport,
  NativeObserverErrorCode,
  NativeReceiptAnchor,
  NativeReceiptObservation,
} from "./native-types.ts";
/**
 * Typed bridges failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class NativeObserverError extends Error {
  readonly code: NativeObserverErrorCode;
  readonly stage: string;
  constructor(
    code: NativeObserverErrorCode,
    stage: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "NativeObserverError";
    this.code = code;
    this.stage = stage;
  }
}
export const nativeCodec = createAbiCodec();
export type NativeEndpoint =
  (typeof NATIVE_ROUTES)[number]["source"] | (typeof NATIVE_ROUTES)[number]["destination"];
export interface NativeContext {
  readonly endpoint: NativeEndpoint;
  readonly transport: NativeObservationTransport;
  readonly required: bigint;
  readonly signal?: AbortSignal;
  readonly current?: { readonly getMezoClientVersion: () => Promise<unknown> };
}
type NativeContractEvidence =
  | HistoricalContractEvidence
  | (Pick<
      HistoricalContractEvidence,
      "contractId" | "address" | "coordinate" | "readAbi" | "calldataAbi"
    > & {
      readonly kind: "current-native-contract-evidence";
      readonly current: ReturnType<typeof resolveContract>;
    });
export interface InspectedNative {
  observation: NativeReceiptObservation;
  receipt: ExecutionReceipt | null;
  transaction: Record<string, unknown> | null;
  contract: Readonly<NativeContractEvidence> | null;
  readonly auxiliary: { blockNumber: bigint; blockHash: Hash32 }[];
}
export function requireEvidence(
  value: unknown,
  message: string,
  code: NativeObserverErrorCode = "InvalidEvidence",
): asserts value {
  if (!value) throw new NativeObserverError(code, "native-evidence", message);
}
export function nativeObject(value: unknown): Record<string, unknown> {
  requireEvidence(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "expected evidence object",
  );
  return value as Record<string, unknown>;
}
export async function nativeRequest<T>(
  ctx: Pick<NativeContext, "signal">,
  stage: string,
  read: () => T | PromiseLike<T>,
): Promise<T> {
  ctx.signal?.throwIfAborted();
  try {
    const result = await read();
    ctx.signal?.throwIfAborted();
    return result;
  } catch (cause) {
    ctx.signal?.throwIfAborted();
    throw new NativeObserverError("TransportFailure", stage, "observation transport failed", {
      cause,
    });
  }
}
export async function nativeChain(ctx: NativeContext): Promise<void> {
  requireEvidence(
    parseUint(await nativeRequest(ctx, "chain", () => ctx.transport.getChainId())) ===
      getNetwork(ctx.endpoint.networkId).evmChainId,
    "transport chain differs from route",
    "ChainMismatch",
  );
}
export function nativeIssue(error: unknown): Readonly<NativeObservationIssue> {
  return Object.freeze(
    error instanceof NativeObserverError
      ? { code: error.code, stage: error.stage, message: error.message }
      : {
          code: "InvalidEvidence",
          stage: "native-evidence",
          message: "invalid Native receipt, calldata or state evidence",
        },
  );
}
export function nativeFailed(
  value: NativeReceiptObservation,
  error: unknown,
): NativeReceiptObservation {
  const issue = nativeIssue(error);
  return {
    ...value,
    state: issue.code === "TransportFailure" ? "unavailable" : "invalid",
    proof: "none",
    settlement: null,
    issue,
  };
}
export async function nativeCanonical(
  ctx: NativeContext,
  anchor: { blockNumber: bigint; blockHash: Hash32 },
): Promise<boolean> {
  const block = await nativeRequest(ctx, "block", () => ctx.transport.getBlock(anchor.blockNumber));
  if (block === null || block === undefined) return false;
  requireEvidence(parseUint(block.number) === anchor.blockNumber, "block number mismatch");
  return parseHash32(block.hash) === anchor.blockHash;
}
export async function nativeContract(
  ctx: NativeContext,
  blockNumber: bigint,
): Promise<Readonly<NativeContractEvidence>> {
  try {
    if (ctx.current) {
      const input = {
        contractId: ctx.endpoint.contractId,
        networkId: ctx.endpoint.networkId,
        blockNumber,
      };
      const current = resolveContract(input);
      const block = await nativeRequest(ctx, "current-block", () =>
        ctx.transport.getBlock(blockNumber),
      );
      requireEvidence(
        block && parseUint(block.number) === blockNumber,
        "current Native block unavailable",
      );
      return Object.freeze({
        kind: "current-native-contract-evidence",
        contractId: current.contractId,
        address: parseAddress(current.address),
        coordinate: Object.freeze({ blockNumber, blockHash: parseHash32(block.hash) }),
        readAbi: current.readAbi,
        calldataAbi: getNativeBridgeCalldataAbi(input),
        current,
      });
    }
    return resolveHistoricalContractEvidence({
      contractId: ctx.endpoint.contractId,
      networkId: ctx.endpoint.networkId,
      blockNumber,
    });
  } catch (cause) {
    throw new NativeObserverError(
      "RegistryUnavailable",
      "native-contract",
      "Native generation evidence unavailable at this coordinate",
      { cause },
    );
  }
}
export function nativeCoordinate(
  ctx: NativeContext,
  contract: NativeContractEvidence,
): Readonly<ReadCoordinate> {
  return {
    networkId: ctx.endpoint.networkId,
    chainId: getNetwork(ctx.endpoint.networkId).evmChainId,
    ...contract.coordinate,
  };
}
export async function nativeRuntime(
  ctx: NativeContext,
  contract: NativeContractEvidence,
): Promise<void> {
  if (contract.kind === "current-native-contract-evidence") {
    const coordinate = nativeCoordinate(ctx, contract);
    if (ctx.endpoint.networkId === "mezo-mainnet") {
      requireEvidence(ctx.current, "current Native client reader missing");
      await checkNativeClient(ctx.current.getMezoClientVersion);
    }
    await verifyContractRuntime({
      contract: contract.current,
      transport: ctx.transport,
      coordinate,
    });
    await transferTokenRuntime(ctx.endpoint, ctx.transport, coordinate);
    return;
  }
  const coordinate = nativeCoordinate(ctx, contract),
    runtime = contract.runtime;
  requireEvidence(
    keccak256(
      parseHexData(
        await nativeRequest(ctx, "code", () =>
          ctx.transport.getCode(runtime.codeAddress, coordinate),
        ),
      ),
    ) === runtime.codeHash,
    "historical executable mismatch",
  );
  if (runtime.implementationAddress !== null && runtime.implementationSlot !== null) {
    const slot = runtime.implementationSlot;
    const value = parseHash32(
      await nativeRequest(ctx, "implementation", () =>
        ctx.transport.getStorage(contract.address, slot, coordinate),
      ),
    );
    requireEvidence(
      value === `0x${"0".repeat(24)}${runtime.implementationAddress.slice(2)}`,
      "historical implementation mismatch",
    );
  }
}
export function nativeEntry(
  entries: readonly ContractAbiEntry[],
  name: string,
  type = "function",
): ContractAbiEntry {
  const found = entries.filter((e) => e.type === type && e.name === name);
  requireEvidence(found.length === 1, "generation ABI member unavailable");
  const entry = found[0];
  requireEvidence(entry, "generation ABI member unavailable");
  return entry;
}
export async function nativeRead(
  ctx: NativeContext,
  contract: NativeContractEvidence,
  entry: ContractAbiEntry,
  args: readonly AbiValue[] = [],
  address: Address = contract.address,
): Promise<readonly AbiValue[]> {
  const request = {
    ...nativeCoordinate(ctx, contract),
    contractId: contract.contractId,
    address,
    data: nativeCodec.encodeFunction(entry, args),
  };
  return nativeCodec.decodeFunction(
    entry,
    await nativeRequest(ctx, "state", () => ctx.transport.read(request)),
  );
}
export function nativeEvents(
  receipt: ExecutionReceipt,
  contract: NativeContractEvidence,
  name: string,
  address: Address = contract.address,
  abi: readonly ContractAbiEntry[] = contract.readAbi,
): readonly { readonly values: readonly AbiEventValue[]; readonly logIndex: bigint }[] {
  const entry = nativeEntry(abi, name, "event");
  return getReceiptLogs(receipt, address).flatMap((log) => {
    if (log.topics.length === 0) return [];
    const decoded = nativeCodec.decodeEventWithHashes(entry, log);
    return decoded === null ? [] : [{ values: decoded, logIndex: log.logIndex }];
  });
}
export async function inspectNative(
  ctx: NativeContext,
  hash: Hash32,
  previous?: NativeReceiptAnchor,
): Promise<InspectedNative> {
  const result: InspectedNative = {
    observation: {
      transactionHash: hash,
      anchor: null,
      state: "missing",
      confirmations: null,
      requiredConfirmations: ctx.required,
      proof: "none",
      settlement: null,
      issue: null,
    },
    receipt: null,
    transaction: null,
    contract: null,
    auxiliary: [],
  };
  try {
    await nativeChain(ctx);
    const changed = previous !== undefined && !(await nativeCanonical(ctx, previous));
    const raw = await nativeRequest(ctx, "receipt", () => ctx.transport.getReceipt(hash));
    if (raw === null) {
      if (changed)
        result.observation = { ...result.observation, state: "reorged", anchor: previous ?? null };
      return result;
    }
    const row = nativeObject(raw),
      blockNumber = parseRpcQuantity(row.blockNumber),
      blockHash = parseHash32(row.blockHash),
      status = parseRpcQuantity(row.status);
    requireEvidence(
      parseHash32(row.transactionHash) === hash &&
        status <= 1n &&
        Array.isArray(row.logs) &&
        row.logs.length <= 2048,
      "receipt identity, status or log bounds differ",
    );
    let bytes = 0;
    const logs: readonly unknown[] = row.logs;
    for (const value of logs) {
      const log = nativeObject(value),
        data = parseHexData(log.data);
      requireEvidence(
        Array.isArray(log.topics) && log.topics.length <= 4 && data.length <= 524290,
        "receipt log bounds exceeded",
      );
      bytes += (data.length - 2) / 2 + log.topics.length * 32;
      requireEvidence(bytes <= 8 * 1024 * 1024, "receipt byte budget exceeded");
    }
    const anchor = Object.freeze({ transactionHash: hash, blockNumber, blockHash }),
      head = parseUint(await nativeRequest(ctx, "head", () => ctx.transport.getBlockNumber())),
      confirmations = head < blockNumber ? 0n : head - blockNumber + 1n;
    result.observation = {
      ...result.observation,
      anchor,
      confirmations,
      state: status === 0n ? "reverted" : confirmations >= ctx.required ? "confirmed" : "included",
    };
    if (
      changed ||
      (previous && (previous.blockNumber !== blockNumber || previous.blockHash !== blockHash)) ||
      head < blockNumber ||
      !(await nativeCanonical(ctx, anchor))
    ) {
      result.observation = { ...result.observation, state: "reorged" };
      return result;
    }
    if (status === 0n) return result;
    const contract = await nativeContract(ctx, blockNumber);
    requireEvidence(
      contract.coordinate.blockHash === blockHash,
      "receipt differs from pinned historical block",
    );
    await nativeRuntime(ctx, contract);
    const transaction = nativeObject(
      await nativeRequest(ctx, "transaction", () => ctx.transport.getTransaction(hash)),
    );
    requireEvidence(
      parseHash32(transaction.hash) === hash &&
        parseHash32(transaction.blockHash) === blockHash &&
        parseRpcQuantity(transaction.blockNumber) === blockNumber &&
        parseAddress(transaction.to) === contract.address,
      "transaction identity differs",
    );
    requireEvidence(
      parseRpcQuantity(transaction.chainId) === getNetwork(ctx.endpoint.networkId).evmChainId &&
        parseRpcQuantity(transaction.value) === 0n,
      "source/system call chain or value differs",
    );
    requireEvidence(
      parseRpcQuantity(transaction.transactionIndex) === parseRpcQuantity(row.transactionIndex),
      "transaction index differs",
    );
    parseAddress(transaction.from);
    const data = parseHexData(transaction.input);
    requireEvidence(data.length <= 262146, "transaction calldata exceeds 128 KiB");
    result.receipt = { ...anchor, logs };
    result.transaction = transaction;
    result.contract = contract;
  } catch (error) {
    ctx.signal?.throwIfAborted();
    result.observation = nativeFailed(result.observation, error);
  }
  return result;
}
export async function finishNative(ctx: NativeContext, value: InspectedNative): Promise<void> {
  try {
    await nativeChain(ctx);
    const anchors = [
      ...(value.observation.anchor ? [value.observation.anchor] : []),
      ...value.auxiliary,
    ];
    for (const anchor of anchors)
      if (!(await nativeCanonical(ctx, anchor))) {
        value.observation = {
          ...value.observation,
          state: "reorged",
          proof: "none",
          settlement: null,
        };
        return;
      }
  } catch (error) {
    ctx.signal?.throwIfAborted();
    value.observation = nativeFailed(value.observation, error);
  }
}
