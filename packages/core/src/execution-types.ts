import type { Network } from "@mezo-dev-kit/chains";
import type { ContractId, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadTransport, ReadCoordinate } from "./read-client.ts";

export interface ExactTransaction {
  readonly chainId: bigint;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly value: bigint;
  readonly data: `0x${string}`;
  readonly nonce: bigint;
}
export interface ExecutionSigner {
  getChainId(): Promise<unknown>;
  getAddress(): Promise<unknown>;
  sendTransaction(call: Readonly<ExactTransaction>): Promise<unknown>;
}
export interface ExecutionTransport extends CoreReadTransport {
  getCode(address: `0x${string}`, coordinate: ReadCoordinate): Promise<unknown>;
  simulate(call: ExactTransaction, coordinate: ReadCoordinate): Promise<unknown>;
  getNonce(account: `0x${string}`): Promise<unknown>;
  getTransaction(hash: `0x${string}`): Promise<unknown>;
  getReceipt(hash: `0x${string}`): Promise<unknown>;
}
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
export interface SubmissionStore {
  /** Atomic create-if-absent for both operationId AND (chainId, from, nonce), across all clients/processes. */
  reserve(record: Readonly<SubmissionRecord>): Promise<boolean>;
  /** Atomically attach the first hash; reject changing a previously recorded hash. */
  attachHash(operationId: string, hash: `0x${string}`): Promise<void>;
}
export interface ExecutionClientConfig {
  readonly network: Readonly<Network>;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: ExecutionTransport;
  readonly signer: ExecutionSigner;
  readonly store: SubmissionStore;
  readonly maxBlockAge: bigint;
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
export interface ExecutionReceipt {
  readonly transactionHash: `0x${string}`;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly logs: readonly unknown[];
}
export type ExecutionObservation =
  | Readonly<{ state: "submission-uncertain" | "submitted" | "reorged"; record: SubmissionRecord }>
  | Readonly<{
      state: "included" | "confirmed" | "execution-reverted";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
    }>;
export interface ExecutionClient {
  simulate(
    prepared: PreparedTransaction,
    verify?: SimulationVerifier,
  ): Promise<Readonly<SimulatedTransaction>>;
  /** Revalidate domain inputs immediately before the final exact simulation and submission. */
  submit(
    simulated: SimulatedTransaction,
    revalidate: (prepared: PreparedTransaction) => Promise<void>,
  ): Promise<Readonly<SubmissionRecord>>;
  observe(record: unknown): Promise<ExecutionObservation>;
  /** Recover a lost hash or identify a replacement by checking sender/nonce and exact contents. */
  inspectHash(
    record: unknown,
    hash: `0x${string}`,
  ): Promise<
    Readonly<{ kind: "same-call" | "replacement" | "cancellation"; record: SubmissionRecord }>
  >;
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
