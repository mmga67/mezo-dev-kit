import { isHash32, parseHash32 } from "@mezo-dev-kit/evm";
import { createCoreError, serializeError } from "./errors.ts";
import {
  callsEqual,
  describeCall,
  normalizeAddress,
  normalizeBlockNumber,
  normalizeCall,
  normalizeChainId,
  normalizeTransactionHash,
} from "./validation.ts";
import { createLifecycle, transitionLifecycle } from "./lifecycle.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { Address, Call, CallInput, TransactionHash } from "./validation.ts";

type Awaitable<T> = T | Promise<T>;

export interface CoreNetworkInput {
  readonly id: string;
  readonly chainId: bigint | string;
}

export interface BlockLike {
  readonly hash?: unknown;
  readonly [key: string]: unknown;
}

export interface ReceiptLike {
  readonly blockNumber: unknown;
  readonly blockHash: unknown;
  readonly status: unknown;
  readonly [key: string]: unknown;
}

export interface TransportContext {
  readonly networkId: string;
  readonly blockNumber: bigint;
}

export interface CoreTransport {
  readonly id: string;
  getChainId(): Awaitable<unknown>;
  getBlockNumber(): Awaitable<unknown>;
  getBlock(blockNumber: bigint): Awaitable<BlockLike | null | undefined>;
  read(request: unknown, context: TransportContext): Awaitable<unknown>;
  simulate(call: Readonly<Call>, context: TransportContext): Awaitable<unknown>;
  getTransactionReceipt(
    transactionHash: TransactionHash,
  ): Awaitable<ReceiptLike | null | undefined>;
}

export interface CoreSigner {
  getChainId(): Awaitable<unknown>;
  getAddress?(): Awaitable<unknown>;
  sendTransaction(call: Readonly<Call>): Awaitable<unknown>;
}

export interface DeploymentCandidate {
  readonly id: string;
  readonly contractId: string;
  readonly networkId: string;
  readonly address: unknown;
  readonly [key: string]: unknown;
}

export interface DeploymentCoordinate {
  readonly blockNumber: bigint;
}

export interface ResolvedDeployment extends Omit<DeploymentCandidate, "address"> {
  readonly address: Address;
  readonly validityCoordinate: DeploymentCoordinate;
}

export interface DeploymentRegistry {
  resolveDeployment(input: {
    readonly contractId: string;
    readonly networkId: string;
    readonly validityCoordinate: DeploymentCoordinate;
  }): Awaitable<DeploymentCandidate | null | undefined>;
}

export interface ConfirmationPolicyInput {
  readonly confirmations: bigint | string;
}

export interface CoreClientConfig {
  readonly network: CoreNetworkInput;
  readonly transport: CoreTransport;
  readonly registry: DeploymentRegistry;
  readonly signer?: CoreSigner | null;
  readonly confirmationPolicy: ConfirmationPolicyInput;
  readonly now?: () => number;
}

export interface ReadCall {
  readonly id: string;
  readonly request: unknown;
  readonly required?: boolean;
}

export interface CoreSimulation {
  readonly operationId: string;
  readonly networkId: string;
  readonly deploymentId: string;
  readonly contractId: string;
  readonly blockNumber: bigint;
  readonly request: Readonly<Call>;
  readonly result: unknown;
  readonly lifecycle: Readonly<Lifecycle>;
  readonly debug: Readonly<Record<string, unknown>>;
}

export interface TrackedTransaction extends CoreSimulation {
  readonly hash: TransactionHash;
  readonly submittedAt: number;
  readonly lifecycle: Readonly<Lifecycle>;
  readonly receipt?: ReceiptLike | null;
  readonly headBlockNumber?: bigint;
  readonly canonicalBlockHash?: string;
  readonly confirmations?: bigint;
}

interface ValidatedConfiguration {
  readonly network: Readonly<{ id: string; chainId: bigint }>;
  readonly transport: CoreTransport;
  readonly registry: DeploymentRegistry;
  readonly signer: CoreSigner | null;
  readonly confirmationPolicy: Readonly<{ confirmations: bigint }>;
  readonly now: () => number;
}

