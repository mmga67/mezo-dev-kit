import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface, isContractId } from "@mezo-dev-kit/contracts";
import type { ContractId } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  ReadCoordinate,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";

export type TokenErrorCode =
  "InvalidInput" | "StaleAllowance" | "ResetRequired" | "ReconciliationMismatch";
/**
 * Typed tokens failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class TokenError extends Error {
  readonly code: TokenErrorCode;
  constructor(code: TokenErrorCode, message: string) {
    super(message);
    this.name = "TokenError";
    this.code = code;
  }
}
/**
 * Protocol-verified token address plus registry anchor and optional discovered role. ERC-20
 * shape alone is not token identity.
 */
export interface TokenTarget {
  readonly contractId: ContractId;
  readonly address: `0x${string}`;
  readonly targetRole?: string;
}
/**
 * Exact token/account/spender read at one coordinate; the domain supplies the verified target.
 */
export interface TokenReadInput {
  readonly target: TokenTarget;
  readonly account: `0x${string}`;
  readonly spender: `0x${string}`;
  readonly coordinate: ReadCoordinate;
}
/**
 * Token balance and allowance in base units, with decoded decimal precision. Both values belong
 * to the same account/spender/coordinate.
 */
export interface TokenSnapshot extends TokenReadInput {
  readonly balance: bigint;
  /**
   * Current total allowance for the named spender in this token's base units.
   */
  readonly allowance: bigint;
  /**
   * Decoded precision from 0 through 255; this is configuration, not a token amount.
   */
  readonly decimals: bigint;
}
/**
 * Anchored balance, allowance and precision reads; required failures reject rather than
 * yielding zero.
 */
export interface TokenReader {
  /**
   * Read balance, allowance and precision for the exact verified token/account/spender
   * coordinate; failures do not become zero.
   */
  read(input: TokenReadInput): Promise<Readonly<TokenSnapshot>>;
}
/**
 * Pure allowance decision. Reset is a separate zero-approval transaction before a later exact
 * positive approval.
 */
export type ApprovalPlan =
  | Readonly<{ kind: "sufficient" }>
  | Readonly<{ kind: "approve"; amount: bigint }>
  | Readonly<{ kind: "reset"; amount: 0n; requiredAmount: bigint }>;
/**
 * Observed allowance, chosen new allowance and exact call. Amount is the target allowance, not
 * an increment.
 */
export interface PreparedApproval {
  readonly before: Readonly<TokenSnapshot>;
  /**
   * Exact resulting allowance; zero explicitly revokes/resets it.
   */
  readonly amount: bigint;
  readonly transaction: Readonly<PreparedTransaction>;
}
/**
 * Explicit reset/approval lifecycle; successful approval does not execute the subsequent
 * protocol action.
 */
