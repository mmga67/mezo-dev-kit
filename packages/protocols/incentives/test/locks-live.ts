/** Opt-in read-only probe through built public entrypoints; caller selects the provider. */
import assert from "node:assert/strict";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { createLockReader } from "@mezo-dev-kit/incentives";
const [url] = process.argv.slice(2);
if (!url) throw new Error("usage: node test/locks-live.ts <read-only-rpc-url>");
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
let id = 0,
  tail: Promise<void> = Promise.resolve();
const request: RpcRequest = (input) => {
  assert(
    [
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getStorageAt",
      "eth_call",
      "eth_getBalance",
    ].includes(input.method),
  );
  const result = tail.then(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 150);
    });
    const callId = ++id,
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: callId, ...input }),
        signal: AbortSignal.timeout(30000),
      });
    assert(response.ok, `HTTP ${response.status}`);
    const body = object(await response.json());
    assert.equal(body.id, callId);
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  });
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};
const transport = createRpcTransport({ id: "explicit-lock-read-probe", request }),
  registry = createContractRegistry(),
  codec = createAbiCodec(),
  blockNumber = parseUint(await transport.getBlockNumber()),
  block = await transport.getBlock(blockNumber);
assert(block);
for (const [role, contractId] of [
  ["vebtc-current", "incentives.ve-btc"],
  ["vemezo-current", "incentives.ve-mezo"],
] as const) {
  const contract = registry.resolve({ contractId, networkId: "mezo-mainnet", blockNumber });
  async function get(name: string, args: readonly bigint[] = []) {
    const abi = contract.readAbi.find((entry) => entry.type === "function" && entry.name === name);
    assert(abi);
    return codec.decodeFunction(
      abi,
      parseHexData(
        await request({
          method: "eth_call",
          params: [
            { to: contract.address, data: codec.encodeFunction(abi, args) },
            toRpcQuantity(blockNumber),
          ],
        }),
      ),
    )[0];
  }
  const tokenId = parseUint(await get("tokenId")),
    account = parseAddress(await get("ownerOf", [tokenId]));
  const reader = createLockReader({ role, networkId: "mezo-mainnet", registry, transport }),
    snapshot = await reader.read({ account, tokenIds: [tokenId], blockNumber });
  assert.equal(snapshot.coordinate.blockHash, parseHash32(block.hash));
  assert.equal(snapshot.locks[0]?.owner, account);
  const page = await reader.listOwned({
    account,
    offset: snapshot.ownedCount - 1n,
    limit: 1,
    blockNumber,
  });
  assert.equal(page.snapshot.locks.length, 1);
  assert.equal(page.nextOffset, null);
  process.stdout.write(
    `${role}: ${tokenId}, amount=${snapshot.locks[0]?.amount}, end=${snapshot.locks[0]?.end}, currentVP=${snapshot.locks[0]?.currentVotingPower}, storedBoost=${snapshot.locks[0]?.storedBoost}, currentBoost=${snapshot.locks[0]?.currentBoost}; bounded ownership page verified\n`,
  );
}
process.stdout.write(`Read-only lock probe ${blockNumber} ${parseHash32(block.hash)} passed.\n`);