function buildCoreClient({
  network,
  transport,
  registry,
  signer = null,
  confirmationPolicy,
  now = () => Date.now(),
}: CoreClientConfig) {
  const configuration = validateConfiguration({
    network,
    transport,
    registry,
    signer,
    confirmationPolicy,
    now,
  });
  const liveSimulations = new WeakSet<CoreSimulation>();
  const submittedSimulations = new WeakSet<CoreSimulation>();
  const transportCall = <T>(
    operation: string,
    acceptedUnknown: boolean,
    callback: () => Awaitable<T>,
  ) => providerCall(configuration.transport.id, operation, acceptedUnknown, callback);

  async function assertChain({ requireSigner = false }: { readonly requireSigner?: boolean } = {}) {
    const expectedChainId = configuration.network.chainId;
    const transportChainId = normalizeChainId(
      await transportCall("chain-assertion", false, () => configuration.transport.getChainId()),
      "transportChainId",
    );
    let signerChainId = null;
    if (configuration.signer) {
      try {
        signerChainId = normalizeChainId(await configuration.signer.getChainId(), "signerChainId");
      } catch (error) {
        throw providerError(
          "signer",
          "chain-assertion",
          false,
          "Signer chain assertion failed",
          error,
        );
      }
    } else if (requireSigner) {
      throw providerError("signer", "chain-assertion", false, "A signer is required");
    }
    if (
      transportChainId !== expectedChainId ||
      (signerChainId !== null && signerChainId !== expectedChainId)
    ) {
      throw createCoreError("ChainMismatch", {
        expectedChainId: expectedChainId.toString(),
        transportChainId: transportChainId.toString(),
        signerChainId: signerChainId?.toString() ?? null,
      });
    }
    return Object.freeze({ expectedChainId, transportChainId, signerChainId });
  }

  async function resolveDeployment({
    contractId,
    blockNumber,
    supportPolicy,
  }: {
    readonly contractId: string;
    readonly blockNumber?: bigint | string;
    readonly supportPolicy: (candidate: DeploymentCandidate) => boolean;
  }): Promise<Readonly<ResolvedDeployment>> {
    requiredText(contractId, "contractId");
    if (typeof supportPolicy !== "function") throw new TypeError("supportPolicy must be explicit");
    await assertChain();
    const coordinate = Object.freeze({
      blockNumber:
        blockNumber === undefined
          ? normalizeBlockNumber(
              await transportCall("get-block-number", false, () =>
                configuration.transport.getBlockNumber(),
              ),
            )
          : normalizeBlockNumber(blockNumber),
    });
    let deployment;
    try {
      deployment = await configuration.registry.resolveDeployment({
        contractId,
        networkId: configuration.network.id,
        validityCoordinate: coordinate,
      });
    } catch (error) {
      throw createCoreError(
        "MissingDeployment",
        {
          networkId: configuration.network.id,
          contractId,
          validityCoordinate: { blockNumber: coordinate.blockNumber.toString() },
        },
        { message: "Deployment resolution failed", cause: error },
      );
    }
    if (
      deployment?.contractId !== contractId ||
      deployment.networkId !== configuration.network.id ||
      !supportPolicy(deployment)
    ) {
      throw createCoreError("MissingDeployment", {
        networkId: configuration.network.id,
        contractId,
        validityCoordinate: { blockNumber: coordinate.blockNumber.toString() },
      });
    }
    return Object.freeze({
      ...deployment,
      address: normalizeAddress(deployment.address, "deployment.address"),
      validityCoordinate: coordinate,
    });
  }

  async function readCoherent({
    calls,
    blockNumber,
  }: {
    readonly calls: readonly ReadCall[];
    readonly blockNumber?: bigint | string;
  }) {
    await assertChain();
    validateReadCalls(calls);
    const number =
      blockNumber === undefined
        ? normalizeBlockNumber(
            await transportCall("get-block-number", false, () =>
              configuration.transport.getBlockNumber(),
            ),
          )
        : normalizeBlockNumber(blockNumber);
    const block = await transportCall("get-block", false, () =>
      configuration.transport.getBlock(number),
    );
    const coordinate = Object.freeze({
      blockNumber: number,
      blockHash: normalizeBlockHash(block?.hash, "block.hash"),
    });
    const settled = await Promise.all(
      calls.map(async (call) => {
        try {
          const value = await configuration.transport.read(call.request, {
            networkId: configuration.network.id,
            blockNumber: number,
          });
          return Object.freeze({
            id: call.id,
            required: call.required !== false,
            status: "fulfilled" as const,
            value,
          });
        } catch (error) {
          const typedError =
            error instanceof Error && typeof toRecord(error).code === "string"
              ? error
              : providerError(
                  configuration.transport.id,
                  "read",
                  false,
                  `Read '${call.id}' failed`,
                  error,
                );
          return Object.freeze({
            id: call.id,
            required: call.required !== false,
            status: "rejected" as const,
            error: serializeError(typedError),
          });
        }
      }),
    );
    const failedRequired = settled.filter((item) => item.required && item.status === "rejected");
    if (failedRequired.length > 0) {
      throw createCoreError("PartialReadError", {
        blockCoordinate: printableCoordinate(coordinate),
        failedItems: failedRequired.map((item) => item.id),
        requiredItems: calls.filter((item) => item.required !== false).map((item) => item.id),
      });
    }
    return Object.freeze({
      networkId: configuration.network.id,
      coordinate,
      consistency: "block",
      results: Object.freeze(settled),
      debug: Object.freeze({
        providerId: configuration.transport.id,
        blockCoordinate: printableCoordinate(coordinate),
        requiredItems: calls.filter((item) => item.required !== false).map((item) => item.id),
        optionalItems: calls.filter((item) => item.required === false).map((item) => item.id),
      }),
    });
  }

  async function simulateExact({
    operationId,
    deployment,
    call,
    blockNumber,
    entrypoint = "unknown",
  }: {
    readonly operationId: string;
    readonly deployment: DeploymentCandidate;
    readonly call: CallInput;
    readonly blockNumber?: bigint | string;
    readonly entrypoint?: string;
  }): Promise<Readonly<CoreSimulation>> {
    await assertChain({ requireSigner: false });
    validateDeployment(deployment, configuration.network.id);
    const request = normalizeCall(call);
    if (request.to !== normalizeAddress(deployment.address, "deployment.address")) {
      throw new TypeError("simulation destination differs from the resolved deployment");
    }
    const constructedLifecycle = createLifecycle({ operationId, call: describeCall(request) });
    const number =
      blockNumber === undefined
        ? normalizeBlockNumber(
            await transportCall("get-block-number", false, () =>
              configuration.transport.getBlockNumber(),
            ),
          )
        : normalizeBlockNumber(blockNumber);
    let result;
    try {
      result = await configuration.transport.simulate(request, {
        networkId: configuration.network.id,
        blockNumber: number,
      });
    } catch (error) {
      const errorRecord = toRecord(error);
      if (errorRecord.kind !== "revert" && errorRecord.data === undefined) {
        throw providerError(
          configuration.transport.id,
          "simulate",
          false,
          "Simulation transport failed",
          error,
        );
      }
      const failedLifecycle = transitionLifecycle(constructedLifecycle, "simulation-reverted", {
        entrypoint,
      });
      const revertError = createCoreError(
        "ContractRevert",
        {
          contractId: deployment.contractId,
          entrypoint,
          decodedError: errorRecord.decodedError ?? null,
          rawRevertData: errorRecord.data ?? null,
          lifecycleState: failedLifecycle.state,
        },
        { cause: error },
      );
      revertError.lifecycle = failedLifecycle;
      throw revertError;
    }
    const resultRecord = toRecord(result);
    if (resultRecord.request !== undefined && !callsEqual(resultRecord.request, request)) {
      throw providerError(
        configuration.transport.id,
        "simulate",
        false,
        "Transport simulated a different call",
      );
    }
    const lifecycle = transitionLifecycle(constructedLifecycle, "simulation-succeeded", {
      blockNumber: number.toString(),
    });
    const simulation = Object.freeze({
      operationId,
      networkId: configuration.network.id,
      deploymentId: deployment.id,
      contractId: deployment.contractId,
      blockNumber: number,
      request,
      result,
      lifecycle,
      debug: Object.freeze({
        providerId: configuration.transport.id,
        networkId: configuration.network.id,
        deploymentId: deployment.id,
        contractId: deployment.contractId,
        blockNumber: number.toString(),
        call: describeCall(request),
      }),
    });
    liveSimulations.add(simulation);
    return simulation;
  }

  async function submitSimulated(
    simulation: CoreSimulation,
  ): Promise<Readonly<TrackedTransaction>> {
    if (!liveSimulations.has(simulation))
      throw new TypeError("simulation was not created by this client");
    if (submittedSimulations.has(simulation)) {
      throw providerError("signer", "submit", true, "The simulated intent was already submitted");
    }
    await assertChain({ requireSigner: true });
    const signer = configuration.signer;
    if (!signer) throw providerError("signer", "submit", false, "A signer is required");
    if (signer.getAddress) {
      let signerAddress;
      try {
        signerAddress = normalizeAddress(await signer.getAddress(), "signer.address");
      } catch (error) {
        throw providerError(
          "signer",
          "account-assertion",
          false,
          "Signer account assertion failed",
          error,
        );
      }
      if (simulation.request.from !== undefined && simulation.request.from !== signerAddress) {
        throw providerError(
          "signer",
          "submit",
          false,
          "Signer address differs from simulated sender",
        );
      }
    }
    submittedSimulations.add(simulation);
    let response;
    try {
      response = await signer.sendTransaction(simulation.request);
    } catch (error) {
      throw providerError(
        "signer",
        "submit",
        true,
        "Transaction submission outcome is unknown",
        error,
      );
    }
    const responseRecord = toRecord(response);
    const hash = normalizeTransactionHash(responseRecord.hash ?? response);
    const lifecycle = transitionLifecycle(simulation.lifecycle, "action-submitted", {
      actionHash: hash,
    });
    return Object.freeze({
      ...simulation,
      hash,
      submittedAt: configuration.now(),
      lifecycle,
      debug: Object.freeze({ ...simulation.debug, transactionHash: hash }),
    });
  }

  async function observeTransaction(
    tracked: TrackedTransaction,
    { deadline = null }: { readonly deadline?: number | string | null } = {},
  ) {
    validateTracked(tracked);
    await assertChain();
    let lifecycle = tracked.lifecycle;
    const receipt = await transportCall("get-transaction-receipt", true, () =>
      configuration.transport.getTransactionReceipt(tracked.hash),
    );
    const head = normalizeBlockNumber(
      await transportCall("get-block-number", false, () =>
        configuration.transport.getBlockNumber(),
      ),
    );
    if (receipt === null || receipt === undefined) {
      if (
        deadline !== null &&
        configuration.now() >= normalizeDeadline(deadline) &&
        lifecycle.state === "submitted"
      ) {
        lifecycle = transitionLifecycle(lifecycle, "wait-timeout", {
          deadline: String(deadline),
          lastCheckedBlock: head.toString(),
        });
      }
      return Object.freeze({ ...tracked, lifecycle, receipt: null, headBlockNumber: head });
    }

    const receiptBlock = normalizeBlockNumber(receipt.blockNumber, "receipt.blockNumber");
    const status = normalizeReceiptStatus(receipt.status, configuration.transport.id);
    if (status === "failed") {
      if (!["submitted", "timed-out"].includes(lifecycle.state)) {
        throw new Error(`failed receipt is invalid from '${lifecycle.state}'`);
      }
      lifecycle = transitionLifecycle(lifecycle, "failed-receipt-observed", {
        blockNumber: receiptBlock.toString(),
      });
      return Object.freeze({ ...tracked, lifecycle, receipt, headBlockNumber: head });
    }

    if (["submitted", "timed-out"].includes(lifecycle.state)) {
      lifecycle = transitionLifecycle(lifecycle, "successful-receipt-observed", {
        blockNumber: receiptBlock.toString(),
      });
    }
    const canonicalBlock = await transportCall("get-block", false, () =>
      configuration.transport.getBlock(receiptBlock),
    );
    const receiptBlockHash = normalizeBlockHash(receipt.blockHash, "receipt.blockHash");
    const canonicalBlockHash = normalizeBlockHash(canonicalBlock?.hash, "canonicalBlock.hash");
    if (receiptBlockHash !== canonicalBlockHash) {
      if (!["included", "confirmed"].includes(lifecycle.state)) {
        throw new Error(`reorg observation is invalid from '${lifecycle.state}'`);
      }
      lifecycle = transitionLifecycle(lifecycle, "reorg-detected", {
        formerBlockHash: receiptBlockHash,
        detectionBlock: head.toString(),
      });
      return Object.freeze({
        ...tracked,
        lifecycle,
        receipt,
        headBlockNumber: head,
        canonicalBlockHash,
        confirmations: 0n,
      });
    }

    if (head < receiptBlock) {
      throw providerError(
        configuration.transport.id,
        "get-block-number",
        false,
        "Provider head is behind the observed receipt",
      );
    }
    const confirmations = head - receiptBlock + 1n;
    if (
      lifecycle.state === "included" &&
      confirmations >= configuration.confirmationPolicy.confirmations
    ) {
      lifecycle = transitionLifecycle(lifecycle, "confirmation-threshold-met", {
        confirmations: confirmations.toString(),
      });
    }
    return Object.freeze({
      ...tracked,
      lifecycle,
      receipt,
      headBlockNumber: head,
      canonicalBlockHash,
      confirmations,
    });
  }

  async function resumeAfterReorg(tracked: TrackedTransaction) {
    validateTracked(tracked);
    if (tracked.lifecycle.state !== "reorged")
      throw new Error("only reorged transactions resume tracking");
    return Object.freeze({
      ...tracked,
      receipt: null,
      confirmations: 0n,
      lifecycle: transitionLifecycle(tracked.lifecycle, "tracking-resumed"),
    });
  }

  function markReplacement(
    tracked: TrackedTransaction,
    {
      replacementHash,
      reason,
      successorOperationId,
    }: {
      readonly replacementHash: TransactionHash;
      readonly reason: string;
      readonly successorOperationId: string;
    },
  ) {
    validateTracked(tracked);
    if (!["submitted", "timed-out"].includes(tracked.lifecycle.state)) {
      throw new Error(`replacement is invalid from '${tracked.lifecycle.state}'`);
    }
    return Object.freeze({
      ...tracked,
      lifecycle: transitionLifecycle(tracked.lifecycle, "replacement-observed", {
        replacementHash,
        reason,
        successorOperationId,
      }),
    });
  }

  function markCancellation(
    tracked: TrackedTransaction,
    { cancellationHash }: { readonly cancellationHash: TransactionHash },
  ) {
    validateTracked(tracked);
    if (!["submitted", "timed-out"].includes(tracked.lifecycle.state)) {
      throw new Error(`cancellation is invalid from '${tracked.lifecycle.state}'`);
    }
    return Object.freeze({
      ...tracked,
      lifecycle: transitionLifecycle(tracked.lifecycle, "cancellation-observed", {
        cancellationHash,
      }),
    });
  }

  async function reconcile(
    confirmed: TrackedTransaction,
    {
      expectedOutcome,
      reconciler,
    }: {
      readonly expectedOutcome: unknown;
      readonly reconciler: (input: {
        readonly networkId: string;
        readonly transactionHash: TransactionHash;
        readonly receipt: ReceiptLike;
        readonly expectedOutcome: unknown;
      }) => Awaitable<unknown>;
    },
  ) {
    validateTracked(confirmed);
    if (confirmed.lifecycle.state !== "confirmed") {
      throw new Error("protocol reconciliation requires a confirmed transaction");
    }
    if (typeof reconciler !== "function") throw new TypeError("reconciler must be a function");
    if (!confirmed.receipt) throw new TypeError("confirmed transaction receipt is required");
    let observed: unknown;
    try {
      observed = await reconciler({
        networkId: configuration.network.id,
        transactionHash: confirmed.hash,
        receipt: confirmed.receipt,
        expectedOutcome,
      });
    } catch (error) {
      observed = { matched: false, error: serializeError(error) };
    }
    const matched = toRecord(observed).matched === true;
    const lifecycle = transitionLifecycle(
      confirmed.lifecycle,
      matched ? "protocol-reconciliation-succeeded" : "protocol-reconciliation-failed",
      { expectedOutcome, observedOutcome: observed ?? null },
    );
    const result = Object.freeze({ ...confirmed, lifecycle, reconciliation: observed ?? null });
    if (!matched) {
      throw createCoreError(
        "ReconciliationError",
        {
          transactionHash: confirmed.hash,
          receiptBlock: normalizeBlockNumber(confirmed.receipt.blockNumber).toString(),
          expectedOutcome,
          observedOutcome: observed ?? null,
          lifecycleState: result.lifecycle.state,
        },
        { message: "Protocol reconciliation did not match the expected outcome" },
      );
    }
    return result;
  }

  return Object.freeze({
    network: configuration.network,
    assertChain,
    resolveDeployment,
    readCoherent,
    simulateExact,
    submitSimulated,
    observeTransaction,
    resumeAfterReorg,
    markReplacement,
    markCancellation,
    reconcile,
  });
}

