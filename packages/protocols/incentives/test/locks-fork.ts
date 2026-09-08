/** Opt-in local escrow lifecycle. Native ERC-20 ledgers are explicit fixtures, gas price is zero. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry, getTokenInterface } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
  createRpcTransport,
} from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import {
  createLockReader,
  createLockTargetResolver,
  createLockWriter,
} from "@mezo-dev-kit/incentives";
import type { LockAction } from "@mezo-dev-kit/incentives";
import { verifyLocalForkParent } from "../../../../scripts/lib/local-native-fixture.ts";
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const [localUrl, sourceUrl, artifactPath] = process.argv.slice(2);
if (
  !localUrl ||
  !sourceUrl ||
  !artifactPath ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(localUrl).hostname)
)
  throw new Error(
    "usage: node test/locks-fork.ts <localhost-anvil-url> <read-only-source-rpc> <compiled-native-token-fixture.json>",
  );
function rpc(url: string, readOnly: boolean): RpcRequest {
  let id = 0;
  return async (input) => {
    assert(!readOnly || ["eth_call", "eth_chainId", "eth_getBlockByNumber"].includes(input.method));
    const callId = ++id,
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: callId, ...input }),
        // Four-year checkpoint catch-up can hydrate hundreds of fork storage
        // slots. Bound the local archive work separately from source reads.
        signal: AbortSignal.timeout(readOnly ? 120000 : 600000),
      });
    assert(response.ok);
    const body = object(await response.json());
    assert.equal(body.id, callId);
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  };
}
let request = rpc(localUrl, false);
const source = rpc(sourceUrl, true),
  network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry(),
  codec = createAbiCodec(),
  W = 10n ** 18n,
  week = 604800n;
const version = await request({ method: "web3_clientVersion", params: [] });
assert(typeof version === "string" && version.toLowerCase().includes("anvil"));
const transport = createRpcTransport({
    id: "local-escrow-fixture",
    request: (input) => request(input),
  }),
  blockNumber = parseUint(await transport.getBlockNumber()),
  parent = await transport.getBlock(blockNumber);
assert(parent);
await verifyLocalForkParent({
  sourceUrl,
  blockNumber,
  blockHash: parseHash32(parent.hash),
  chainId: network.evmChainId,
});
const snapshotId = await request({ method: "evm_snapshot", params: [] });
try {
  await request({ method: "evm_setAutomine", params: [false] });
  const rawRequest = request;
  request = async (input) => {
    if (input.method === "eth_sendTransaction")
      await rawRequest({ method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"] });
    const result = await rawRequest(
      input.method === "eth_sendTransaction"
        ? { ...input, params: [{ ...object(input.params[0]), gas: "0x7a1200", gasPrice: "0x0" }] }
        : input,
    );
    if (input.method === "eth_sendTransaction") {
      const header = object(
        await rawRequest({ method: "eth_getBlockByNumber", params: ["latest", false] }),
      );
      await rawRequest({
        method: "evm_setNextBlockTimestamp",
        params: [Number(parseRpcQuantity(header.timestamp) + 1n)],
      });
      await rawRequest({ method: "evm_mine", params: [] });
    }
    return result;
  };
  const accounts = await request({ method: "eth_accounts", params: [] });
  assert(Array.isArray(accounts));
  const account = parseAddress(accounts[0]);
  const artifact = object(JSON.parse(readFileSync(artifactPath, "utf8"))),
    fixtureAbi = artifact.abi;
  assert(Array.isArray(fixtureAbi));
  const seed: unknown = fixtureAbi.find((entry: unknown) => object(entry).name === "seed"),
    bytecode = parseHexData(object(artifact.deployedBytecode).object);
  const balanceAbi = getTokenInterface().find(
    (entry) => entry.type === "function" && entry.name === "balanceOf",
  );
  assert(balanceAbi);
  // Both native tokens are needed by the verified boost graph. Seed only the
  // token ledgers; real escrow/voter/library bytecode and storage stay intact.
  for (const contractId of ["incentives.ve-btc", "incentives.ve-mezo"] as const) {
    const contract = registry.resolve({ contractId, networkId: network.id, blockNumber }),
      tokenAbi = contract.readAbi.find(
        (entry) => entry.type === "function" && entry.name === "token",
      );
    assert(tokenAbi);
    const token = parseAddress(
      codec.decodeFunction(
        tokenAbi,
        parseHexData(
          await request({
            method: "eth_call",
            params: [{ to: contract.address, data: codec.encodeFunction(tokenAbi, []) }, "latest"],
          }),
        ),
      )[0],
    );
    const custody = parseUint(
      codec.decodeFunction(
        balanceAbi,
        parseHexData(
          await source({
            method: "eth_call",
            params: [
              { to: token, data: codec.encodeFunction(balanceAbi, [contract.address]) },
              toRpcQuantity(blockNumber),
            ],
          }),
        ),
      )[0],
    );
    await request({ method: "anvil_setCode", params: [token, bytecode] });
    for (const [recipient, amount] of [
      [contract.address, custody],
      [account, 10n * W],
    ] as const) {
      const hash = parseHash32(
        await request({
          method: "eth_sendTransaction",
          params: [
            { from: account, to: token, data: codec.encodeFunction(seed, [recipient, amount]) },
          ],
        }),
      );
      assert.equal(object(await transport.getReceipt(hash)).status, "0x1");
    }
  }
  for (const role of ["vebtc-current", "vemezo-current"] as const) {
    const reader = createLockReader({ networkId: "mezo-mainnet", role, registry, transport });
    const execution = createExecutionClient({
      network,
      registry,
      transport,
      signer: createRpcSigner({ account, request: (input) => request(input) }),
      store: createMemorySubmissionStore(),
      maxBlockAge: 2n,
      confirmations: 1n,
      resolveTarget: createLockTargetResolver({ reader, account }),
    });
    const writer = createLockWriter({ reader, execution, transport }),
      approvals = createApprovalWriter({
        reader: createTokenReader({ transport }),
        execution,
        transport,
      });
    let sequence = 0;
    async function execute(action: LockAction) {
      const initial = await reader.read({
        account,
        tokenIds: action.kind === "create" ? [] : [action.tokenId],
      });
      const input = {
        operationId: `${role}-${++sequence}`,
        account,
        action,
        bounds: {
          minLockedAmount: 0n,
          minUnboostedPower: 0n,
          maxLockEnd: initial.timestamp + initial.maxLockSeconds + week,
          maxBlockAge: 2n,
        },
      };
      let prepared = await writer.prepare(input);
      while (prepared.approval.kind !== "sufficient") {
        const approval = await approvals.prepare({
          ...prepared.snapshot.token,
          operationId: `${input.operationId}-approval-${prepared.approval.kind}`,
          amount: prepared.approval.amount,
          expectedAllowance: prepared.snapshot.token.allowance,
        });
        const record = await approvals.submit(approval, await approvals.simulate(approval));
        await approvals.reconcile(approval, record);
        prepared = await writer.prepare(input);
      }
      const record = await writer.submit(prepared, await writer.simulate(prepared)),
        result = await writer.reconcile(prepared, record);
      assert(result.outcome.boundsSatisfied);
      assert.equal(result.outcome.gasFee, 0n);
      process.stdout.write(
        `${role} ${action.kind}: id=${result.outcome.tokenId} amount=${result.outcome.forecast.amount} end=${result.outcome.forecast.end} permanent=${result.outcome.forecast.permanent}\n`,
      );
      return result.outcome;
    }
    const created = await execute({ kind: "create", amount: W, duration: 2n * week }),
      tokenId = created.tokenId;
    await execute({ kind: "increase", tokenId, amount: W / 10n });
    await execute({ kind: "extend", tokenId, duration: 3n * week });
    await execute({ kind: "make-permanent", tokenId });
    const timed = await execute({ kind: "unlock-permanent", tokenId });
    await assert.rejects(
      writer.prepare({
        operationId: `${role}-premature-exit`,
        account,
        action: { kind: "withdraw", tokenId },
        bounds: {
          minLockedAmount: 0n,
          minUnboostedPower: 0n,
          maxLockEnd: timed.forecast.end,
          maxBlockAge: 2n,
        },
      }),
      /expired timed lock/,
    );
    // Model ordinary permissionless checkpoint upkeep over the four-year
    // interval instead of requiring four years of catch-up in one call.
    // Upkeep remains real escrow execution, with no checkpoint storage edits.
    if (role === "vemezo-current") {
      const fullAbi: unknown = JSON.parse(
        readFileSync(
          new URL(
            "../../../../knowledge/contracts/artifacts/abis/incentives/ve-mezo.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert(Array.isArray(fullAbi));
      const checkpoint: unknown = fullAbi.find(
        (value: unknown) => object(value).name === "checkpoint",
      );
      assert(checkpoint);
      for (
        let time = timed.snapshot.timestamp + 26n * week;
        time < timed.forecast.end;
        time += 26n * week
      ) {
        await request({ method: "evm_setNextBlockTimestamp", params: [Number(time)] });
        await request({ method: "evm_mine", params: [] });
        const hash = parseHash32(
          await request({
            method: "eth_sendTransaction",
            params: [
              {
                from: account,
                to: timed.snapshot.contract.address,
                data: codec.encodeFunction(checkpoint, []),
              },
            ],
          }),
        );
        assert.equal(object(await transport.getReceipt(hash)).status, "0x1");
      }
    }
    await request({ method: "evm_setNextBlockTimestamp", params: [Number(timed.forecast.end)] });
    await request({ method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"] });
    await request({ method: "evm_mine", params: [] });
    const withdrawn = await execute({ kind: "withdraw", tokenId });
    assert.equal(withdrawn.snapshot.locks[0]?.owner, `0x${"00".repeat(20)}`);
  }
  process.stdout.write(
    `Fork ${blockNumber} ${parseHash32(parent.hash)}: 12 escrow operations and separate exact approvals reconciled; premature withdrawals rejected. Periodic real escrow checkpoints maintain the four-year interval. Native ERC-20 ledgers and zero gas price are explicit local fixtures, not native-engine qualification.\n`,
  );
} finally {
  try {
    assert.equal(await request({ method: "evm_revert", params: [snapshotId] }), true);
  } finally {
    await request({ method: "evm_setAutomine", params: [true] });
  }
}
