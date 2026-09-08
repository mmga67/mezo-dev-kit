import { getNetwork } from "@mezo-dev-kit/chains";
import type { Network } from "@mezo-dev-kit/chains";
import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import { evaluatePriceFreshness, normalizePriceAmount, PriceError } from "./amount.ts";
import type { PriceAmountResult, PriceFreshness, PriceRounding } from "./amount.ts";
import { PRICE_MODEL } from "./model.generated.ts";

export interface SkipPriceReadInput {
  readonly blockNumber?: bigint;
  readonly asOf: bigint;
  readonly observedAt: bigint;
  readonly maxAgeSeconds: bigint;
  readonly targetDecimals: number;
  readonly rounding: PriceRounding;
  readonly allowPrecisionLoss: boolean;
}
export interface SkipPriceObservation {
  readonly status: "valid" | "invalid";
  readonly sourceId: string;
  readonly feedId: string;
  readonly sourceClass: "pushed-feed-observation";
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly providerId: string;
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly blockTimestamp: bigint;
  readonly contract: Readonly<ResolvedContract>;
  readonly observedAt: bigint;
  readonly asOf: bigint;
  readonly maxAgeSeconds: bigint;
  readonly sourceDecimals: bigint;
  readonly targetDecimals: number;
  readonly rounding: PriceRounding;
  readonly allowPrecisionLoss: boolean;
  readonly round: Readonly<{
    roundId: bigint;
    answer: bigint;
    startedAt: bigint;
    updatedAt: bigint;
    answeredInRound: bigint;
  }>;
  readonly normalization: PriceAmountResult;
  readonly freshness: PriceFreshness;
  readonly confidence: null;
  readonly limitations: readonly string[];
}
export interface SkipPriceReader {
  read(input: SkipPriceReadInput): Promise<Readonly<SkipPriceObservation>>;
}
/** Direct Skip observation. It cannot replace a consuming protocol's own oracle result. */
export function createSkipPriceReader(config: {
  readonly networkId: Network["id"];
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}): Readonly<SkipPriceReader> {
  if (config.networkId !== "mezo-mainnet")
    throw new PriceError("UnsupportedSource", "direct Skip reader is implemented for mainnet only");
  const network = getNetwork(config.networkId),
    transport = config.transport,
    codec = createAbiCodec();
  return Object.freeze({
    async read(input) {
      const asOf = parseUint(input.asOf),
        observedAt = parseUint(input.observedAt),
        maxAgeSeconds = parseUint(input.maxAgeSeconds);
      normalizePriceAmount({
        raw: 0n,
        exponent: 0,
        targetDecimals: input.targetDecimals,
        rounding: input.rounding,
        allowPrecisionLoss: input.allowPrecisionLoss,
        zeroAllowed: true,
      });
      if (parseUint(await transport.getChainId()) !== network.evmChainId)
        throw new PriceError("InconsistentCoordinate", "price provider chain mismatch");
      const blockNumber = parseUint(input.blockNumber ?? (await transport.getBlockNumber())),
        block = await transport.getBlock(blockNumber);
      if (!block || parseUint(block.number) !== blockNumber)
        throw new PriceError("InconsistentCoordinate", "price block unavailable");
      const coordinate = Object.freeze({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber,
        blockHash: parseHash32(block.hash),
      });
      const contract = config.registry.resolve({
        contractId: PRICE_MODEL.skip.contractId,
        networkId: network.id,
        blockNumber,
      });
      await verifyContractRuntime({ contract, transport, coordinate });
      async function read(name: string) {
        const abi = contract.readAbi.find(
          (entry) => entry.type === "function" && entry.name === name,
        );
        return codec.decodeFunction(
          abi,
          await transport.read({
            ...coordinate,
            contractId: contract.contractId,
            address: contract.address,
            data: codec.encodeFunction(abi),
          }),
        );
      }
      const [decimalValues, roundValues, blockTimestamp] = await Promise.all([
        read("decimals"),
        read("latestRoundData"),
        transport.getBlockTimestamp(coordinate),
      ]);
      const sourceDecimals = parseUint(decimalValues[0], 8);
      if (sourceDecimals !== BigInt(PRICE_MODEL.skip.sourceDecimals))
        throw new PriceError(
          "UnsupportedSource",
          "Skip scale differs from the canonical interface",
        );
      const answer = roundValues[1];
      if (typeof answer !== "bigint")
        throw new PriceError("InvalidInput", "invalid raw oracle answer");
      const round = Object.freeze({
        roundId: parseUint(roundValues[0], 80),
        answer,
        startedAt: parseUint(roundValues[2]),
        updatedAt: parseUint(roundValues[3]),
        answeredInRound: parseUint(roundValues[4], 80),
      });
      if (round.updatedAt > blockTimestamp || blockTimestamp > observedAt)
        throw new PriceError(
          "InconsistentCoordinate",
          "price publication, block and observation times are inconsistent",
        );
      const normalization = normalizePriceAmount({
        raw: answer,
        exponent: -Number(sourceDecimals),
        targetDecimals: input.targetDecimals,
        rounding: input.rounding,
        zeroAllowed: false,
        allowPrecisionLoss: input.allowPrecisionLoss,
      });
      const freshness = evaluatePriceFreshness({
        publishedAt: round.updatedAt === 0n ? null : round.updatedAt,
        asOf,
        maxAgeSeconds,
      });
      const final = await transport.getBlock(blockNumber);
      if (
        !final ||
        parseHash32(final.hash) !== coordinate.blockHash ||
        parseUint(await transport.getChainId()) !== coordinate.chainId
      )
        throw new PriceError("InconsistentCoordinate", "price coordinate changed");
      return Object.freeze({
        status:
          normalization.status === "valid" && freshness.status === "valid" ? "valid" : "invalid",
        sourceId: PRICE_MODEL.skip.sourceId,
        feedId: PRICE_MODEL.skip.feedId,
        baseAsset: PRICE_MODEL.skip.baseAsset,
        quoteAsset: PRICE_MODEL.skip.quoteAsset,
        sourceClass: "pushed-feed-observation",
        providerId: transport.id,
        coordinate,
        blockTimestamp,
        contract,
        observedAt,
        asOf,
        maxAgeSeconds,
        sourceDecimals,
        targetDecimals: input.targetDecimals,
        rounding: input.rounding,
        allowPrecisionLoss: input.allowPrecisionLoss,
        round,
        normalization,
        freshness,
        confidence: null,
        limitations: Object.freeze([
          "The source does not report confidence.",
          "This direct feed observation is not a protocol PriceFeed result.",
          "Code validation covers the native interface; it does not execute or reproduce mezod's native engine.",
        ]),
      });
    },
  } satisfies SkipPriceReader);
}
