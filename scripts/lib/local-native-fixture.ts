import assert from "node:assert/strict";

type Request = (input: {
  readonly method: string;
  readonly params: readonly unknown[];
}) => Promise<unknown>;

/** Reject a stale/reused local fork or a source endpoint on another chain. */
export async function verifyLocalForkParent(input: {
  readonly sourceUrl: string;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly chainId: bigint;
}): Promise<void> {
  async function read(method: "eth_chainId" | "eth_getBlockByNumber", params: readonly unknown[]) {
    const response = await fetch(input.sourceUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });
    assert(response.ok);
    const body: unknown = await response.json();
    assert(body && typeof body === "object" && "result" in body && !("error" in body));
    return body.result;
  }
  const chain = await read("eth_chainId", []);
  assert(typeof chain === "string");
  assert.equal(BigInt(chain), input.chainId);
  const parent = await read("eth_getBlockByNumber", [`0x${input.blockNumber.toString(16)}`, false]);
  assert(parent && typeof parent === "object" && "hash" in parent && "number" in parent);
  assert.equal(parent.hash, input.blockHash, "start a fresh fork at a source block");
  assert(typeof parent.number === "string");
  assert.equal(BigInt(parent.number), input.blockNumber);
}
/** Test-only model of Mezo native dispatch: eth_getCode exposes the original
 * interface stub while execution uses explicitly captured native responses.
 * The caller owns a local Anvil snapshot and must revert it after the test. */
export async function installLocalNativeFixture(input: {
  readonly request: Request;
  readonly address: `0x${string}`;
  readonly responses: readonly { readonly selector: `0x${string}`; readonly data: `0x${string}` }[];
}): Promise<Request> {
  const version = await input.request({ method: "web3_clientVersion", params: [] });
  assert(
    typeof version === "string" && version.toLowerCase().includes("anvil"),
    "native fixture requires Anvil",
  );
  const originalCode = await input.request({
    method: "eth_getCode",
    params: [input.address, "latest"],
  });
  assert(
    typeof originalCode === "string" && originalCode.length > 2,
    "native interface code required",
  );
  const parts: string[] = [];
  const jumps: number[] = [];
  const offsets: number[] = [];
  const push2 = (value: number) => {
    assert(value >= 0 && value <= 65535);
    return `61${value.toString(16).padStart(4, "0")}`;
  };
  let size = 0;
  const emit = (code: string) => {
    parts.push(code);
    size += code.length / 2;
  };
  for (const response of input.responses) {
    assert.equal(response.selector.length, 10);
    assert(response.data.length <= 65536);
    emit(`5f3560e01c63${response.selector.slice(2)}14`);
    jumps.push(parts.length);
    emit("61000057");
  }
  emit("5f5ffd");
  for (const [i, response] of input.responses.entries()) {
    const jump = jumps[i];
    assert(jump !== undefined);
    parts[jump] = `${push2(size)}57`;
    emit("5b");
    emit(push2((response.data.length - 2) / 2));
    offsets.push(parts.length);
    emit("610000");
    emit(`5f39${push2((response.data.length - 2) / 2)}5ff3`);
  }
  for (const [i, response] of input.responses.entries()) {
    const offset = offsets[i];
    assert(offset !== undefined);
    parts[offset] = push2(size);
    emit(response.data.slice(2));
  }
  await input.request({ method: "anvil_setCode", params: [input.address, `0x${parts.join("")}`] });
  return (request) =>
    request.method === "eth_getCode" && request.params[0] === input.address
      ? Promise.resolve(originalCode)
      : input.request(request);
}
