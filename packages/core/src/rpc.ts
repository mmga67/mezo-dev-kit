import {
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { CoreReadTransport, ReadCoordinate } from "./read-client.ts";
import type { ExactTransaction, ExecutionSigner, ExecutionTransport } from "./execution-types.ts";

/** A wallet/provider request boundary. The application owns URLs, credentials and cancellation. */
export type RpcRequest = (input: {
  readonly method: string;
  readonly params: readonly unknown[];
}) => Promise<unknown>;

/**
 * Core ports over an injected JSON-RPC request function; the application owns endpoint,
 * cancellation, timeout and retry policy.
 */
export interface RpcTransport extends CoreReadTransport, ExecutionTransport {
  /**
   * Read native currency balance in base units at the supplied block coordinate.
   */
  getBalance(address: `0x${string}`, coordinate: ReadCoordinate): Promise<bigint>;
  /**
   * Read Unix seconds and verify the returned block hash matches the supplied coordinate.
   */
  getBlockTimestamp(coordinate: ReadCoordinate): Promise<bigint>;
  /**
   * Read runtime bytecode at the supplied block; domain callers compare it with expected
   * identity.
   */
  getCode(address: `0x${string}`, coordinate: ReadCoordinate): Promise<`0x${string}`>;
  /**
   * Read one storage slot at the supplied block; the domain owns slot layout and
   * interpretation.
   */
  getStorage(
    address: `0x${string}`,
    slot: `0x${string}`,
    coordinate: ReadCoordinate,
  ): Promise<`0x${string}`>;
}

export function rpcObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("expected RPC object");
  return value as Record<string, unknown>;
}

export function transactionRpc(call: ExactTransaction): Readonly<Record<string, string>> {
  return Object.freeze({
    from: call.from,
    to: call.to,
    data: call.data,
    value: toRpcQuantity(call.value),
    nonce: toRpcQuantity(call.nonce),
    chainId: toRpcQuantity(call.chainId),
  });
}

/**
 * Adapt an injected JSON-RPC request function to Core read and execution ports.
 *
 * @param config - Diagnostic transport ID and application-owned request function.
 * @remarks
 * The adapter encodes RPC quantities and validates responses. The application owns
 * endpoint selection, timeouts, cancellation and request retries. Construction
 * performs no RPC and does not connect a wallet.
 */
export function createRpcTransport(config: {
  readonly id: string;
  readonly request: RpcRequest;
}): Readonly<RpcTransport> {
  const { request } = config;
  if (typeof request !== "function" || typeof config.id !== "string" || config.id.length === 0)
    throw new TypeError("RPC transport requires id and request");
  async function getBlock(number: bigint) {
    const raw = await request({
      method: "eth_getBlockByNumber",
      params: [toRpcQuantity(number), false],
    });
    if (raw === null) return null;
    const block = rpcObject(raw);
    if (parseRpcQuantity(block.number) !== number)
      throw new TypeError("RPC returned a different block number");
    return Object.freeze({
      number: parseRpcQuantity(block.number),
      hash: parseHash32(block.hash),
      timestamp: parseRpcQuantity(block.timestamp),
    });
  }
  async function pinned<T>(coordinate: ReadCoordinate, action: () => Promise<T>): Promise<T> {
    const before = await getBlock(coordinate.blockNumber);
    if (before?.hash !== coordinate.blockHash)
      throw new Error("pinned block is no longer canonical");
    const value = await action();
    const after = await getBlock(coordinate.blockNumber);
    if (after?.hash !== coordinate.blockHash)
      throw new Error("pinned block changed during RPC request");
    return value;
  }
  return Object.freeze({
    id: config.id,
    getChainId: async () => parseRpcQuantity(await request({ method: "eth_chainId", params: [] })),
    getBlockNumber: async () =>
      parseRpcQuantity(await request({ method: "eth_blockNumber", params: [] })),
    getBlock,
    getBalance: async (address, coordinate) =>
      pinned(coordinate, async () =>
        parseRpcQuantity(
          await request({
            method: "eth_getBalance",
            params: [parseAddress(address), toRpcQuantity(coordinate.blockNumber)],
          }),
        ),
      ),
    read: async (input) =>
      pinned(input, async () =>
        parseHexData(
          await request({
            method: "eth_call",
            params: [{ to: input.address, data: input.data }, toRpcQuantity(input.blockNumber)],
          }),
        ),
      ),
    getBlockTimestamp: async (coordinate) => {
      const block = await getBlock(coordinate.blockNumber);
      if (block?.hash !== coordinate.blockHash) throw new Error("timestamp block mismatch");
      return block.timestamp;
    },
    getCode: async (address, coordinate) =>
      pinned(coordinate, async () =>
        parseHexData(
          await request({
            method: "eth_getCode",
            params: [parseAddress(address), toRpcQuantity(coordinate.blockNumber)],
          }),
        ),
      ),
    getStorage: async (address, slot, coordinate) =>
      pinned(coordinate, async () =>
        parseHash32(
          await request({
            method: "eth_getStorageAt",
            params: [
              parseAddress(address),
              parseHash32(slot),
              toRpcQuantity(coordinate.blockNumber),
            ],
          }),
        ),
      ),
    simulate: async (call, coordinate) =>
      pinned(coordinate, async () =>
        parseHexData(
          await request({
            method: "eth_call",
            params: [transactionRpc(call), toRpcQuantity(coordinate.blockNumber)],
          }),
        ),
      ),
    getNonce: async (account) =>
      parseRpcQuantity(
        await request({
          method: "eth_getTransactionCount",
          params: [parseAddress(account), "pending"],
        }),
      ),
    getTransaction: async (hash) =>
      request({ method: "eth_getTransactionByHash", params: [parseHash32(hash)] }),
    getReceipt: async (hash) =>
      request({ method: "eth_getTransactionReceipt", params: [parseHash32(hash)] }),
  } satisfies RpcTransport);
}

/** Binds one explicitly selected EOA. It never chooses the first wallet account. */
export function createRpcSigner(config: {
  readonly account: `0x${string}`;
  readonly request: RpcRequest;
}): Readonly<ExecutionSigner> {
  const account = parseAddress(config.account);
  return Object.freeze({
    getChainId: async () =>
      parseRpcQuantity(await config.request({ method: "eth_chainId", params: [] })),
    getAddress: async () => {
      const accounts = await config.request({ method: "eth_accounts", params: [] });
      if (
        !Array.isArray(accounts) ||
        !accounts.some((entry: unknown) => parseAddress(entry) === account)
      )
        throw new Error("selected wallet account is unavailable");
      return account;
    },
    sendTransaction: async (call: ExactTransaction) => {
      if (parseAddress(call.from) !== account) throw new Error("signer sender mismatch");
      return parseHash32(
        await config.request({ method: "eth_sendTransaction", params: [transactionRpc(call)] }),
      );
    },
  });
}
