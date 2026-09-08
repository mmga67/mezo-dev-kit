import { getNetwork } from "@mezo-dev-kit/chains";
import { isContractId } from "@mezo-dev-kit/contracts";
import {
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
import { createCoreReadClient } from "./read-client.ts";
import { rpcObject } from "./rpc.ts";
import type {
  ExecutionClient,
  ExecutionClientConfig,
  ExecutionObservation,
  ExecutionReceipt,
  PreparedTransaction,
  SimulatedTransaction,
  SimulationVerifier,
  SubmissionRecord,
  SubmissionStore,
} from "./execution-types.ts";

export type ExecutionErrorCode =
  | "InvalidExecutionInput"
  | "ChainMismatch"
  | "AccountMismatch"
  | "StaleSimulation"
  | "SimulationFailed"
  | "DuplicateSubmission"
  | "SubmissionUncertain"
  | "InvalidTransaction"
  | "NotConfirmed"
  | "ReorgDetected";
export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly record: SubmissionRecord | null;
  constructor(
    code: ExecutionErrorCode,
    message: string,
    options: ErrorOptions & { readonly record?: SubmissionRecord } = {},
  ) {
    super(message, options);
    this.name = "ExecutionError";
    this.code = code;
    this.record = options.record ?? null;
  }
}

function role(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new ExecutionError("InvalidExecutionInput", "invalid target role");
  return value;
}

export function parseSubmissionRecord(value: unknown): Readonly<SubmissionRecord> {
  try {
    const record = rpcObject(value);
    if (
      record.schemaVersion !== 1 ||
      typeof record.operationId !== "string" ||
      record.operationId.length === 0 ||
      !isContractId(record.contractId) ||
      typeof record.blockNumber !== "string"
    )
      throw new TypeError("invalid submission envelope");
    const network = getNetwork(record.networkId);
    const raw = rpcObject(record.call);
    const included =
      record.inclusion === undefined || record.inclusion === null
        ? null
        : rpcObject(record.inclusion);
    if (included !== null && typeof included.blockNumber !== "string")
      throw new TypeError("inclusion number must be decimal text");
    for (const key of ["chainId", "value", "nonce"] as const)
      if (typeof raw[key] !== "string")
        throw new TypeError("submission integers must be decimal strings");
    const call = Object.freeze({
      chainId: parseUint(parseUnsignedInteger(raw.chainId)).toString(),
      from: parseAddress(raw.from),
      to: parseAddress(raw.to),
      value: parseUint(parseUnsignedInteger(raw.value)).toString(),
      data: parseHexData(raw.data),
      nonce: parseUint(parseUnsignedInteger(raw.nonce)).toString(),
    });
    if (BigInt(call.chainId) !== network.evmChainId)
      throw new TypeError("submission chain differs from network");
    return Object.freeze({
      schemaVersion: 1,
      operationId: record.operationId,
      networkId: network.id,
      contractId: record.contractId,
      ...(record.targetRole === undefined ? {} : { targetRole: role(record.targetRole) }),
      blockNumber: parseUint(parseUnsignedInteger(record.blockNumber)).toString(),
      blockHash: parseHash32(record.blockHash),
      call,
      hash: record.hash === null ? null : parseHash32(record.hash),
      inclusion:
        included === null
          ? null
          : Object.freeze({
              blockNumber: parseUint(parseUnsignedInteger(included.blockNumber)).toString(),
              blockHash: parseHash32(included.blockHash),
            }),
    });
  } catch (cause) {
    throw new ExecutionError("InvalidExecutionInput", "invalid versioned submission record", {
      cause,
    });
  }
}

/** Test/session convenience only. Applications requiring restart safety implement SubmissionStore durably. */
export function createMemorySubmissionStore(): Readonly<SubmissionStore> {
  const records = new Map<string, SubmissionRecord>();
  const nonces = new Set<string>();
  return Object.freeze({
    reserve: (input: SubmissionRecord) => {
      const record = parseSubmissionRecord(input);
      const nonceKey = `${record.call.chainId}:${record.call.from}:${record.call.nonce}`;
      if (records.has(record.operationId) || nonces.has(nonceKey)) return Promise.resolve(false);
      records.set(record.operationId, record);
      nonces.add(nonceKey);
      return Promise.resolve(true);
    },
    attachHash: (operationId: string, candidate: `0x${string}`) => {
      const hash = parseHash32(candidate);
      const record = records.get(operationId);
      if (!record || (record.hash !== null && record.hash !== hash))
        throw new ExecutionError("InvalidTransaction", "cannot overwrite submission hash");
      records.set(operationId, Object.freeze({ ...record, hash }));
      return Promise.resolve();
    },
  });
}

