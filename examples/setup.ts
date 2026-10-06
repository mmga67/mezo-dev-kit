import { getNetwork } from "@mezo-dev-kit/chains";
import type { Network, NetworkId } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type {
  ExecutionSigner,
  RpcRequest,
  RpcTransport,
  SimulatedTransaction,
  SubmissionStore,
} from "@mezo-dev-kit/core";
import { parseAddress } from "@mezo-dev-kit/evm";
import type { Address } from "@mezo-dev-kit/evm";

/** Read-only recipes need a network, contract metadata and an application RPC port. */
export interface ReadConnection {
  readonly network: Readonly<Network>;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}

/**
 * The application displays the exact call and asks for consent. Resolve only when
 * accepted; reject on cancellation. The cookbook supplies no automatic approval.
 */
export type ReviewTransaction = (simulation: Readonly<SimulatedTransaction>) => Promise<void>;

/** Example-owned wiring, not an SDK context container. Pass individual fields to MDK factories. */
export interface Connection extends ReadConnection {
  readonly signer: ExecutionSigner;
  readonly store: SubmissionStore;
  readonly account: Address;
  readonly review: ReviewTransaction;
}

/** Construction does no RPC. Clients check the endpoint's chain when they read. */
export function createReadConnection(input: {
  readonly networkId: NetworkId;
  readonly readRequest: RpcRequest;
}): ReadConnection {
  return {
    network: getNetwork(input.networkId),
    registry: createContractRegistry(),
    transport: createRpcTransport({ id: "application-read", request: input.readRequest }),
  };
}

/** Add the application's connected wallet, consent UI and durable journal for writes. */
export function createConnection(input: {
  readonly networkId: NetworkId;
  readonly account: string;
  readonly readRequest: RpcRequest;
  readonly walletRequest: RpcRequest;
  readonly store: SubmissionStore;
  readonly review: ReviewTransaction;
}): Connection {
  const reads = createReadConnection(input);
  const account = parseAddress(input.account);
  // A read-only endpoint cannot sign. The wallet owns keys and signing requests.
  const signer = createRpcSigner({ account, request: input.walletRequest });
  // Share durable reservations across clients using the same account. A memory
  // store loses recovery information on reload and is only suitable for tests.
  return { ...reads, signer, account, store: input.store, review: input.review };
}
