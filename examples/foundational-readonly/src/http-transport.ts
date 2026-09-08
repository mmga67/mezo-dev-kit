import type { CoreReadTransport, HexData } from "@mezo-dev-kit/core";

export class RpcReadError extends Error {
  readonly code: "InvalidEndpoint" | "TransportFailure" | "InvalidResponse" | "RpcFailure";
  readonly method: string;
  readonly rpcCode: number | undefined;

  constructor(code: RpcReadError["code"], method: string, rpcCode?: number) {
    super(`${code} during ${method}${rpcCode === undefined ? "" : ` (${rpcCode})`}`);
    this.name = "RpcReadError";
    this.code = code;
    this.method = method;
    this.rpcCode = rpcCode;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function quantity(value: unknown, method: string): bigint {
  if (typeof value !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    throw new RpcReadError("InvalidResponse", method);
  }
  return BigInt(value);
}

export function hexData(value: unknown): HexData {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new RpcReadError("InvalidResponse", "hex-data");
  }
  return value.toLowerCase() as HexData;
}

/** Example-owned adapter. The caller selects the endpoint; Core owns chain checks. */
export function createHttpReadTransport(options: {
  readonly url: string;
  readonly fetch?: typeof fetch;
}): CoreReadTransport {
  let endpoint: URL;
  try {
    endpoint = new URL(options.url);
  } catch {
    throw new RpcReadError("InvalidEndpoint", "configuration");
  }
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.hash !== ""
  ) {
    throw new RpcReadError("InvalidEndpoint", "configuration");
  }
  const request = options.fetch ?? fetch;
  let nextId = 0;

  async function rpc(method: string, params: readonly unknown[]): Promise<unknown> {
    const id = ++nextId;
    let value: unknown;
    try {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok || response.body === null) {
        throw new RpcReadError("TransportFailure", method);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const bytes: unknown = chunk.value;
          if (!(bytes instanceof Uint8Array)) throw new RpcReadError("InvalidResponse", method);
          size += bytes.byteLength;
          if (size > 1_048_576) {
            await reader.cancel();
            throw new RpcReadError("InvalidResponse", method);
          }
          chunks.push(bytes);
        }
      } finally {
        reader.releaseLock();
      }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof RpcReadError) throw error;
      if (error instanceof SyntaxError) throw new RpcReadError("InvalidResponse", method);
      // Provider errors can contain endpoint credentials; expose only safe context.
      throw new RpcReadError("TransportFailure", method);
    }
    if (!record(value) || value.jsonrpc !== "2.0" || value.id !== id) {
      throw new RpcReadError("InvalidResponse", method);
    }
    if (Object.hasOwn(value, "error")) {
      if (
        Object.hasOwn(value, "result") ||
        !record(value.error) ||
        !Number.isSafeInteger(value.error.code) ||
        typeof value.error.code !== "number" ||
        typeof value.error.message !== "string"
      ) {
        throw new RpcReadError("InvalidResponse", method);
      }
      throw new RpcReadError("RpcFailure", method, value.error.code);
    }
    if (!Object.hasOwn(value, "result")) throw new RpcReadError("InvalidResponse", method);
    return value.result;
  }

  return {
    id: "example-http-read",
    getChainId: async () => quantity(await rpc("eth_chainId", []), "eth_chainId"),
    getBlockNumber: async () => quantity(await rpc("eth_blockNumber", []), "eth_blockNumber"),
    getBlock: async (blockNumber) => {
      const value = await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
      if (value === null) return null;
      if (!record(value)) throw new RpcReadError("InvalidResponse", "eth_getBlockByNumber");
      const hash = hexData(value.hash);
      if (hash.length !== 66) throw new RpcReadError("InvalidResponse", "eth_getBlockByNumber");
      return { number: quantity(value.number, "eth_getBlockByNumber"), hash };
    },
    read: async (call) =>
      hexData(
        await rpc("eth_call", [
          { to: call.address, data: call.data },
          { blockHash: call.blockHash, requireCanonical: true },
        ]),
      ),
  };
}
