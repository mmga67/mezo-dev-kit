import type { Network } from "@mezo-dev-kit/chains";
import type { ContractId, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadTransport, ReadCoordinate } from "./read-client.ts";

/**
 * Exact unsigned EVM call with explicit sender, chain and nonce. Value is native base units;
 * wallet gas/fee policy remains external.
 */
export interface ExactTransaction {
  readonly chainId: bigint;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  /**
   * Native currency base units, independent of token amounts encoded in data.
   */
  readonly value: bigint;
  readonly data: `0x${string}`;
  /**
   * Explicit sender transaction sequence reserved together with the operation ID.
   */
  readonly nonce: bigint;
}
/**
 * Application-selected signer boundary. Core verifies account/chain before sending; the signer
 * owns wallet consent and fee handling.
 */
export interface ExecutionSigner {
  /**
   * Return the wallet-selected chain as untrusted input for Core validation.
   */
  getChainId(): Promise<unknown>;
  /**
   * Return the wallet-selected account as untrusted input; it must match the prepared sender.
   */
  getAddress(): Promise<unknown>;
  /**
   * Submit the exact supplied call once under application wallet consent and gas/fee policy. A
   * rejected response can still leave submission uncertain.
   */
  sendTransaction(call: Readonly<ExactTransaction>): Promise<unknown>;
}
/**
 * Untrusted provider ports for simulation and receipt observation. Implementations must
 * preserve exact calls and propagate uncertainty.
 */
export interface ExecutionTransport extends CoreReadTransport {
  /**
   * Return runtime code at the exact coordinate as untrusted provider data.
   */
  getCode(address: `0x${string}`, coordinate: ReadCoordinate): Promise<unknown>;
  /**
   * Simulate the exact call at the supplied coordinate without submitting; return untrusted ABI
   * output or propagate failure.
   */
  simulate(call: ExactTransaction, coordinate: ReadCoordinate): Promise<unknown>;
  /**
   * Read the pending sender nonce for reservation and duplicate-submission checks.
   */
  getNonce(account: `0x${string}`): Promise<unknown>;
  /**
   * Look up a transaction by hash, retaining missing data as absent rather than inventing an
   * included transaction.
   */
  getTransaction(hash: `0x${string}`): Promise<unknown>;
  /**
   * Look up receipt data for validation; absence is not a confirmed revert.
   */
  getReceipt(hash: `0x${string}`): Promise<unknown>;
}
/**
 * Exact intent anchored to the state used for preparation. It is neither a simulation result
 * nor a persisted submission record.
 */
export interface PreparedTransaction {
  readonly operationId: string;
  readonly contractId: ContractId;
  /** A root-discovered destination. Requires the explicit target resolver in Core config. */
  readonly targetRole?: string;
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly data: `0x${string}`;
}
/**
 * Exact call and return data admitted by one execution client. Object provenance is checked
 * before submission.
 */
export interface SimulatedTransaction {
  readonly prepared: Readonly<PreparedTransaction>;
  readonly call: Readonly<ExactTransaction>;
  readonly returnData: `0x${string}`;
}
/** Domain verifier retained for both initial and final exact simulation. */
export type SimulationVerifier = (
  returnData: `0x${string}`,
  coordinate: Readonly<ReadCoordinate>,
  call: Readonly<ExactTransaction>,
) => void | Promise<void>;
/** JSON-safe durable intent, written before the wallet is invoked. Contains no keys/signatures. */
export interface SubmissionRecord {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly networkId: Network["id"];
  readonly contractId: ContractId;
  readonly targetRole?: string;
  readonly blockNumber: string;
  readonly blockHash: `0x${string}`;
  readonly call: Readonly<{
    chainId: string;
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    data: `0x${string}`;
    nonce: string;
  }>;
  readonly hash: `0x${string}` | null;
  readonly inclusion: Readonly<{ blockNumber: string; blockHash: `0x${string}` }> | null;
}
/**
 * Durable intent reservation port. Implementations must atomically exclude duplicate operation
 * IDs and sender nonces across processes.
 */
export interface SubmissionStore {
  /** Atomic create-if-absent for both operationId AND (chainId, from, nonce), across all clients/processes. */
  reserve(record: Readonly<SubmissionRecord>): Promise<boolean>;
  /** Atomically attach the first hash; reject changing a previously recorded hash. */
  attachHash(operationId: string, hash: `0x${string}`): Promise<void>;
}
/**
 * Explicit execution dependencies and block policies. A durable atomic store is required for
 * restart-safe submission recovery.
 */
export interface ExecutionClientConfig {
  readonly network: Readonly<Network>;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: ExecutionTransport;
  readonly signer: ExecutionSigner;
  readonly store: SubmissionStore;
  /**
   * Maximum preparation age in blocks; zero permits only the preparation block.
   */
  readonly maxBlockAge: bigint;
  /**
   * Positive confirmation count required before protocol reconciliation.
   */
  readonly confirmations: bigint;
  readonly resolveTarget?: ExecutionTargetResolver;
}
/** Resolve and verify a domain role through its registered root at this exact coordinate. */
export type ExecutionTargetResolver = (
  input: Readonly<{
    contractId: ContractId;
    role: string;
    coordinate: Readonly<ReadCoordinate>;
  }>,
) => Promise<`0x${string}`>;
/**
 * Receipt identity and raw logs observed during execution tracking. Confirmation checks,
 * domain event decoding and outcome verification remain separate.
 */
export interface ExecutionReceipt {
  readonly transactionHash: `0x${string}`;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly logs: readonly unknown[];
}
/**
 * Current inclusion/confirmation result for an existing record. Submitted or confirmed does not
 * by itself establish protocol success.
 */
export type ExecutionObservation =
  | Readonly<{ state: "submission-uncertain" | "submitted" | "reorged"; record: SubmissionRecord }>
  | Readonly<{
      state: "included" | "confirmed" | "execution-reverted";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
    }>;
/**
 * Exact simulation/submission plus bounded observation and domain reconciliation. Uncertain
 * sends require recovery by persisted identity.
 */
export interface ExecutionClient {
  /**
   * Validate sender/chain, target, age and exact call, then retain its output verifier for
   * final simulation. No transaction is sent.
   */
  simulate(
    prepared: PreparedTransaction,
    verify?: SimulationVerifier,
  ): Promise<Readonly<SimulatedTransaction>>;
  /** Revalidate domain inputs immediately before the final exact simulation and submission. */
  submit(
    simulated: SimulatedTransaction,
    revalidate: (prepared: PreparedTransaction) => Promise<void>,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Inspect one persisted intent and recheck receipt inclusion/confirmations. Does not poll,
   * persist changes or resubmit automatically.
   */
  observe(record: unknown): Promise<ExecutionObservation>;
  /** Recover a lost hash or identify a replacement by checking sender/nonce and exact contents. */
  inspectHash(
    record: unknown,
    hash: `0x${string}`,
  ): Promise<
    Readonly<{ kind: "same-call" | "replacement" | "cancellation"; record: SubmissionRecord }>
  >;
  /**
   * Require confirmed canonical execution and run the supplied domain verifier; only its
   * successful result becomes outcome.
   */
  reconcile<T>(
    record: unknown,
    verify: (receipt: ExecutionReceipt) => Promise<T>,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: T;
    }>
  >;
}
