import { createAbiCodec, parseHexData, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport, ExecutionTargetResolver } from "@mezo-dev-kit/core";
import { createLendingReader } from "./reader.ts";
import type { LendingAbiValue, LendingReader, LendingReaderConfig } from "./types.ts";
import { LENDING_MODEL } from "./model.generated.ts";
import { LendingReadError } from "./errors.ts";

export function createLendingRpcReader(config: {
  readonly networkId: LendingReaderConfig["networkId"];
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<LendingReader> {
  return createLendingReader(createLendingRpcConfig(config));
}
/** The vault reader composes these same typed ABI, timestamp and token-balance ports. */
export function createLendingRpcConfig(config: {
  readonly networkId: LendingReaderConfig["networkId"];
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<LendingReaderConfig> {
  const codec = createAbiCodec();
  const transport = config.transport;
  function value(input: LendingAbiValue): AbiValue {
    return typeof input === "string"
      ? parseHexData(input)
      : typeof input === "bigint"
        ? input
        : input.map(value);
  }
  const balance = getTokenInterface().find((entry) => entry.name === "balanceOf");
  return {
    ...config,
    transport: {
      ...transport,
      getBlock: async (number) => {
        const block = await transport.getBlock(number);
        return block
          ? {
              ...block,
              timestamp: await transport.getBlockTimestamp({
                networkId: config.networkId,
                chainId: parseUint(await transport.getChainId()),
                blockNumber: number,
                blockHash: parseHash32(block.hash),
              }),
            }
          : null;
      },
      getCode: (input) => transport.getCode(input.address, input),
      getStorage: (input) => transport.getStorage(input.address, input.slot, input),
      getTokenBalance: async (input) =>
        parseUint(
          codec.decodeFunction(
            balance,
            await transport.read({
              ...input,
              contractId: "lending.morpho",
              address: input.token,
              data: codec.encodeFunction(balance, [input.account]),
            }),
          )[0],
        ),
    },
    codec: {
      encodeRead: (input) => codec.encodeFunction(input.abi[0], input.args.map(value)),
      decodeRead: (input) => {
        const values = codec.decodeFunction(input.abi[0], input.data);
        return values.length === 1 ? values[0] : values;
      },
    },
  };
}
/** Resolve token approval destinations through the verified current Morpho market tuple. */
export function createLendingTargetResolver(config: {
  readonly reader: LendingReader;
  readonly account: `0x${string}`;
  readonly maxPriceAgeSeconds: bigint;
}): ExecutionTargetResolver {
  return async (input) => {
    if (
      input.contractId !== "lending.morpho" ||
      (input.role !== "loan-token" && input.role !== "collateral-token")
    )
      throw new LendingReadError("InvalidValue", "execution target");
    const snapshot = await config.reader.read({
      account: config.account,
      maxPriceAgeSeconds: config.maxPriceAgeSeconds,
      blockNumber: input.coordinate.blockNumber,
    });
    if (
      snapshot.coordinate.blockHash !== input.coordinate.blockHash ||
      snapshot.coordinate.chainId !== input.coordinate.chainId ||
      snapshot.coordinate.networkId !== input.coordinate.networkId
    )
      throw new LendingReadError("InconsistentCoordinate", "execution target");
    return input.role === "loan-token" ? LENDING_MODEL.loanToken : LENDING_MODEL.collateralToken;
  };
}
