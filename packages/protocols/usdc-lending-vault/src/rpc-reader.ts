import { createLendingRpcConfig } from "@mezo-dev-kit/musdc-lending";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport, ExecutionTargetResolver } from "@mezo-dev-kit/core";
import { createVaultReader } from "./reader.ts";
import type { VaultReader, VaultReaderConfig } from "./types.ts";
import { VAULT_MODEL } from "./model.generated.ts";
import { VaultReadError } from "./errors.ts";

export function createVaultRpcReader(config: {
  readonly networkId: VaultReaderConfig["networkId"];
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<VaultReader> {
  const input = createLendingRpcConfig(config);
  return createVaultReader({
    ...input,
    transport: {
      ...input.transport,
      read: (request) =>
        config.transport.read({
          ...request,
          contractId: request.contractId ?? "vaults.usdc-lending-wrapper",
        }),
    },
  });
}
export function createVaultTargetResolver(config: {
  readonly reader: VaultReader;
  readonly account: `0x${string}`;
  readonly maxPriceAgeSeconds: bigint;
}): ExecutionTargetResolver {
  return async (input) => {
    if (
      input.contractId !== "vaults.usdc-lending-wrapper" ||
      !["vault-v2", "vault-gauge", "loan-token"].includes(input.role)
    )
      throw new VaultReadError("InvalidValue", "execution target");
    const snapshot = await config.reader.read({
      account: config.account,
      blockNumber: input.coordinate.blockNumber,
      maxPriceAgeSeconds: config.maxPriceAgeSeconds,
      previewAssets: 0n,
      previewShares: 0n,
    });
    if (
      snapshot.coordinate.blockHash !== input.coordinate.blockHash ||
      snapshot.coordinate.chainId !== input.coordinate.chainId ||
      snapshot.coordinate.networkId !== input.coordinate.networkId
    )
      throw new VaultReadError("InconsistentCoordinate", "execution target");
    if (input.role === "vault-v2") return snapshot.vault;
    if (input.role === "loan-token") return VAULT_MODEL.loanToken;
    if (snapshot.gauge.status !== "available") throw new VaultReadError("ReadUnavailable", "gauge");
    return snapshot.gauge.value.address;
  };
}
