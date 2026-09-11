/** Opt-in CL public-entrypoint validation, confined to a verified localhost fork. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createCLPoolReader, sortCLPoolKey } from "@mezo-dev-kit/pools";
import { verifyLocalForkParent } from "../../../../scripts/lib/local-native-fixture.ts";
import { loadKnowledgeReference } from "../../../../scripts/lib/knowledge-reference.ts";
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const [localUrl, sourceUrl] = process.argv.slice(2);
if (
  !localUrl ||
  !sourceUrl ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(localUrl).hostname)
)
  throw new Error("usage: node test/cl-fork.ts <localhost-anvil-url> <read-only-source-rpc>");
let id = 0;
const request: RpcRequest = async (input) => {
  const callId = ++id,
    response = await fetch(localUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: callId, ...input }),
      signal: AbortSignal.timeout(120000),
    });
  assert(response.ok);
  const raw = object(await response.json());
  assert.equal(raw.id, callId);
  assert.equal(raw.jsonrpc, "2.0");
  if (raw.error) throw new Error(JSON.stringify(raw.error));
  return raw.result;
};
const version = await request({ method: "web3_clientVersion", params: [] });
assert(typeof version === "string" && version.toLowerCase().includes("anvil"));
const registry = createContractRegistry(),
  transport = createRpcTransport({ id: "local-cl-fork", request }),
  network = getNetwork("mezo-mainnet"),
  codec = createAbiCodec(),
  blockNumber = parseUint(await transport.getBlockNumber()),
  parent = await transport.getBlock(blockNumber);
assert(parent);
await verifyLocalForkParent({
  sourceUrl,
  blockNumber,
  blockHash: parseHash32(parent.hash),
  chainId: network.evmChainId,
});
const accounts = await request({ method: "eth_accounts", params: [] });
assert(Array.isArray(accounts));
const account = parseAddress(accounts[0]),
  musd = registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber }),
  market = object(
    (
      await loadKnowledgeReference(fileURLToPath(new URL("../../../..", import.meta.url)), {
        moduleId: "protocols/lending/musdc",
        resourceId: "musdc-lending-fixed-block-state",
      })
    ).document,
  ),
  musdc = parseAddress(object(market.market).loanToken),
  factory = registry.resolve({
    contractId: "mezo-earn.cl-factory",
    networkId: network.id,
    blockNumber,
  });
const anchorHash = parseHash32(parent.hash);
async function call(
  name: string,
  args: readonly AbiValue[] = [],
  target: ResolvedContract = factory,
) {
  const abi = target.readAbi.find((row) => row.type === "function" && row.name === name);
  assert(abi, name);
  return codec.decodeFunction(
    abi,
    parseHexData(
      await transport.read({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber,
        blockHash: anchorHash,
        contractId: target.contractId,
        address: target.address,
        data: codec.encodeFunction(abi, args),
      }),
    ),
  )[0];
}
const reader = createCLPoolReader({ networkId: "mezo-mainnet", registry, transport });
const manager = registry.resolve({
  contractId: "mezo-earn.cl-position-manager",
  networkId: network.id,
  blockNumber,
});
const supply = parseUint(await call("totalSupply", [], manager)),
  candidates: { tokenId: bigint; token0: `0x${string}`; token1: `0x${string}`; spacing: bigint }[] =
    [];
for (let i = 0n; i < supply && i < 64n; i++) {
  const tokenId = parseUint(await call("tokenByIndex", [i], manager));
  const abi = manager.readAbi.find((row) => row.type === "function" && row.name === "positions");
  assert(abi);
  const row = codec.decodeFunction(
    abi,
    await transport.read({
      networkId: network.id,
      chainId: network.evmChainId,
      blockNumber,
      blockHash: anchorHash,
      contractId: manager.contractId,
      address: manager.address,
      data: codec.encodeFunction(abi, [tokenId]),
    }),
  );
  assert(typeof row[4] === "bigint");
  candidates.push({
    tokenId,
    token0: parseAddress(row[2]),
    token1: parseAddress(row[3]),
    spacing: row[4],
  });
}
let found = false;
let positionsChecked = 0;
for (const tickSpacing of [1, 10, 50, 100, 200, 2000]) {
  const key = sortCLPoolKey({ tokenA: musd.address, tokenB: musdc, tickSpacing });
  if (
    parseAddress(await call("getPool", [key.token0, key.token1, BigInt(tickSpacing)])) ===
    `0x${"0".repeat(40)}`
  )
    continue;
  const tokenIds = candidates
    .filter(
      (row) =>
        row.token0 === key.token0 &&
        row.token1 === key.token1 &&
        row.spacing === BigInt(key.tickSpacing),
    )
    .slice(0, 16)
    .map((row) => row.tokenId);
  const snapshot = await reader.read({ account, key, tokenIds });
  assert.equal(snapshot.coordinate.blockHash, parent.hash);
  assert(snapshot.stakedLiquidity <= snapshot.liquidity);
  for (const position of snapshot.positions) {
    if (position.staked) {
      assert.equal(position.owner, snapshot.gauge?.address);
      assert.equal(position.beneficialDepositor, null);
      assert.equal(position.gaugeReward, null);
    } else assert.equal(position.beneficialDepositor, position.owner);
  }
  positionsChecked += snapshot.positions.length;
  process.stdout.write(
    `CL pool ${snapshot.pool}: spacing=${tickSpacing} tick=${snapshot.tick} liquidity=${snapshot.liquidity} staked=${snapshot.stakedLiquidity} gauge=${snapshot.gauge?.address ?? "none"} positions=${snapshot.positions.length}\n`,
  );
  const wrongClone = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry,
    transport: {
      ...transport,
      getCode: async (address, at) =>
        address === snapshot.pool ? "0x00" : transport.getCode(address, at),
    },
  });
  await assert.rejects(wrongClone.read({ account, key }));
  const isPool = factory.readAbi.find((row) => row.type === "function" && row.name === "isPool");
  assert(isPool);
  const isPoolData = codec.encodeFunction(isPool, [snapshot.pool]);
  const wrongMapping = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry,
    transport: {
      ...transport,
      read: async (input) =>
        input.address === factory.address && input.data === isPoolData
          ? `0x${"0".repeat(64)}`
          : transport.read(input),
    },
  });
  await assert.rejects(wrongMapping.read({ account, key }), /factory recognition/);
  let anchors = 0;
  const wrongAnchor = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry,
    transport: {
      ...transport,
      getBlock: async (number) => {
        const block = await transport.getBlock(number);
        return ++anchors > 1 && block ? { ...block, hash: `0x${"ef".repeat(32)}` } : block;
      },
    },
  });
  // The shared token reader detects the changed coordinate before the pool's
  // final anchor check. Preserve that owning error rather than masking it.
  await assert.rejects(wrongAnchor.read({ account, key }), {
    name: "TokenError",
    code: "InvalidInput",
  });
  found = true;
}
assert(found, "no MUSD/mUSDC CL pool in bounded spacing candidates");
assert(positionsChecked > 0, "no matching NFTs among the first 64 enumerated positions");
process.stdout.write(
  `${positionsChecked} NFTs read; wrong clone, factory recognition and anchor rejected.\n`,
);
