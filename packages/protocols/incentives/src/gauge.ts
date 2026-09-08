import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { Network } from "@mezo-dev-kit/chains";
import { getTokenInterface, resolveRoleInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractId, ContractRegistry } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord, verifyContractRuntime } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  ExecutionTargetResolver,
  PreparedTransaction,
  ReadCoordinate,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader, decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";

export type GaugeRole = "savings-gauge" | "vault-gauge";
export type GaugeErrorCode =
  | "InvalidInput"
  | "IdentityMismatch"
  | "UnavailableState"
  | "InsufficientBalance"
  | "ApprovalRequired"
  | "StaleState"
  | "ReconciliationMismatch";
export class GaugeError extends Error {
  readonly code: GaugeErrorCode;
  constructor(code: GaugeErrorCode, message: string) {
    super(message);
    this.name = "GaugeError";
    this.code = code;
  }
}
export interface GaugeSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly role: GaugeRole;
  readonly anchorContractId: ContractId;
  readonly account: `0x${string}`;
  readonly gauge: `0x${string}`;
  readonly stakingToken: `0x${string}`;
  readonly rewardToken: `0x${string}`;
  readonly voter: `0x${string}`;
  readonly alive: boolean;
  readonly stake: bigint;
  readonly totalStake: bigint;
  readonly custody: bigint;
  readonly earned: bigint;
  readonly rewardDecimals: number;
  readonly rewardRate: bigint;
  readonly periodFinish: bigint;
  readonly token: Readonly<TokenSnapshot>;
}
export interface GaugeReader {
  read(input: {
    readonly account: `0x${string}`;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<GaugeSnapshot>>;
}
const zero = `0x${"0".repeat(40)}` as const;
export function createGaugeReader(config: {
  readonly networkId: Network["id"];
  readonly role: GaugeRole;
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<GaugeReader> {
  const network = getNetwork(config.networkId);
  const profile = resolveRoleInterface(config);
  const codec = createAbiCodec();
  const transport = config.transport;
  return Object.freeze({
    async read(input) {
      const account = parseAddress(input.account);
      if (account === zero) throw new GaugeError("InvalidInput", "nonzero account required");
      if (parseUint(await transport.getChainId()) !== network.evmChainId)
        throw new GaugeError("IdentityMismatch", "wrong chain");
      const blockNumber = parseUint(input.blockNumber ?? (await transport.getBlockNumber()));
      const block = await transport.getBlock(blockNumber);
      if (!block || parseUint(block.number) !== blockNumber)
        throw new GaugeError("UnavailableState", "block unavailable");
      const coordinate = Object.freeze({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber,
        blockHash: parseHash32(block.hash),
      });
      const root = config.registry.resolve({
        contractId: profile.anchorContractId,
        networkId: network.id,
        blockNumber,
      });
      const voter = config.registry.resolve({
        contractId: "incentives.pools-voter",
        networkId: network.id,
        blockNumber,
      });
      await Promise.all(
        [root, voter].map((contract) => verifyContractRuntime({ contract, transport, coordinate })),
      );
      async function read(
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
      ) {
        const entry = abi.find((item) => item.type === "function" && item.name === name);
        return codec.decodeFunction(
          entry,
          await transport.read({
            ...coordinate,
            contractId: root.contractId,
            address,
            data: codec.encodeFunction(entry, args),
          }),
        )[0];
      }
      const gauge = parseAddress(
        await read(
          root.address,
          root.readAbi,
          config.role === "savings-gauge" ? "vaultGauge" : "gauge",
        ),
      );
      const code = parseHexData(await transport.getCode(gauge, coordinate));
      if (
        createHash("sha256")
          .update(Buffer.from(code.slice(2), "hex"))
          .digest("hex") !== profile.runtimeSha256
      )
        throw new GaugeError("IdentityMismatch", "unsupported gauge runtime");
      const g = (name: string, args: readonly AbiValue[] = []) =>
        read(gauge, profile.abi, name, args);
      const stakingToken = parseAddress(await g("stakingToken"));
      const rewardToken = parseAddress(await g("rewardToken"));
      if (
        stakingToken !== root.address ||
        parseAddress(await g("voter")) !== voter.address ||
        parseAddress(await read(voter.address, voter.readAbi, "gauges", [stakingToken])) !==
          gauge ||
        rewardToken === zero ||
        account === gauge ||
        account === root.address
      )
        throw new GaugeError("IdentityMismatch", "gauge graph or account differs");
      const alive = await read(voter.address, voter.readAbi, "isAlive", [gauge]);
      if (typeof alive !== "boolean")
        throw new GaugeError("UnavailableState", "invalid gauge lifecycle");
      const token = await createTokenReader({ transport }).read({
        target: { contractId: root.contractId, address: stakingToken },
        account,
        spender: gauge,
        coordinate,
      });
      const [stake, totalStake, custody, earned, decimals, rewardRate, periodFinish, timestamp] =
        await Promise.all(
          [
            g("balanceOf", [account]),
            g("totalSupply"),
            read(stakingToken, getTokenInterface(), "balanceOf", [gauge]),
            g("earned", [account]),
            read(rewardToken, getTokenInterface(), "decimals"),
            g("rewardRate"),
            g("periodFinish"),
            transport.getBlockTimestamp(coordinate),
          ].map(async (value) => parseUint(await value)),
        );
      if (
        stake === undefined ||
        totalStake === undefined ||
        custody === undefined ||
        earned === undefined ||
        decimals === undefined ||
        rewardRate === undefined ||
        periodFinish === undefined ||
        timestamp === undefined ||
        decimals > 255n ||
        stake > totalStake ||
        totalStake > custody
      )
        throw new GaugeError("UnavailableState", "invalid gauge accounting");
      const final = await transport.getBlock(blockNumber);
      if (
        !final ||
        parseHash32(final.hash) !== coordinate.blockHash ||
        parseUint(await transport.getChainId()) !== coordinate.chainId
      )
        throw new GaugeError("IdentityMismatch", "read coordinate changed");
      return Object.freeze({
        coordinate,
        timestamp,
        role: config.role,
        anchorContractId: root.contractId,
        account,
        gauge,
        stakingToken,
        rewardToken,
        voter: voter.address,
        alive,
        stake,
        totalStake,
        custody,
        earned,
        rewardDecimals: Number(decimals),
        rewardRate,
        periodFinish,
        token,
      });
    },
  } satisfies GaugeReader);
}
export function createGaugeTargetResolver(config: {
  readonly reader: GaugeReader;
  readonly account: `0x${string}`;
}): ExecutionTargetResolver {
  return async (input) => {
    const snapshot = await config.reader.read({
      account: config.account,
      blockNumber: input.coordinate.blockNumber,
    });
    if (
      input.contractId !== snapshot.anchorContractId ||
      input.role !== snapshot.role ||
      input.coordinate.blockHash !== snapshot.coordinate.blockHash ||
      input.coordinate.networkId !== snapshot.coordinate.networkId ||
      input.coordinate.chainId !== snapshot.coordinate.chainId
    )
      throw new GaugeError("IdentityMismatch", "execution role differs");
    return snapshot.gauge;
  };
}
export type GaugeAction =
  Readonly<{ kind: "stake" | "unstake"; amount: bigint }> | Readonly<{ kind: "claim-reward" }>;
export interface GaugeBounds {
  readonly maxBlockAge: bigint;
  readonly minReward: bigint;
}
export interface PreparedGauge {
  readonly snapshot: Readonly<GaugeSnapshot>;
  readonly action: GaugeAction;
  readonly bounds: GaugeBounds;
  readonly token: Readonly<TokenSnapshot>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface GaugeOutcome {
  readonly kind: GaugeAction["kind"];
  readonly amount: bigint;
  readonly rewardPaid: bigint;
  readonly rewardToken: `0x${string}`;
  readonly boundsSatisfied: boolean;
  readonly snapshot: Readonly<GaugeSnapshot>;
}
export interface GaugeWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: GaugeAction;
    readonly bounds: GaugeBounds;
  }): Promise<Readonly<PreparedGauge>>;
  simulate(prepared: PreparedGauge): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedGauge,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedGauge,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: GaugeOutcome;
    }>
  >;
}
export function createGaugeWriter(config: {
  readonly reader: GaugeReader;
  readonly execution: ExecutionClient;
}): Readonly<GaugeWriter> {
  const codec = createAbiCodec();
  const owned = new WeakSet<PreparedGauge>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedGauge>();
  function validate(snapshot: GaugeSnapshot, action: GaugeAction, bounds: GaugeBounds) {
    if (parseUint(bounds.maxBlockAge) === 0n)
      throw new GaugeError("InvalidInput", "positive age bound required");
    parseUint(bounds.minReward);
    if (action.kind === "claim-reward") {
      if (snapshot.earned < bounds.minReward)
        throw new GaugeError("InsufficientBalance", "earned rewards below minimum");
    } else {
      if (
        (action.kind !== "stake" && action.kind !== "unstake") ||
        parseUint(action.amount) === 0n ||
        bounds.minReward !== 0n
      )
        throw new GaugeError(
          "InvalidInput",
          "positive staking amount and zero reward bound required",
        );
      if (action.kind === "stake" && !snapshot.alive)
        throw new GaugeError("UnavailableState", "gauge is not alive");
      if (action.amount > (action.kind === "stake" ? snapshot.token.balance : snapshot.stake))
        throw new GaugeError("InsufficientBalance", "staking balance insufficient");
      if (action.kind === "stake") parseUint(snapshot.totalStake + action.amount);
    }
  }
  return Object.freeze({
    async prepare(input) {
      if (!input.operationId) throw new GaugeError("InvalidInput", "operationId required");
      const action = Object.freeze(structuredClone(input.action));
      const bounds = Object.freeze(structuredClone(input.bounds));
      const snapshot = await config.reader.read({ account: parseAddress(input.account) });
      validate(snapshot, action, bounds);
      const name =
        action.kind === "stake" ? "deposit" : action.kind === "unstake" ? "withdraw" : "getReward";
      const abi = resolveRoleInterface({
        role: snapshot.role,
        networkId: snapshot.coordinate.networkId,
      }).abi.find(
        (entry) =>
          entry.type === "function" &&
          entry.name === name &&
          Array.isArray(entry.inputs) &&
          entry.inputs.length === 1,
      );
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: snapshot.anchorContractId,
        targetRole: snapshot.role,
        coordinate: snapshot.coordinate,
        from: snapshot.account,
        to: snapshot.gauge,
        value: 0n,
        data: codec.encodeFunction(abi, [
          action.kind === "claim-reward" ? snapshot.account : action.amount,
        ]),
      });
      const approval = planApproval({
        allowance: snapshot.token.allowance,
        requiredAmount: action.kind === "stake" ? action.amount : 0n,
      });
      const prepared = Object.freeze({
        snapshot,
        token: snapshot.token,
        action,
        bounds,
        approval,
        transaction,
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      if (!owned.has(prepared))
        throw new GaugeError("InvalidInput", "prepare with this gauge writer");
      if (prepared.approval.kind !== "sufficient")
        throw new GaugeError("ApprovalRequired", "reconcile approval and prepare again");
      const simulated = await config.execution.simulate(prepared.transaction);
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      if (!owned.has(prepared) || simulations.get(simulated) !== prepared)
        throw new GaugeError("InvalidInput", "gauge simulation differs");
      return config.execution.submit(simulated, async () => {
        const snapshot = await config.reader.read({ account: prepared.snapshot.account });
        validate(snapshot, prepared.action, prepared.bounds);
        const age = snapshot.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        if (
          age < 0n ||
          age > prepared.bounds.maxBlockAge ||
          snapshot.gauge !== prepared.snapshot.gauge ||
          snapshot.rewardToken !== prepared.snapshot.rewardToken
        )
          throw new GaugeError("StaleState", "gauge preparation expired or changed");
        if (prepared.action.kind === "stake" && snapshot.token.allowance < prepared.action.amount)
          throw new GaugeError("ApprovalRequired", "staking allowance changed");
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value);
      const call = prepared.transaction;
      if (
        record.operationId !== call.operationId ||
        record.contractId !== call.contractId ||
        record.targetRole !== call.targetRole ||
        record.call.from !== call.from ||
        record.call.to !== call.to ||
        record.call.data !== call.data ||
        BigInt(record.call.value) !== 0n ||
        BigInt(record.call.chainId) !== call.coordinate.chainId
      )
        throw new GaugeError("ReconciliationMismatch", "gauge intent differs");
      return config.execution.reconcile(record, async (receipt) => {
        const snapshot = await config.reader.read({
          account: call.from,
          blockNumber: receipt.blockNumber,
        });
        if (
          snapshot.coordinate.blockHash !== receipt.blockHash ||
          snapshot.gauge !== call.to ||
          snapshot.rewardToken !== prepared.snapshot.rewardToken
        )
          throw new GaugeError("ReconciliationMismatch", "gauge outcome identity differs");
        const kind = prepared.action.kind;
        const amount = kind === "claim-reward" ? 0n : prepared.action.amount;
        const event = resolveRoleInterface({
          role: snapshot.role,
          networkId: snapshot.coordinate.networkId,
        }).abi.find(
          (entry) =>
            entry.type === "event" &&
            entry.name ===
              (kind === "stake" ? "Deposit" : kind === "unstake" ? "Withdraw" : "ClaimRewards"),
        );
        const rows = getReceiptLogs(receipt, call.to)
          .map((log) => codec.decodeEvent(event, log))
          .filter((row) => row !== null && row[0] === call.from);
        let rewardPaid = 0n;
        if (kind === "claim-reward") {
          if (rows.length > 1)
            throw new GaugeError("ReconciliationMismatch", "ambiguous reward claim");
          rewardPaid = rows.length === 0 ? 0n : parseUint(rows[0]?.[1]);
          const paid = decodeTokenTransfers(receipt, snapshot.rewardToken)
            .filter((transfer) => transfer.from === call.to && transfer.to === call.from)
            .reduce((sum, transfer) => sum + transfer.amount, 0n);
          if (paid !== rewardPaid)
            throw new GaugeError("ReconciliationMismatch", "reward payout differs");
        } else {
          if (
            rows.length !== 1 ||
            rows[0]?.[kind === "stake" ? 2 : 1] !== amount ||
            (kind === "stake" && rows[0]?.[1] !== call.from)
          )
            throw new GaugeError("ReconciliationMismatch", "staking event differs");
          const movements = decodeTokenTransfers(receipt, snapshot.stakingToken).filter(
            (transfer) =>
              transfer.from === (kind === "stake" ? call.from : call.to) &&
              transfer.to === (kind === "stake" ? call.to : call.from),
          );
          if (movements.length !== 1 || movements[0]?.amount !== amount)
            throw new GaugeError("ReconciliationMismatch", "staking transfer differs");
        }
        const delta = kind === "stake" ? amount : kind === "unstake" ? -amount : 0n;
        if (
          snapshot.stake !== prepared.snapshot.stake + delta ||
          snapshot.token.balance !== prepared.token.balance - delta
        )
          throw new GaugeError("ReconciliationMismatch", "staking ownership differs");
        return Object.freeze({
          kind,
          amount,
          rewardPaid,
          rewardToken: snapshot.rewardToken,
          boundsSatisfied: rewardPaid >= prepared.bounds.minReward,
          snapshot,
        });
      });
    },
  } satisfies GaugeWriter);
}