export type CoreClient = ReturnType<typeof buildCoreClient>;

export function createCoreClient(configuration: CoreClientConfig): CoreClient {
  return buildCoreClient(configuration);
}

function validateConfiguration({
  network,
  transport,
  registry,
  signer = null,
  confirmationPolicy,
  now = () => Date.now(),
}: CoreClientConfig): ValidatedConfiguration {
  if (!network || typeof network.id !== "string" || network.id.length === 0) {
    throw new TypeError("network.id is required");
  }
  if (!transport || typeof transport.id !== "string" || transport.id.length === 0) {
    throw new TypeError("transport.id is required");
  }
  for (const method of [
    "getChainId",
    "getBlockNumber",
    "getBlock",
    "read",
    "simulate",
    "getTransactionReceipt",
  ] as const) {
    if (typeof transport[method] !== "function")
      throw new TypeError(`transport.${method} is required`);
  }
  if (!registry || typeof registry.resolveDeployment !== "function") {
    throw new TypeError("registry.resolveDeployment is required");
  }
  if (signer) {
    for (const method of ["getChainId", "sendTransaction"] as const) {
      if (typeof signer[method] !== "function") throw new TypeError(`signer.${method} is required`);
    }
  }
  if (confirmationPolicy?.confirmations === undefined) {
    throw new TypeError("confirmationPolicy.confirmations is required");
  }
  const confirmations = normalizeBlockNumber(
    confirmationPolicy.confirmations,
    "confirmationPolicy.confirmations",
  );
  if (confirmations < 1n) throw new TypeError("confirmationPolicy.confirmations must be positive");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  return Object.freeze({
    network: Object.freeze({ id: network.id, chainId: normalizeChainId(network.chainId) }),
    transport,
    registry,
    signer,
    confirmationPolicy: Object.freeze({ confirmations }),
    now,
  });
}

