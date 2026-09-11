import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractRegistry, VotingDomain } from "@mezo-dev-kit/contracts";
import { getTokenInterface, resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
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
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import {
  createVotingReader,
  createVotingWriter,
  createVotingRewardReader,
  createVotingRewardWriter,
} from "@mezo-dev-kit/incentives";
import type { EscrowRole, VotingAction } from "@mezo-dev-kit/incentives";
/** Called only by the localhost-only, snapshot-restoring escrow fork harness. */
export async function votingForkWorkflows(config: {
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
  readonly request: RpcRequest;
  readonly account: `0x${string}`;
  readonly tokenId: bigint;
  readonly role: EscrowRole;
  readonly source: RpcRequest;
  readonly sourceBlock: bigint;
  readonly seedToken: (
    token: `0x${string}`,
    recipient: `0x${string}`,
    amount: bigint,
  ) => Promise<void>;
}): Promise<void> {
  const { registry, transport, request, account, tokenId } = config,
    codec = createAbiCodec();
  const domains: readonly VotingDomain[] =
    config.role === "vebtc-current" ? ["pools", "validator"] : ["boost"];
  for (const domain of domains) {
    const reader = createVotingReader({ domain, networkId: "mezo-mainnet", registry, transport });
    let snapshot = await reader.read({ account, tokenId, targets: [] });
    async function nextEpoch() {
      snapshot = await reader.read({ account, tokenId, targets: [] });
      await request({
        method: "evm_setNextBlockTimestamp",
        params: [Number(snapshot.escrow.epoch.next + 3601n)],
      });
      await request({ method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"] });
      await request({ method: "evm_mine", params: [] });
      snapshot = await reader.read({ account, tokenId, targets: [] });
    }
    await nextEpoch();
    const contract = snapshot.contract;
    async function call(name: string, args: readonly (bigint | `0x${string}`)[] = []) {
      const abi = contract.readAbi.find(
        (entry) => entry.type === "function" && entry.name === name,
      );
      assert(abi, name);
      return codec.decodeFunction(
        abi,
        await transport.read({
          ...snapshot.escrow.coordinate,
          contractId: contract.contractId,
          address: contract.address,
          data: codec.encodeFunction(abi, args),
        }),
      )[0];
    }
    const length = parseUint(await call("length"));
    const mezoEscrow = registry.resolve({
      ...snapshot.escrow.coordinate,
      contractId: "incentives.ve-mezo",
    });
    const tokenGetter = mezoEscrow.readAbi.find(
      (row) => row.type === "function" && row.name === "token",
    );
    assert(tokenGetter);
    const rewardToken = parseAddress(
      codec.decodeFunction(
        tokenGetter,
        await transport.read({
          ...snapshot.escrow.coordinate,
          contractId: mezoEscrow.contractId,
          address: mezoEscrow.address,
          data: codec.encodeFunction(tokenGetter, []),
        }),
      )[0],
    );
    let target: `0x${string}` | undefined;
    for (let i = 0n; i < length && i < 32n; i++) {
      const candidate = parseAddress(await call(domain === "pools" ? "pools" : "gauges", [i]));
      const gauge =
        domain === "pools" ? parseAddress(await call("gauges", [candidate])) : candidate;
      if ((await call("isAlive", [gauge])) === true) {
        if (domain === "pools") {
          const fees = parseAddress(await call("gaugeToFees", [gauge]));
          const isReward = resolveVotingRewardInterface({
            networkId: "mezo-mainnet",
            role: "fees",
          }).abi.find((row) => row.type === "function" && row.name === "isReward");
          assert(isReward);
          const allowed = codec.decodeFunction(
            isReward,
            await transport.read({
              ...snapshot.escrow.coordinate,
              contractId: contract.contractId,
              address: fees,
              data: codec.encodeFunction(isReward, [rewardToken]),
            }),
          )[0];
          if (allowed !== true) continue;
        }
        target = candidate;
        break;
      }
    }
    assert(target, `no live ${domain} target in first 32`);
    const execution = createExecutionClient({
      network: getNetwork("mezo-mainnet"),
      registry,
      transport,
      signer: createRpcSigner({ account, request }),
      store: createMemorySubmissionStore(),
      maxBlockAge: 2n,
      confirmations: 1n,
    });
    const writer = createVotingWriter({ reader, execution, transport });
    let sequence = 0;
    function input(action: VotingAction) {
      return {
        operationId: `${domain}-${++sequence}`,
        account,
        tokenId,
        action,
        bounds: { minAllocations: action.kind === "vote" ? [1n] : [], maxBlockAge: 2n },
      };
    }
    async function execute(action: VotingAction) {
      const prepared = await writer.prepare(input(action));
      const record = await writer.submit(prepared, await writer.simulate(prepared));
      const result = await writer.reconcile(prepared, record);
      assert(result.outcome.boundsSatisfied);
      process.stdout.write(
        `${domain} ${action.kind}: tokenId=${tokenId} usedWeight=${result.outcome.snapshot.usedWeight}\n`,
      );
      return result.outcome.snapshot;
    }
    const vote = { kind: "vote", targets: [target], relativeWeights: [1n] } as const;
    const voted = await execute(vote);
    await assert.rejects(writer.prepare(input({ kind: "reset" })), { code: "IneligibleOperation" });
    await assert.rejects(writer.prepare(input(vote)), { code: "IneligibleOperation" });
    const selected = voted.targets.find((row) => row.target === target);
    assert(selected);
    const tokenAbi = getTokenInterface(),
      balanceAbi = tokenAbi.find((row) => row.name === "balanceOf"),
      approveAbi = tokenAbi.find((row) => row.name === "approve");
    assert(balanceAbi && approveAbi);
    const artifact: unknown = JSON.parse(
      readFileSync(
        new URL(
          "../../../../knowledge/contracts/artifacts/voting-interfaces/bribe-reward-build.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert(
      artifact && typeof artifact === "object" && "abi" in artifact && Array.isArray(artifact.abi),
    );
    const notify: unknown = artifact.abi.find(
      (row: unknown) =>
        row && typeof row === "object" && "name" in row && row.name === "notifyRewardAmount",
    );
    assert(notify);
    async function send(from: `0x${string}`, to: `0x${string}`, data: `0x${string}`) {
      const hash = parseHash32(
        await request({ method: "eth_sendTransaction", params: [{ from, to, data }] }),
      );
      const receipt = await transport.getReceipt(hash);
      assert(
        receipt && typeof receipt === "object" && "status" in receipt && receipt.status === "0x1",
      );
    }
    for (const reward of selected.rewards) {
      const custody = parseUint(
        codec.decodeFunction(
          balanceAbi,
          parseHexData(
            await config.source({
              method: "eth_call",
              params: [
                { to: rewardToken, data: codec.encodeFunction(balanceAbi, [reward.address]) },
                toRpcQuantity(config.sourceBlock),
              ],
            }),
          ),
        )[0],
      );
      await config.seedToken(rewardToken, reward.address, custody);
      const from = reward.role === "fees" ? selected.gauge : account;
      if (reward.role === "fees") {
        // Local funding fixture: invoke the real fee notification through its required gauge authority.
        await config.seedToken(rewardToken, from, 10n ** 18n);
        await request({ method: "anvil_impersonateAccount", params: [from] });
      }
      try {
        await send(
          from,
          rewardToken,
          codec.encodeFunction(approveAbi, [reward.address, 10n ** 18n]),
        );
        await send(from, reward.address, codec.encodeFunction(notify, [rewardToken, 10n ** 18n]));
      } finally {
        if (reward.role === "fees")
          await request({ method: "anvil_stopImpersonatingAccount", params: [from] });
      }
    }
    await nextEpoch();
    const rewardReader = createVotingRewardReader({ voting: reader, transport, maxEpochs: 4 });
    const rewardWriter = createVotingRewardWriter({ reader: rewardReader, execution, transport });
    for (const reward of selected.rewards) {
      for (const minAmount of [1n, 0n]) {
        const prepared = await rewardWriter.prepare({
          operationId: `${domain}-${reward.role}-${++sequence}`,
          account,
          tokenId,
          target,
          role: reward.role,
          tokens: [rewardToken],
          bounds: { minAmounts: [minAmount], maxBlockAge: 2n },
        });
        const record = await rewardWriter.submit(prepared, await rewardWriter.simulate(prepared));
        const result = await rewardWriter.reconcile(prepared, record);
        assert(result.outcome.boundsSatisfied);
        assert(
          minAmount === 0n ? result.outcome.paid[0] === 0n : (result.outcome.paid[0] ?? 0n) > 0n,
        );
        process.stdout.write(
          `${domain} ${reward.role}: paid=${result.outcome.paid[0]} tokenId=${tokenId}\n`,
        );
      }
    }
    await execute(vote); // replacement withdraw/deposit over the previous allocation
    await nextEpoch();
    const reset = await execute({ kind: "reset" });
    assert.equal(reset.usedWeight, 0n);
    await execute(vote); // reset leaves lastVoted unchanged, allowing a vote this epoch
    await nextEpoch();
    await execute({ kind: "reset" });
  }
}
