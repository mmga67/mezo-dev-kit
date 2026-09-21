import { getNetwork } from "@mezo-dev-kit/chains";
import type { Network } from "@mezo-dev-kit/chains";
import { isContractId } from "@mezo-dev-kit/contracts";
import type { ContractId, ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";

import { CoreReadError } from "./read-errors.ts";
import type { SerializedCoreReadError } from "./read-errors.ts";
import {
  validateBlockHash,
  validateBlockNumber,
  validateChainId,
  validateHexData,
  validateIdentifier,
} from "./read-validation.ts";
import type { BlockHash, HexData } from "./read-validation.ts";

type Awaitable<T> = T | Promise<T>;

/**
 * Untrusted provider block fields. Core validates the requested number and canonical hash
 * before returning a coordinate.
 */
export interface CoreReadBlock {
  readonly number: unknown;
  readonly hash: unknown;
}

/**
 * Exact contract read including network/block/hash, resolved target and calldata. Transport
 * results remain untrusted.
 */
export interface CoreTransportReadRequest {
  readonly networkId: Network["id"];
  readonly chainId: bigint;
  readonly blockNumber: bigint;
  readonly blockHash: BlockHash;
  readonly contractId: ContractId;
  readonly address: ResolvedContract["address"];
  readonly data: HexData;
}

/**
 * Minimal provider port for anchored reads. Implementations preserve exact block requests and
 * propagate failures; Core validates results.
 */
export interface CoreReadTransport {
  readonly id: string;
  /**
   * Return untrusted provider chain identity for Core to validate; do not infer it from the
   * configured URL.
   */
  getChainId(): Awaitable<unknown>;
  /**
   * Return the current provider head as an untrusted quantity for validation.
   */
  getBlockNumber(): Awaitable<unknown>;
  /**
   * Read exactly the requested block and retain absence as null/undefined; callers validate
   * number/hash.
   */
  getBlock(blockNumber: bigint): Awaitable<CoreReadBlock | null | undefined>;
  /**
   * Execute the exact target/calldata at the supplied coordinate and propagate failures; domain
   * decoding remains external.
   */
  read(request: Readonly<CoreTransportReadRequest>): Awaitable<unknown>;
}

/**
 * Explicit network, registry and transport dependencies. Construction never infers a network or
 * chooses a provider.
 */
export interface CoreReadClientConfig {
  readonly network: Readonly<Network>;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: CoreReadTransport;
}

/**
 * One raw ABI call under an application-owned result ID. Required failures reject the batch;
 * optional failures retain an unavailable result.
 */
export interface CoreReadCall {
  readonly id: string;
  readonly contractId: ContractId;
  readonly data: HexData;
  /**
   * Defaults to required. Set false to retain an unavailable result for this call rather than
   * rejecting the batch.
   */
  readonly required?: boolean;
}

/**
 * Identity of one observed EVM block. Preserve network, chain, number and hash together when
 * combining or rechecking reads.
 */
export interface ReadCoordinate {
  readonly networkId: Network["id"];
  readonly chainId: bigint;
  readonly blockNumber: bigint;
  readonly blockHash: BlockHash;
}

/**
 * Raw successful read and its resolved contract; domain decoding and semantic validation remain
 * required.
 */
export interface AvailableRead {
  readonly status: "available";
  readonly contract: Readonly<ResolvedContract>;
  readonly value: unknown;
}

/**
 * Explicit optional-read failure with owned error details. Absence is not an assumed zero or
 * valid empty position.
 */
export interface UnavailableRead {
  readonly status: "unavailable";
  readonly contract: Readonly<ResolvedContract>;
  readonly error: SerializedCoreReadError;
}

export type CoherentReadItem = AvailableRead | UnavailableRead;

/**
 * A batch tied to one checked coordinate. Each entry retains availability and contract
 * identity; values remain undecoded.
 */
export interface CoherentReadResult {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly reads: Readonly<Record<string, Readonly<CoherentReadItem>>>;
}

/**
 * Signer-free contract reads with chain and block-anchor checks. Required failures reject;
 * optional failures remain observable.
 */
export interface CoreReadClient {
  /**
   * Query the transport chain ID and reject a mismatch with the configured network.
   */
  assertChain(): Promise<Readonly<{ expectedChainId: bigint; transportChainId: bigint }>>;
  /**
   * Resolve a contract at the requested block or one selected head, preserving chain and anchor
   * checks.
   */
  resolveContract(input: {
    readonly contractId: ContractId;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<ResolvedContract>>;
  /**
   * Read the batch at one checked block/hash. Required failures reject; optional failures
   * remain unavailable entries.
   */
  readCoherent(input: {
    readonly calls: readonly Readonly<CoreReadCall>[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<CoherentReadResult>>;
}

/**
 * Create a provider-neutral client for reads anchored to one network/block/hash.
 *
 * @param config - Explicit network, contract registry and read transport.
 * @remarks
 * Construction validates configuration. Methods perform RPC and recheck the anchor;
 * required read failures reject, while optional failures remain explicit results.
 * No signer is required. Domain callers own decoding the returned values.
 */
export function createCoreReadClient(config: CoreReadClientConfig): Readonly<CoreReadClient> {
  const network = validateConfiguration(config);

  async function assertChain(): Promise<
    Readonly<{ expectedChainId: bigint; transportChainId: bigint }>
  > {
    const transportChainId = validateChainId(
      await providerCall(config.transport, "get-chain-id", () => config.transport.getChainId()),
      "transportChainId",
    );
    if (transportChainId !== network.evmChainId) {
      throw new CoreReadError(
        "ChainMismatch",
        "transport chain does not match the configured network",
        {
          networkId: network.id,
          expectedChainId: network.evmChainId.toString(),
          transportChainId: transportChainId.toString(),
          transportId: config.transport.id,
        },
        { stage: "chain-assertion" },
      );
    }
    return Object.freeze({ expectedChainId: network.evmChainId, transportChainId });
  }

  async function coordinate(blockNumber?: bigint): Promise<Readonly<ReadCoordinate>> {
    const requestedNumber =
      blockNumber === undefined ? undefined : validateBlockNumber(blockNumber);
    await assertChain();
    const number =
      requestedNumber ??
      validateBlockNumber(
        await providerCall(config.transport, "get-block-number", () =>
          config.transport.getBlockNumber(),
        ),
        "transportBlockNumber",
        "transport",
      );
    const block = await providerCall(config.transport, "get-block", () =>
      config.transport.getBlock(number),
    );
    if (block === null || block === undefined || typeof block !== "object") {
      throw new CoreReadError(
        "InvalidTransportResult",
        "transport did not return the pinned block",
        { transportId: config.transport.id, blockNumber: number.toString() },
        { stage: "coordinate" },
      );
    }
    const returnedNumber = validateBlockNumber(block.number, "block.number", "transport");
    if (returnedNumber !== number) {
      throw new CoreReadError(
        "InvalidTransportResult",
        "transport returned a different block number",
        {
          requestedBlockNumber: number.toString(),
          returnedBlockNumber: returnedNumber.toString(),
          transportId: config.transport.id,
        },
        { stage: "coordinate" },
      );
    }
    return Object.freeze({
      networkId: network.id,
      chainId: network.evmChainId,
      blockNumber: number,
      blockHash: validateBlockHash(block.hash),
    });
  }

  async function resolveContract(input: {
    readonly contractId: ContractId;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<ResolvedContract>> {
    if (!input || typeof input !== "object") {
      throw new CoreReadError(
        "InvalidReadInput",
        "contract resolution input is required",
        {},
        { stage: "validation" },
      );
    }
    if (!isContractId(input.contractId)) {
      throw new CoreReadError(
        "InvalidReadInput",
        "contractId is not a generated contract ID",
        { field: "contractId", contractId: input.contractId },
        { stage: "validation" },
      );
    }
    const pinned = await coordinate(input.blockNumber);
    return config.registry.resolve({
      contractId: input.contractId,
      networkId: network.id,
      blockNumber: pinned.blockNumber,
    });
  }

  async function readCoherent(input: {
    readonly calls: readonly Readonly<CoreReadCall>[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<CoherentReadResult>> {
    const calls = validateCalls(input?.calls);
    const pinned = await coordinate(input?.blockNumber);
    const prepared = calls.map((call) =>
      Object.freeze({
        call,
        contract: config.registry.resolve({
          contractId: call.contractId,
          networkId: network.id,
          blockNumber: pinned.blockNumber,
        }),
      }),
    );
    const settled = await Promise.all(
      prepared.map(
        async ({ call, contract }): Promise<readonly [string, Readonly<CoherentReadItem>]> => {
          try {
            const value = await config.transport.read({
              networkId: network.id,
              chainId: network.evmChainId,
              blockNumber: pinned.blockNumber,
              blockHash: pinned.blockHash,
              contractId: call.contractId,
              address: contract.address,
              data: call.data,
            });
            return [call.id, Object.freeze({ status: "available", contract, value })];
          } catch (error) {
            const readError = normalizeProviderError(error, config.transport, "read", {
              callId: call.id,
              contractId: call.contractId,
              blockNumber: pinned.blockNumber.toString(),
            });
            if (call.required !== false) {
              throw new CoreReadError(
                "PartialReadFailure",
                `required read '${call.id}' failed`,
                {
                  callId: call.id,
                  contractId: call.contractId,
                  blockNumber: pinned.blockNumber.toString(),
                  blockHash: pinned.blockHash,
                },
                { cause: readError, retryable: readError.retryable, stage: "read" },
              );
            }
            return [
              call.id,
              Object.freeze({
                status: "unavailable",
                contract,
                error: readError.toJSON(),
              }),
            ];
          }
        },
      ),
    );
    return Object.freeze({ coordinate: pinned, reads: Object.freeze(Object.fromEntries(settled)) });
  }

  return Object.freeze({ assertChain, resolveContract, readCoherent });
}

function validateConfiguration(config: CoreReadClientConfig): Readonly<Network> {
  if (!config || typeof config !== "object") throw new TypeError("Core read config is required");
  if (!config.network || typeof config.network !== "object") {
    throw new TypeError("Core read config requires a network");
  }
  if (!config.registry || typeof config.registry.resolve !== "function") {
    throw new TypeError("Core read config requires a contract registry");
  }
  if (!config.transport || typeof config.transport !== "object") {
    throw new TypeError("Core read config requires a transport");
  }
  validateIdentifier(config.transport.id, "transport.id");
  for (const method of ["getChainId", "getBlockNumber", "getBlock", "read"] as const) {
    if (typeof config.transport[method] !== "function") {
      throw new TypeError(`Core read transport requires ${method}()`);
    }
  }
  const network = getNetwork(config.network.id);
  if (network.evmChainId !== config.network.evmChainId) {
    throw new TypeError("Core read config network does not match the Chains registry");
  }
  return network;
}

function validateCalls(value: unknown): readonly Readonly<CoreReadCall>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CoreReadError(
      "InvalidReadInput",
      "calls must be a non-empty array",
      { field: "calls" },
      { stage: "validation" },
    );
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((candidate, index) => {
      if (typeof candidate !== "object" || candidate === null) {
        throw new CoreReadError(
          "InvalidReadInput",
          `calls[${index}] must be an object`,
          { field: `calls[${index}]` },
          { stage: "validation" },
        );
      }
      const call = candidate as Readonly<CoreReadCall>;
      const id = validateIdentifier(call.id, `calls[${index}].id`);
      if (seen.has(id)) {
        throw new CoreReadError(
          "InvalidReadInput",
          `duplicate read call ID '${id}'`,
          { field: "calls", callId: id },
          { stage: "validation" },
        );
      }
      seen.add(id);
      if (call.required !== undefined && typeof call.required !== "boolean") {
        throw new CoreReadError(
          "InvalidReadInput",
          `calls[${index}].required must be boolean`,
          { field: `calls[${index}].required` },
          { stage: "validation" },
        );
      }
      if (!isContractId(call.contractId)) {
        throw new CoreReadError(
          "InvalidReadInput",
          `calls[${index}].contractId is not a generated contract ID`,
          { field: `calls[${index}].contractId`, contractId: call.contractId },
          { stage: "validation" },
        );
      }
      return Object.freeze({
        id,
        contractId: call.contractId,
        data: validateHexData(call.data, `calls[${index}].data`),
        ...(call.required === undefined ? {} : { required: call.required }),
      });
    }),
  );
}

async function providerCall<T>(
  transport: CoreReadTransport,
  operation: string,
  callback: () => Awaitable<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw normalizeProviderError(error, transport, operation);
  }
}

function normalizeProviderError(
  error: unknown,
  transport: CoreReadTransport,
  operation: string,
  context: Readonly<Record<string, unknown>> = {},
): CoreReadError {
  if (error instanceof CoreReadError) return error;
  return new CoreReadError(
    "ProviderFailure",
    `transport '${transport.id}' failed during ${operation}`,
    { transportId: transport.id, operation, ...context },
    { cause: error, retryable: true, stage: operation },
  );
}
