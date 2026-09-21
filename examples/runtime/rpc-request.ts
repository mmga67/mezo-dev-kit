import type { RpcRequest } from "@mezo-dev-kit/core";
import { isHexData, parseHexData } from "@mezo-dev-kit/evm";
import { object } from "./validation.ts";

const readMethods = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_call",
  "eth_getLogs",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "debug_traceCall",
  "web3_clientVersion",
]);
const localMethods = new Set([
  ...readMethods,
  "eth_accounts",
  "eth_sendTransaction",
  "evm_snapshot",
  "evm_revert",
  "evm_setAutomine",
  "anvil_getAutomine",
  "evm_setNextBlockTimestamp",
  "evm_mine",
  "anvil_setBalance",
  "anvil_setCode",
  "anvil_setStorageAt",
  "anvil_impersonateAccount",
  "anvil_stopImpersonatingAccount",
  "anvil_setNextBlockBaseFeePerGas",
]);

export class RpcRequestError extends Error {
  readonly code:
    "InvalidEndpoint" | "MethodDenied" | "TransportFailure" | "InvalidResponse" | "RpcFailure";
  readonly method: string;
  readonly rpcCode: number | undefined;
  readonly data: `0x${string}` | undefined;
  constructor(
    code: RpcRequestError["code"],
    method: string,
    rpcCode?: number,
    data?: `0x${string}`,
  ) {
    super(`${code} during ${method}${rpcCode === undefined ? "" : ` (${rpcCode})`}`);
    this.name = "RpcRequestError";
    this.code = code;
    this.method = method;
    this.rpcCode = rpcCode;
    this.data = data;
  }
}

export function localEndpoint(url: string): URL {
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  )
    throw new RpcRequestError("InvalidEndpoint", "local-fork");
  return endpoint;
}

/** HTTP and method policy are application concerns; Core supplies EVM RPC encoding. */
export function createHttpRequest(options: {
  readonly url: string;
  readonly policy: "read-only" | "local-fork";
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}): RpcRequest {
  let endpoint: URL;
  try {
    endpoint = options.policy === "local-fork" ? localEndpoint(options.url) : new URL(options.url);
    if (
      !["http:", "https:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      throw new Error("Invalid endpoint");
  } catch {
    throw new RpcRequestError("InvalidEndpoint", "configuration");
  }
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new TypeError("RPC timeout must be 1–60000 milliseconds");
  const allowed = options.policy === "local-fork" ? localMethods : readMethods;
  let nextId = 0;
  return async ({ method, params }) => {
    if (!allowed.has(method)) throw new RpcRequestError("MethodDenied", method);
    const id = ++nextId;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let value: unknown;
    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal,
        redirect: "error",
      });
      if (!response.ok || response.body === null)
        throw new RpcRequestError("TransportFailure", method);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const bytes: unknown = chunk.value;
          if (!(bytes instanceof Uint8Array)) throw new RpcRequestError("InvalidResponse", method);
          size += bytes.byteLength;
          if (size > 1_048_576) {
            await reader.cancel();
            throw new RpcRequestError("InvalidResponse", method);
          }
          chunks.push(bytes);
        }
      } finally {
        reader.releaseLock();
      }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof RpcRequestError) throw error;
      throw new RpcRequestError(
        error instanceof SyntaxError ? "InvalidResponse" : "TransportFailure",
        method,
      );
    }
    let envelope: Record<string, unknown>;
    try {
      envelope = object(value);
    } catch {
      throw new RpcRequestError("InvalidResponse", method);
    }
    if (envelope.jsonrpc !== "2.0" || envelope.id !== id)
      throw new RpcRequestError("InvalidResponse", method);
    if (Object.hasOwn(envelope, "error")) {
      let error: Record<string, unknown>;
      try {
        error = object(envelope.error);
      } catch {
        throw new RpcRequestError("InvalidResponse", method);
      }
      if (
        Object.hasOwn(envelope, "result") ||
        typeof error.code !== "number" ||
        !Number.isSafeInteger(error.code) ||
        typeof error.message !== "string"
      )
        throw new RpcRequestError("InvalidResponse", method);
      // Retain bounded EVM revert bytes, never credential-bearing provider prose.
      throw new RpcRequestError(
        "RpcFailure",
        method,
        error.code,
        isHexData(error.data) ? parseHexData(error.data) : undefined,
      );
    }
    if (!Object.hasOwn(envelope, "result")) throw new RpcRequestError("InvalidResponse", method);
    return envelope.result;
  };
}