export interface ApprovalWriter {
  /**
   * Read the exact allowance and reject a mismatch with expectedAllowance. Amount is the new
   * total allowance; nonzero-to-nonzero changes require a separate zero reset.
   */
  prepare(
    input: TokenReadInput & {
      readonly operationId: string;
      readonly amount: bigint;
      readonly expectedAllowance: bigint;
    },
  ): Promise<Readonly<PreparedApproval>>;
  /**
   * Simulate the exact owned approve/reset call without submitting; preserve the result with
   * this preparation.
   */
  simulate(prepared: PreparedApproval): Promise<Readonly<SimulatedTransaction>>;
  /**
   * Revalidate and submit the matching writer-owned preparation/simulation through Core.
   * Returns a durable record, not confirmation or protocol completion. Recover an uncertain
   * send by its existing intent.
   */
  submit(
    prepared: PreparedApproval,
    simulation: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Match the persisted intent and confirmed receipt, then verify the Approval event and actual
   * allowance. Required evidence mismatches can reject even when the EVM receipt succeeded.
   */
  reconcile(
    prepared: PreparedApproval,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: Readonly<TokenSnapshot>;
    }>
  >;
}
/**
 * One receipt-owned token transfer in that token's base units; not a complete wallet balance
 * reconciliation.
 */
export interface TokenTransfer {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly amount: bigint;
}
const codec = createAbiCodec();
const abi = getTokenInterface();
function entry(name: string) {
  const found = abi.find((value) => value.name === name);
  if (!found) throw new TokenError("InvalidInput", "token interface unavailable");
  return found;
}
function nonzero(value: unknown): `0x${string}` {
  const address = parseAddress(value);
  if (address === `0x${"0".repeat(40)}`)
    throw new TokenError("InvalidInput", "zero token/account/spender");
  return address;
}
/**
 * Plan an exact ERC-20 allowance change without sending a transaction.
 *
 * @param input - Current allowance and required spend in the same token's base units.
 * @returns Sufficient allowance, an exact positive approval, or a zero-reset step.
 * @remarks
 * A nonzero insufficient allowance requires reset, confirmation and a fresh read
 * before the subsequent positive approval. No unlimited approval is inferred.
 */
export function planApproval(input: {
  readonly allowance: bigint;
  readonly requiredAmount: bigint;
}): ApprovalPlan {
  const allowance = parseUint(input.allowance);
  const requiredAmount = parseUint(input.requiredAmount);
  return Object.freeze(
    allowance >= requiredAmount
      ? { kind: "sufficient" }
      : allowance === 0n
        ? { kind: "approve", amount: requiredAmount }
        : { kind: "reset", amount: 0n, requiredAmount },
  );
}
/**
 * Create a token balance, allowance and precision reader at an explicit coordinate.
 *
 * @remarks
 * The owning protocol supplies the verified token target and spender. Reads validate
 * chain/hash consistency but do not discover or prove a token's economic identity.
 * Required RPC/decoding failures reject instead of becoming zero balances.
 */
export function createTokenReader(config: {
  readonly transport: RpcTransport;
}): Readonly<TokenReader> {
  return Object.freeze({
    async read(input: TokenReadInput) {
      if (!isContractId(input.target.contractId))
        throw new TokenError("InvalidInput", "unknown token root");
      const target = Object.freeze({ ...input.target, address: nonzero(input.target.address) });
      const account = nonzero(input.account);
      const spender = nonzero(input.spender);
      const coordinate = Object.freeze({
        ...input.coordinate,
        blockHash: parseHash32(input.coordinate.blockHash),
        blockNumber: parseUint(input.coordinate.blockNumber),
        chainId: parseUint(input.coordinate.chainId),
      });
      if (
        getNetwork(coordinate.networkId).evmChainId !== coordinate.chainId ||
        (await config.transport.getChainId()) !== coordinate.chainId
      )
        throw new TokenError("InvalidInput", "token read chain mismatch");
      const values = await Promise.all(
        [
          ["balanceOf", [account]],
          ["allowance", [account, spender]],
          ["decimals", []],
        ].map(async ([name, args]) => {
          if (typeof name !== "string" || !Array.isArray(args))
            throw new TokenError("InvalidInput", "read definition");
          const method = entry(name);
          const data = await config.transport.read({
            ...coordinate,
            contractId: target.contractId,
            address: target.address,
            data: codec.encodeFunction(
              method,
              args.map((value) => parseAddress(value)),
            ),
          });
          return parseUint(codec.decodeFunction(method, data)[0]);
        }),
      );
      const [balance, allowance, decimals] = values;
      if (
        balance === undefined ||
        allowance === undefined ||
        decimals === undefined ||
        decimals > 255n
      )
        throw new TokenError("InvalidInput", "token result");
      const block = await config.transport.getBlock(coordinate.blockNumber);
      if (
        block?.hash !== coordinate.blockHash ||
        (await config.transport.getChainId()) !== coordinate.chainId
      )
        throw new TokenError("InvalidInput", "token read coordinate changed");
      return Object.freeze({ target, account, spender, coordinate, balance, allowance, decimals });
    },
  });
}
/**
 * Create separate ERC-20 reset/approval operations over Core execution.
 *
 * @remarks
 * Preparation checks the expected allowance. Submit requires this writer's matching
 * preparation/simulation and rechecks allowance before signing. Reconciliation
 * matches the Approval event and receipt-block allowance. Approving does not
 * execute the intended protocol action; read and prepare that action again.
 */
export function createApprovalWriter(config: {
  readonly reader: TokenReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<ApprovalWriter> {
  const owned = new WeakSet<PreparedApproval>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedApproval>();
  function assertOwned(prepared: PreparedApproval) {
    if (!owned.has(prepared))
      throw new TokenError("InvalidInput", "prepare approval with this writer");
  }
  return Object.freeze({
    async prepare(input) {
      const before = await config.reader.read(input);
      const amount = parseUint(input.amount);
      if (before.allowance !== parseUint(input.expectedAllowance))
        throw new TokenError("StaleAllowance", "allowance changed");
      if (amount !== 0n && before.allowance !== 0n)
        throw new TokenError(
          "ResetRequired",
          "reset nonzero allowance before approving a new amount",
        );
      if (typeof input.operationId !== "string" || input.operationId.length === 0)
        throw new TokenError("InvalidInput", "operationId required");
      const transaction: Readonly<PreparedTransaction> = Object.freeze({
        operationId: input.operationId,
        contractId: before.target.contractId,
        ...(before.target.targetRole === undefined ? {} : { targetRole: before.target.targetRole }),
        coordinate: before.coordinate,
        from: before.account,
        to: before.target.address,
        value: 0n,
        data: codec.encodeFunction(entry("approve"), [before.spender, amount]),
      });
      const prepared = Object.freeze({ before, amount, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      const simulated = await config.execution.simulate(prepared.transaction);
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulation) {
      assertOwned(prepared);
      if (simulations.get(simulation) !== prepared)
        throw new TokenError("InvalidInput", "approval simulation mismatch");
      return config.execution.submit(simulation, async () => {
        const blockNumber = parseUint(await config.transport.getBlockNumber());
        const block = await config.transport.getBlock(blockNumber);
        if (!block) throw new TokenError("InvalidInput", "missing approval block");
        const fresh = await config.reader.read({
          ...prepared.before,
          coordinate: {
            ...prepared.before.coordinate,
            blockNumber,
            blockHash: parseHash32(block.hash),
          },
        });
        if (fresh.allowance !== prepared.before.allowance)
          throw new TokenError("StaleAllowance", "allowance changed before approval");
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
        throw new TokenError("ReconciliationMismatch", "approval intent differs");
      return config.execution.reconcile(record, async (receipt) => {
        const matching = getReceiptLogs(receipt, call.to)
          .map((log) => codec.decodeEvent(entry("Approval"), log))
          .filter(
            (value) =>
              value !== null && value[0] === call.from && value[1] === prepared.before.spender,
          );
        if (matching.length !== 1 || matching[0]?.[2] !== prepared.amount)
          throw new TokenError("ReconciliationMismatch", "approval event differs");
        const snapshot = await config.reader.read({
          ...prepared.before,
          coordinate: {
            ...call.coordinate,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
          },
        });
        if (snapshot.allowance !== prepared.amount)
          throw new TokenError("ReconciliationMismatch", "approval post-state differs");
        return snapshot;
      });
    },
  } satisfies ApprovalWriter);
}
/**
 * Decode a token's Transfer events after validating receipt/log ownership.
 *
 * @param receipt - The receipt whose transaction/block identities must match the logs.
 * @param token - Exact token emitter; unrelated event types are ignored.
 * @returns Normalized addresses and token-base-unit amounts. Transfers alone do not
 * prove a protocol action or an account's complete balance change.
 */
export function decodeTokenTransfers(
  receipt: ExecutionReceipt,
  token: `0x${string}`,
): readonly TokenTransfer[] {
  return Object.freeze(
    getReceiptLogs(receipt, token).flatMap((log) => {
      const values = codec.decodeEvent(entry("Transfer"), log);
      return values === null
        ? []
        : [
            Object.freeze({
              from: parseAddress(values[0]),
              to: parseAddress(values[1]),
              amount: parseUint(values[2]),
            }),
          ];
    }),
  );
}