function validateReadCalls(calls: unknown): asserts calls is readonly ReadCall[] {
  if (!Array.isArray(calls) || calls.length === 0) {
    throw new TypeError("calls must be a non-empty array");
  }
  const ids = new Set<string>();
  for (const value of calls) {
    const call = toRecord(value);
    const id = requiredText(call.id, "read call id");
    if (ids.has(id)) throw new TypeError(`duplicate read call '${id}'`);
    ids.add(id);
    if (!Object.hasOwn(call, "request")) throw new TypeError(`${id} request is required`);
    if (call.required !== undefined && typeof call.required !== "boolean") {
      throw new TypeError(`${id} required must be boolean`);
    }
  }
}

function validateDeployment(deployment: DeploymentCandidate, networkId: string): void {
  if (!deployment || typeof deployment !== "object") throw new TypeError("deployment is required");
  requiredText(deployment.id, "deployment.id");
  requiredText(deployment.contractId, "deployment.contractId");
  if (deployment.networkId !== networkId)
    throw new TypeError("deployment network differs from client network");
  normalizeAddress(deployment.address, "deployment.address");
}

function validateTracked(tracked: TrackedTransaction): void {
  if (!tracked || typeof tracked !== "object")
    throw new TypeError("tracked transaction is required");
  normalizeTransactionHash(tracked.hash);
  if (tracked.lifecycle?.actionHash !== tracked.hash) {
    throw new TypeError("tracked lifecycle/action hash differs");
  }
}

