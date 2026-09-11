import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
} from "@mezo-dev-kit/core";
import type { RpcRequest, RpcTransport } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createRebaseReader, createRebaseWriter } from "@mezo-dev-kit/incentives";
/** Runs only inside the localhost-only harness; every mutation is snapshot-restored. */
export async function rebaseForkWorkflows(config: {
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
  readonly request: RpcRequest;
  readonly source: RpcRequest;
  readonly sourceBlock: bigint;
  readonly account: `0x${string}`;
  readonly createLock: (permanent: boolean) => Promise<bigint>;
  readonly seedToken: (
    token: `0x${string}`,
    recipient: `0x${string}`,
    amount: bigint,
  ) => Promise<void>;
  readonly seedSupply: (token: `0x${string}`, amount: bigint) => Promise<void>;
}): Promise<void> {
  const { registry, transport, request, source, sourceBlock, account } = config,
    codec = createAbiCodec(),
    network = getNetwork("mezo-mainnet"),
    week = 604800n;
  const distributor = registry.resolve({
      networkId: network.id,
      blockNumber: sourceBlock,
      contractId: "incentives.mezo-rebase-distributor",
    }),
    minter = registry.resolve({
      networkId: network.id,
      blockNumber: sourceBlock,
      contractId: "incentives.mezo-minter",
    }),
    escrow = registry.resolve({
      networkId: network.id,
      blockNumber: sourceBlock,
      contractId: "incentives.ve-mezo",
    });
  async function read(contract: ResolvedContract, name: string, args: readonly AbiValue[] = []) {
    const abi = contract.readAbi.find((row) => row.type === "function" && row.name === name);
    assert(abi, name);
    return codec.decodeFunction(
      abi,
      parseHexData(
        await request({
          method: "eth_call",
          params: [{ to: contract.address, data: codec.encodeFunction(abi, args) }, "latest"],
        }),
      ),
    )[0];
  }
  async function send(to: `0x${string}`, data: `0x${string}`, from = account) {
    const hash = parseHash32(
      await request({ method: "eth_sendTransaction", params: [{ from, to, data }] }),
    );
    const receipt = await transport.getReceipt(hash);
    assert(
      receipt && typeof receipt === "object" && "status" in receipt && receipt.status === "0x1",
      `fixture transaction failed ${hash}`,
    );
  }
  const token = parseAddress(await read(distributor, "token")),
    tokenAbi = getTokenInterface();
  // Reuse the canonical ERC-20 totalSupply shape without making its ABI owner
  // the identity of the native MEZO token discovered above.
  const supplyAbi = registry
    .resolve({ networkId: network.id, blockNumber: sourceBlock, contractId: "musd.token" })
    .readAbi.find((row) => row.type === "function" && row.name === "totalSupply");
  assert(supplyAbi);
  async function parentToken(name: string, args: readonly AbiValue[] = []) {
    const abi =
      name === "totalSupply"
        ? supplyAbi
        : tokenAbi.find((row) => row.type === "function" && row.name === name);
    assert(abi, name);
    return parseUint(
      codec.decodeFunction(
        abi,
        parseHexData(
          await source({
            method: "eth_call",
            params: [
              { to: token, data: codec.encodeFunction(abi, args) },
              toRpcQuantity(sourceBlock),
            ],
          }),
        ),
      )[0],
    );
  }
  for (const recipient of [distributor.address, minter.address])
    await config.seedToken(token, recipient, await parentToken("balanceOf", [recipient]));
  await config.seedSupply(token, await parentToken("totalSupply"));
  // Restore the distributor's real parent allowance on the native-token test
  // double. This is a token-boundary fixture, not an SDK approval requirement.
  const approval = tokenAbi.find((row) => row.type === "function" && row.name === "approve");
  assert(approval);
  await request({ method: "anvil_impersonateAccount", params: [distributor.address] });
  try {
    await send(
      token,
      codec.encodeFunction(approval, [
        escrow.address,
        await parentToken("allowance", [distributor.address, escrow.address]),
      ]),
      distributor.address,
    );
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [distributor.address] });
  }
  const fullMinter: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../../knowledge/contracts/artifacts/abis/incentives/mezo-minter.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert(Array.isArray(fullMinter));
  const update: unknown = fullMinter.find(
    (row: unknown) =>
      row && typeof row === "object" && "name" in row && row.name === "updatePeriod",
  );
  assert(update);
  async function upkeep() {
    const block = await request({ method: "eth_getBlockByNumber", params: ["latest", false] });
    assert(block && typeof block === "object" && "timestamp" in block);
    const timestamp = parseRpcQuantity(block.timestamp),
      current = timestamp - (timestamp % week);
    for (let i = 0; i < 10 && parseUint(await read(minter, "activePeriod")) < current; i++)
      await send(minter.address, codec.encodeFunction(update, []));
    assert.equal(
      parseUint(await read(minter, "activePeriod")),
      current,
      "minter period did not advance",
    );
  }
  await upkeep();
  const permanent = await config.createLock(true),
    active = await config.createLock(false),
    expired = await config.createLock(false);
  const reader = createRebaseReader({ networkId: "mezo-mainnet", registry, transport }),
    execution = createExecutionClient({
      network,
      registry,
      transport,
      signer: createRpcSigner({ account, request }),
      store: createMemorySubmissionStore(),
      maxBlockAge: 2n,
      confirmations: 1n,
    }),
    writer = createRebaseWriter({ reader, execution, transport });
  let sequence = 0;
  async function claim(tokenId: bigint, disposition: "locked" | "liquid" | "none") {
    const prepared = await writer.prepare({
      operationId: `rebase-${++sequence}`,
      account,
      tokenId,
      bounds: { minAmount: disposition === "none" ? 0n : 1n, maxBlockAge: 2n },
    });
    assert.equal(prepared.forecast.disposition, disposition);
    const record = await writer.submit(prepared, await writer.simulate(prepared)),
      result = await writer.reconcile(prepared, record);
    assert(result.outcome.boundsSatisfied);
    assert.equal(result.outcome.gasFee, 0n);
    process.stdout.write(
      `rebase ${disposition}: id=${tokenId} amount=${result.outcome.forecast.amount} periods=${result.outcome.forecast.periods} cursor=${result.outcome.forecast.nextCursor}\n`,
    );
  }
  await claim(permanent, "none");
  const first = await reader.read({ account, tokenId: active });
  await request({
    method: "evm_setNextBlockTimestamp",
    params: [Number(first.escrow.epoch.next + 1n)],
  });
  await request({ method: "evm_mine", params: [] });
  await assert.rejects(
    writer.prepare({
      operationId: "rebase-stale-minter",
      account,
      tokenId: active,
      bounds: { minAmount: 0n, maxBlockAge: 2n },
    }),
    /minter period/,
  );
  await upkeep();
  await claim(permanent, "locked");
  await claim(active, "locked");
  await claim(active, "none");
  const timed = await reader.read({ account, tokenId: expired }),
    lock = timed.escrow.locks[0];
  assert(lock);
  await request({ method: "evm_setNextBlockTimestamp", params: [Number(lock.end + 1n)] });
  await request({ method: "evm_mine", params: [] });
  await upkeep();
  await claim(expired, "liquid");
  await claim(expired, "none");
}
