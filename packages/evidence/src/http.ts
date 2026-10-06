import { EvidenceError } from "./types.ts";
import type { EvidenceRpcRequest } from "./types.ts";

/** Inject fetch in browsers or Node. Never stores URLs, credentials, headers or raw RPC errors. */
export function createEvidenceHttpRequest(config: {
  readonly url: string;
  readonly fetch: typeof globalThis.fetch;
}): EvidenceRpcRequest {
  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw new EvidenceError("invalid-input");
  }
  if (!["http:", "https:"].includes(url.protocol) || typeof config.fetch !== "function")
    throw new EvidenceError("invalid-input");
  return async (input) => {
    if (
      ![
        "eth_chainId",
        "eth_blockNumber",
        "eth_getBlockByNumber",
        "eth_getCode",
        "eth_getStorageAt",
        "eth_call",
      ].includes(input.method)
    )
      throw new EvidenceError("invalid-input");
    const timeout = AbortSignal.timeout(input.timeoutMs),
      signal = AbortSignal.any([input.signal, timeout]);
    try {
      const response = await config.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: input.method, params: input.params }),
        signal,
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new EvidenceError(
          "transport-error",
          response.status === 429 || response.status >= 500,
        );
      }
      if (!response.body) throw new EvidenceError("invalid-response");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          const chunk: unknown = next.value;
          if (!(chunk instanceof Uint8Array)) throw new EvidenceError("invalid-response");
          length += chunk.byteLength;
          if (length > input.maxResponseBytes) throw new EvidenceError("response-too-large");
          chunks.push(chunk);
        }
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let result: unknown;
      try {
        result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw new EvidenceError("invalid-response");
      }
      if (
        !result ||
        typeof result !== "object" ||
        !("jsonrpc" in result) ||
        result.jsonrpc !== "2.0" ||
        !("id" in result) ||
        result.id !== 1
      )
        throw new EvidenceError("invalid-response");
      if ("error" in result) throw new EvidenceError("rpc-error");
      if (!("result" in result)) throw new EvidenceError("invalid-response");
      return result.result;
    } catch (error) {
      if (input.signal.aborted) throw new EvidenceError("cancelled");
      if (timeout.aborted) throw new EvidenceError("timeout", true);
      throw error instanceof EvidenceError ? error : new EvidenceError("transport-error", true);
    }
  };
}