async function providerCall<T>(
  providerId: string,
  operation: string,
  acceptedUnknown: boolean,
  callback: () => Awaitable<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw providerError(providerId, operation, acceptedUnknown, `${operation} failed`, error);
  }
}

function providerError(
  providerId: string,
  operation: string,
  acceptedUnknown: boolean,
  message: string,
  cause?: unknown,
) {
  return createCoreError(
    "ProviderError",
    { providerId, operation, acceptedUnknown },
    { message, ...(cause === undefined ? {} : { cause }) },
  );
}

function normalizeReceiptStatus(status: unknown, providerId: string): "success" | "failed" {
  if (
    status === true ||
    status === 1 ||
    status === 1n ||
    status === "0x1" ||
    status === "success"
  ) {
    return "success";
  }
  if (
    status === false ||
    status === 0 ||
    status === 0n ||
    status === "0x0" ||
    status === "failed"
  ) {
    return "failed";
  }
  throw providerError(providerId, "get-transaction-receipt", false, "Receipt status is invalid");
}

function normalizeBlockHash(value: unknown, field: string): string {
  if (!isHash32(value)) {
    throw new TypeError(`${field} must be a 32-byte block hash`);
  }
  return parseHash32(value);
}

function normalizeDeadline(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  throw new TypeError("deadline must be epoch milliseconds or an ISO timestamp");
}

function printableCoordinate(coordinate: {
  readonly blockNumber: bigint;
  readonly blockHash: string;
}) {
  return Object.freeze({
    blockNumber: coordinate.blockNumber.toString(),
    blockHash: coordinate.blockHash,
  });
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
  return value;
}

function toRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
