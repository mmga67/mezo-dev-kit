import { createAbiCodec } from "@mezo-dev-kit/evm";
import type { RpcTransport } from "@mezo-dev-kit/core";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { createSavingsReader } from "./reader.ts";
import type { SavingsReader, SavingsReaderConfig } from "./types.ts";

/** Compose the existing reader with the SDK's explicit RPC and ABI adapters. */
export function createSavingsRpcReader(config: {
  readonly networkId: SavingsReaderConfig["networkId"];
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<SavingsReader> {
  const codec = createAbiCodec();
  const transport = config.transport;
  return createSavingsReader({
    ...config,
    transport: {
      ...transport,
      read: (input) => transport.read({ ...input, contractId: "musd.savings-rate" }),
      getCode: (input) => transport.getCode(input.address, input),
      getStorage: (input) => transport.getStorage(input.address, input.slot, input),
    },
    codec: {
      encodeRead: (input) => codec.encodeFunction(input.abi[0], input.args),
      decodeRead: (input) => {
        const values = codec.decodeFunction(input.abi[0], input.data);
        return values.length === 1 ? values[0] : values;
      },
    },
  });
}
