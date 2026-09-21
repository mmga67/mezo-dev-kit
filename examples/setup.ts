import { getNetwork } from "@mezo-dev-kit/chains";
import type { Network, NetworkId } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type {
  ExecutionSigner,
  RpcRequest,
  RpcTransport,
  SubmissionStore,
} from "@mezo-dev-kit/core";
import { parseAddress } from "@mezo-dev-kit/evm";
import type { Address } from "@mezo-dev-kit/evm";

/**
 * Application connections used by these examples. This is an example-owned type;
 * MDK factories accept its individual fields and require no context container.
 */
export interface Connection {
  readonly network: Readonly<Network>;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
  readonly signer: ExecutionSigner;
  readonly store: SubmissionStore;
  readonly account: Address;
}

/**
 * Wire existing application RPC, wallet and storage into MDK. Construction does
 * not send a transaction; execution checks the chain and signer when used.
 */
export function createConnection(input: {
  readonly networkId: NetworkId;
  readonly account: string;
  readonly readRequest: RpcRequest;
  readonly walletRequest: RpcRequest;
  readonly store: SubmissionStore;
}): Connection {
  // Identity and deployment metadata come from MDK; the application chooses RPC access.
  const network = getNetwork(input.networkId);
  const registry = createContractRegistry();
  const transport = createRpcTransport({ id: "example-connection", request: input.readRequest });
  const account = parseAddress(input.account);

  // The wallet request port owns signing. A read-only RPC endpoint is insufficient here.
  const signer = createRpcSigner({ account, request: input.walletRequest });

  // Share this store across clients using the account so operation/nonce reservations agree.
  // Use durable storage when submissions must remain recoverable after a restart.
  return { network, registry, transport, signer, account, store: input.store };
}