export function createExecutionClient(config: ExecutionClientConfig): Readonly<ExecutionClient> {
  const core = createCoreReadClient(config);
  const network = getNetwork(config.network.id);
  const maxAge = parseUint(config.maxBlockAge);
  const confirmations = parseUint(config.confirmations);
  if (confirmations === 0n)
    throw new ExecutionError("InvalidExecutionInput", "confirmations must be positive");
  const simulations = new WeakSet<SimulatedTransaction>();
  const simulationVerifiers = new WeakMap<SimulatedTransaction, SimulationVerifier>();
  const submitting = new WeakSet<SimulatedTransaction>();
  async function assertIdentity(from: `0x${string}`): Promise<void> {
    await core.assertChain();
    if (parseUint(await config.signer.getChainId()) !== network.evmChainId)
      throw new ExecutionError("ChainMismatch", "signer chain mismatch");
    if (parseAddress(await config.signer.getAddress()) !== from)
      throw new ExecutionError("AccountMismatch", "signer account mismatch");
  }
  async function assertFresh(prepared: PreparedTransaction): Promise<void> {
    const head = parseUint(await config.transport.getBlockNumber());
    if (head < prepared.coordinate.blockNumber || head - prepared.coordinate.blockNumber > maxAge)
      throw new ExecutionError("StaleSimulation", "prepared block exceeds configured age");
    const block = await config.transport.getBlock(prepared.coordinate.blockNumber);
    if (!block || parseHash32(block.hash) !== prepared.coordinate.blockHash)
      throw new ExecutionError("ReorgDetected", "prepared block changed");
    await assertDestination(prepared, prepared.coordinate);
  }
  async function assertDestination(
    target: Pick<PreparedTransaction, "contractId" | "targetRole" | "to">,
    coordinate: PreparedTransaction["coordinate"],
  ): Promise<void> {
    const contract = config.registry.resolve({
      contractId: target.contractId,
      networkId: network.id,
      blockNumber: coordinate.blockNumber,
    });
    let destination = contract.address;
    if (target.targetRole !== undefined) {
      if (!config.resolveTarget)
        throw new ExecutionError(
          "InvalidExecutionInput",
          "target role requires a verified resolver",
        );
      destination = parseAddress(
        await config.resolveTarget({
          contractId: target.contractId,
          role: role(target.targetRole),
          coordinate,
        }),
      );
    }
    if (destination !== target.to)
      throw new ExecutionError(
        "InvalidExecutionInput",
        "destination differs from resolved contract",
      );
  }
  function normalized(input: PreparedTransaction): Readonly<PreparedTransaction> {
    if (
      !input ||
      typeof input.operationId !== "string" ||
      input.operationId.length === 0 ||
      !isContractId(input.contractId)
    )
      throw new ExecutionError("InvalidExecutionInput", "operation identity required");
    const coordinate = Object.freeze({
      networkId: network.id,
      chainId: parseUint(input.coordinate.chainId),
      blockNumber: parseUint(input.coordinate.blockNumber),
      blockHash: parseHash32(input.coordinate.blockHash),
    });
    if (input.coordinate.networkId !== network.id || coordinate.chainId !== network.evmChainId)
      throw new ExecutionError("ChainMismatch", "prepared network mismatch");
    return Object.freeze({
      operationId: input.operationId,
      contractId: input.contractId,
      ...(input.targetRole === undefined ? {} : { targetRole: role(input.targetRole) }),
      coordinate,
      from: parseAddress(input.from),
      to: parseAddress(input.to),
      value: parseUint(input.value),
      data: parseHexData(input.data),
    });
  }
  async function simulate(
    input: PreparedTransaction,
    verify?: SimulationVerifier,
  ): Promise<Readonly<SimulatedTransaction>> {
    if (verify !== undefined && typeof verify !== "function")
      throw new ExecutionError("InvalidExecutionInput", "simulation verifier must be a function");
    const prepared = normalized(input);
    await assertIdentity(prepared.from);
    await assertFresh(prepared);
    if (
      parseHexData(await config.transport.getCode(prepared.from, prepared.coordinate)).length !== 2
    )
      throw new ExecutionError(
        "AccountMismatch",
        "initial execution supports EOAs without delegated code",
      );
    const call = Object.freeze({
      chainId: network.evmChainId,
      from: prepared.from,
      to: prepared.to,
      value: prepared.value,
      data: prepared.data,
      nonce: parseUint(await config.transport.getNonce(prepared.from)),
    });
    let returnData: `0x${string}`;
    try {
      returnData = parseHexData(await config.transport.simulate(call, prepared.coordinate));
      await verify?.(returnData, prepared.coordinate, call);
    } catch (cause) {
      throw new ExecutionError("SimulationFailed", "exact call simulation failed", { cause });
    }
    const result = Object.freeze({ prepared, call, returnData });
    simulations.add(result);
    if (verify) simulationVerifiers.set(result, verify);
    return result;
  }
  async function submit(
    simulated: SimulatedTransaction,
    revalidate: (prepared: PreparedTransaction) => Promise<void>,
  ): Promise<Readonly<SubmissionRecord>> {
    if (!simulations.has(simulated) || submitting.has(simulated))
      throw new ExecutionError("DuplicateSubmission", "simulation is foreign or already used");
    // Acquire before the first await: two simultaneous calls cannot reach the wallet.
    submitting.add(simulated);
    await revalidate(simulated.prepared);
    await assertIdentity(simulated.call.from);
    await assertFresh(simulated.prepared);
    if (parseUint(await config.transport.getNonce(simulated.call.from)) !== simulated.call.nonce)
      throw new ExecutionError("StaleSimulation", "account nonce changed; prepare again");
    const latestNumber = parseUint(await config.transport.getBlockNumber());
    const latestBlock = await config.transport.getBlock(latestNumber);
    if (!latestBlock) throw new ExecutionError("ReorgDetected", "latest block unavailable");
    const latestCoordinate = Object.freeze({
      ...simulated.prepared.coordinate,
      blockNumber: latestNumber,
      blockHash: parseHash32(latestBlock.hash),
    });
    await assertDestination(simulated.prepared, latestCoordinate);
    if (
      parseHexData(await config.transport.getCode(simulated.call.from, latestCoordinate)).length !==
      2
    )
      throw new ExecutionError("AccountMismatch", "sender code changed");
    try {
      const returnData = parseHexData(
        await config.transport.simulate(simulated.call, latestCoordinate),
      );
      await simulationVerifiers.get(simulated)?.(returnData, latestCoordinate, simulated.call);
    } catch (cause) {
      throw new ExecutionError("SimulationFailed", "final exact simulation failed", { cause });
    }
    // An asynchronous domain verifier must not leave signer/anchor checks behind it.
    await assertIdentity(simulated.call.from);
    await assertFresh(simulated.prepared);
    if (parseUint(await config.transport.getNonce(simulated.call.from)) !== simulated.call.nonce)
      throw new ExecutionError(
        "StaleSimulation",
        "account nonce changed during output verification",
      );
    if (
      (await config.transport.getBlock(latestCoordinate.blockNumber))?.hash !==
      latestCoordinate.blockHash
    )
      throw new ExecutionError("ReorgDetected", "final simulation anchor changed");
    const record = parseSubmissionRecord({
      schemaVersion: 1,
      operationId: simulated.prepared.operationId,
      networkId: network.id,
      contractId: simulated.prepared.contractId,
      ...(simulated.prepared.targetRole === undefined
        ? {}
        : { targetRole: simulated.prepared.targetRole }),
      blockNumber: simulated.prepared.coordinate.blockNumber.toString(),
      blockHash: simulated.prepared.coordinate.blockHash,
      call: {
        ...simulated.call,
        chainId: simulated.call.chainId.toString(),
        value: simulated.call.value.toString(),
        nonce: simulated.call.nonce.toString(),
      },
      hash: null,
    });
    if (!(await config.store.reserve(record)))
      throw new ExecutionError(
        "DuplicateSubmission",
        "operation or sender nonce already reserved",
        { record },
      );
    let result = record;
    try {
      const hash = parseHash32(await config.signer.sendTransaction(simulated.call));
      result = Object.freeze({ ...record, hash });
      await config.store.attachHash(record.operationId, hash);
      return result;
    } catch (cause) {
      throw new ExecutionError(
        "SubmissionUncertain",
        "submission intent is reserved; investigate before any further submission",
        { cause, record: result },
      );
    }
  }
  async function validateRecord(value: unknown): Promise<SubmissionRecord> {
    const record = parseSubmissionRecord(value);
    if (record.networkId !== network.id)
      throw new ExecutionError("ChainMismatch", "record network mismatch");
    await core.assertChain();
    if (record.targetRole !== undefined) {
      if (!config.resolveTarget)
        throw new ExecutionError(
          "InvalidExecutionInput",
          "target role requires a verified resolver",
        );
      const anchor = await config.transport.getBlock(BigInt(record.blockNumber));
      if (!anchor || parseHash32(anchor.hash) !== record.blockHash)
        throw new ExecutionError(
          "ReorgDetected",
          "role preparation block changed; verify the destination before recovery",
          { record },
        );
    }
    await assertDestination(
      { ...record, to: record.call.to },
      {
        networkId: record.networkId,
        chainId: network.evmChainId,
        blockNumber: BigInt(record.blockNumber),
        blockHash: record.blockHash,
      },
    );
    return record;
  }
  async function inspectHash(value: unknown, hash: `0x${string}`) {
    const record = await validateRecord(value);
    await core.assertChain();
    const candidateHash = parseHash32(hash);
    const transaction = rpcObject(await config.transport.getTransaction(candidateHash));
    if (
      parseHash32(transaction.hash) !== candidateHash ||
      parseAddress(transaction.from) !== record.call.from ||
      parseRpcQuantity(transaction.nonce) !== BigInt(record.call.nonce) ||
      (transaction.chainId !== undefined &&
        parseRpcQuantity(transaction.chainId) !== network.evmChainId)
    )
      throw new ExecutionError(
        "InvalidTransaction",
        "transaction hash, chain, sender or nonce mismatch",
      );
    const to = transaction.to === null ? null : parseAddress(transaction.to);
    const data = parseHexData(transaction.input);
    const amount = parseRpcQuantity(transaction.value);
    const same =
      to === record.call.to && data === record.call.data && amount === BigInt(record.call.value);
    const kind = same
      ? "same-call"
      : to === record.call.from && data.length === 2 && amount === 0n
        ? "cancellation"
        : "replacement";
    return Object.freeze({
      kind,
      record: Object.freeze({ ...record, hash: candidateHash, inclusion: null }),
    });
  }
  async function observe(value: unknown): Promise<ExecutionObservation> {
    let record: SubmissionRecord;
    try {
      record = await validateRecord(value);
    } catch (error) {
      if (error instanceof ExecutionError && error.code === "ReorgDetected" && error.record)
        return Object.freeze({ state: "reorged", record: error.record });
      throw error;
    }
    await core.assertChain();
    if (record.hash === null) return Object.freeze({ state: "submission-uncertain", record });
    const raw = await config.transport.getReceipt(record.hash);
    if (raw === null)
      return Object.freeze({ state: record.inclusion === null ? "submitted" : "reorged", record });
    const inspected = await inspectHash(record, record.hash);
    if (inspected.kind !== "same-call")
      throw new ExecutionError(
        "InvalidTransaction",
        "mined transaction differs from simulated action",
      );
    const object = rpcObject(raw);
    if (
      parseHash32(object.transactionHash) !== record.hash ||
      parseAddress(object.from) !== record.call.from ||
      parseAddress(object.to) !== record.call.to ||
      !Array.isArray(object.logs)
    )
      throw new ExecutionError("InvalidTransaction", "receipt identity mismatch");
    const status = parseRpcQuantity(object.status);
    if (status !== 0n && status !== 1n)
      throw new ExecutionError("InvalidTransaction", "invalid receipt status");
    const receipt: ExecutionReceipt = Object.freeze({
      transactionHash: record.hash,
      blockNumber: parseRpcQuantity(object.blockNumber),
      blockHash: parseHash32(object.blockHash),
      logs: Object.freeze([...(object.logs as unknown[])]),
    });
    const block = await config.transport.getBlock(receipt.blockNumber);
    if (!block || parseHash32(block.hash) !== receipt.blockHash)
      return Object.freeze({ state: "reorged", record });
    const head = parseUint(await config.transport.getBlockNumber());
    if (head < receipt.blockNumber) return Object.freeze({ state: "reorged", record });
    const state =
      status === 0n
        ? "execution-reverted"
        : head - receipt.blockNumber + 1n >= confirmations
          ? "confirmed"
          : "included";
    if (record.inclusion !== null && record.inclusion.blockHash !== receipt.blockHash)
      return Object.freeze({
        state: "reorged",
        record: Object.freeze({ ...record, inclusion: null }),
      });
    return Object.freeze({
      state,
      record: Object.freeze({
        ...record,
        inclusion: Object.freeze({
          blockNumber: receipt.blockNumber.toString(),
          blockHash: receipt.blockHash,
        }),
      }),
      receipt,
    });
  }
  async function reconcile<T>(value: unknown, verify: (receipt: ExecutionReceipt) => Promise<T>) {
    const observation = await observe(value);
    if (observation.state !== "confirmed")
      throw new ExecutionError("NotConfirmed", `cannot reconcile ${observation.state}`, {
        record: observation.record,
      });
    const outcome = await verify(observation.receipt);
    const finalBlock = await config.transport.getBlock(observation.receipt.blockNumber);
    if (!finalBlock || parseHash32(finalBlock.hash) !== observation.receipt.blockHash)
      throw new ExecutionError("ReorgDetected", "receipt changed during reconciliation", {
        record: observation.record,
      });
    return Object.freeze({
      state: "reconciled" as const,
      record: observation.record,
      receipt: observation.receipt,
      outcome,
    });
  }
  return Object.freeze({ simulate, submit, observe, inspectHash, reconcile });
}
