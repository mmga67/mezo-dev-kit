import { getNativeTokenProfile, getTokenInterface } from "@mezo-dev-kit/contracts";
import type { ExecutionTargetResolver } from "@mezo-dev-kit/core";
import { keccak256, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { NATIVE_CLIENT, NATIVE_ROUTES } from "./model.generated.ts";
import {
  checkNativeClient,
  transferAddress,
  transferAnchor,
  transferCoordinate,
  transferEndpoint,
  transferRead,
  transferRequire,
  zeroAddress,
} from "./native-transfer-runtime.ts";
import type {
  NativeTransferReader,
  NativeTransferReaderConfig,
  NativeTransferQuote,
} from "./native-transfer-types.ts";

/** Source-matched integer fee calculation. All amounts use destination-token base units. */
export function nativeWithdrawalFee(input: {
  readonly amount: bigint;
  readonly percent: bigint;
  readonly denominator: bigint;
  readonly flat: bigint;
  readonly exempt: boolean;
  readonly collectorEnabled: boolean;
}): bigint {
  for (const value of [input.amount, input.percent, input.denominator, input.flat])
    parseUint(value);
  transferRequire(
    typeof input.exempt === "boolean" &&
      typeof input.collectorEnabled === "boolean" &&
      input.amount > 0n &&
      input.denominator > 0n,
    "InvalidInput",
    "invalid Native fee parameters",
  );
  if (!input.collectorEnabled) return 0n;
  const fee = parseUint(
    parseUint(input.amount * (input.exempt ? 0n : input.percent)) / input.denominator + input.flat,
  );
  transferRequire(
    fee < input.amount,
    "BoundExceeded",
    "Native destination fee consumes the transfer amount",
  );
  return fee;
}
function routeFor(id: NativeTransferReaderConfig["routeId"]) {
  const route = NATIVE_ROUTES.find((r) => r.id === id);
  transferRequire(route, "UnknownRoute", "unknown Native route");
  return route;
}
/** Resolve only the separate source-token approval target; BTC approve uses native authorization. */
export function createNativeTokenTargetResolver(
  config: Pick<NativeTransferReaderConfig, "routeId" | "sourceTransport" | "getMezoClientVersion">,
): ExecutionTargetResolver {
  const route = routeFor(config.routeId),
    transport = config.sourceTransport,
    readClient = config.getMezoClientVersion;
  return async ({ contractId, role, coordinate }) => {
    transferRequire(
      contractId === route.source.contractId &&
        role === "native-source-token" &&
        coordinate.networkId === route.source.networkId,
      "InvalidInput",
      "Native approval role or network differs",
    );
    if (route.source.networkId === "mezo-mainnet") await checkNativeClient(readClient);
    await transferEndpoint(route.source, transport, coordinate);
    await transferAnchor(transport, coordinate);
    return parseAddress(route.source.token);
  };
}
export function checkNativeQuote(quote: NativeTransferQuote): void {
  const nativeAmount = quote.source.coordinate.networkId === "mezo-mainnet" ? quote.amount : 0n;
  transferRequire(
    quote.amount >= quote.sourceMinimum &&
      (quote.sourceCapacity === null || quote.amount <= quote.sourceCapacity) &&
      quote.tokenBalance >= quote.amount &&
      quote.nativeBalance >= parseUint(nativeAmount + quote.sourceGasReserve) &&
      quote.estimatedDestinationFee <= quote.maxEstimatedDestinationFee,
    "BoundExceeded",
    "Native amount, capacity, balance, gas reserve or estimated fee bound exceeded",
  );
}

/** Create current two-chain Native inspection for the USDC inbound or BTC outbound route. */
export function createNativeTransferReader(
  config: NativeTransferReaderConfig,
): Readonly<NativeTransferReader> {
  const route = routeFor(config.routeId),
    sourceTransport = config.sourceTransport,
    destinationTransport = config.destinationTransport,
    readClient = config.getMezoClientVersion;
  return Object.freeze<NativeTransferReader>({
    async quote(input) {
      const account = transferAddress(input.account),
        recipient = transferAddress(input.recipient),
        amount = parseUint(input.amount);
      transferRequire(amount > 0n, "InvalidInput", "positive Native amount required");
      const maxSourceAgeBlocks = parseUint(input.maxSourceAgeBlocks),
        maxDestinationAgeBlocks = parseUint(input.maxDestinationAgeBlocks),
        maxEstimatedDestinationFee = parseUint(input.maxEstimatedDestinationFee),
        sourceGasReserve = parseUint(input.sourceGasReserve),
        signal = input.signal;
      signal?.throwIfAborted();
      await checkNativeClient(readClient);
      const sourceCoordinate = await transferCoordinate(
        route.source,
        sourceTransport,
        input.sourceBlockNumber,
        maxSourceAgeBlocks,
        signal,
      );
      const destinationCoordinate = await transferCoordinate(
        route.destination,
        destinationTransport,
        input.destinationBlockNumber,
        maxDestinationAgeBlocks,
        signal,
      );
      const sourceContract = await transferEndpoint(
          route.source,
          sourceTransport,
          sourceCoordinate,
        ),
        destinationContract = await transferEndpoint(
          route.destination,
          destinationTransport,
          destinationCoordinate,
        );
      const sourceToken = parseAddress(route.source.token),
        destinationToken = parseAddress(route.destination.token),
        sourceBridge = parseAddress(sourceContract.address),
        destinationBridge = parseAddress(destinationContract.address);
      transferRequire(
        recipient !== destinationBridge,
        "InvalidInput",
        "Native bridge itself is outside recipient settlement coverage",
      );
      const sourceRead = (name: string, args: readonly AbiValue[] = []) =>
        transferRead(
          sourceTransport,
          sourceCoordinate,
          route.source.contractId,
          sourceBridge,
          sourceContract.readAbi,
          name,
          args,
          signal,
        );
      const destinationRead = (name: string, args: readonly AbiValue[] = []) =>
        transferRead(
          destinationTransport,
          destinationCoordinate,
          route.destination.contractId,
          destinationBridge,
          destinationContract.readAbi,
          name,
          args,
          signal,
        );
      const sourceTokenRead = (name: string, args: readonly AbiValue[] = []) =>
        transferRead(
          sourceTransport,
          sourceCoordinate,
          route.source.contractId,
          sourceToken,
          getTokenInterface(),
          name,
          args,
          signal,
        );
      const destinationProfile = getNativeTokenProfile({
        networkId: route.destination.networkId,
        tokenAddress: destinationToken,
      });
      const destinationTokenRead = (name: string, args: readonly AbiValue[] = []) =>
        transferRead(
          destinationTransport,
          destinationCoordinate,
          route.destination.contractId,
          destinationToken,
          [...getTokenInterface(), ...destinationProfile.extraReadAbi],
          name,
          args,
          signal,
        );
      const decimals = Number(parseUint((await sourceTokenRead("decimals"))[0], 8)),
        destinationDecimals = Number(parseUint((await destinationTokenRead("decimals"))[0], 8));
      transferRequire(
        decimals ===
          getNativeTokenProfile({ networkId: route.source.networkId, tokenAddress: sourceToken })
            .decimals &&
          destinationDecimals === destinationProfile.decimals &&
          decimals === destinationDecimals,
        "InvalidConfiguration",
        "Native token precision differs",
      );
      let sourceMinimum: bigint,
        sourceCapacity: bigint | null = null,
        capacityResetBlock: bigint | null = null,
        estimatedDestinationFee = 0n;
      if (route.direction === "inbound-to-mezo") {
        sourceMinimum = parseUint((await sourceRead("ERC20Tokens", [sourceToken]))[0]);
        transferRequire(
          sourceMinimum > 0n,
          "InvalidConfiguration",
          "Native ERC20 deposits are disabled",
        );
        const mapping = (await destinationRead("getERC20TokenMapping", [sourceToken]))[0];
        transferRequire(
          Array.isArray(mapping) &&
            mapping.length === 2 &&
            parseAddress(mapping[0]) === sourceToken &&
            parseAddress(mapping[1]) === destinationToken,
          "InvalidConfiguration",
          "Native ERC20 mapping differs",
        );
        transferRequire(
          !NATIVE_CLIENT.blockedRecipients.some((a) => parseAddress(a) === recipient),
          "InvalidInput",
          "Native system mint skips module-account recipients",
        );
        transferRequire(
          parseAddress((await destinationTokenRead("minter"))[0]) ===
            parseAddress(NATIVE_CLIENT.mintAuthority),
          "InvalidConfiguration",
          "Native mapped token mint authority differs",
        );
      } else {
        transferRequire(
          parseAddress((await sourceRead("getSourceBTCToken"))[0]) === destinationToken &&
            parseAddress((await destinationRead("tbtcToken"))[0]) === destinationToken,
          "InvalidConfiguration",
          "Native BTC mapping differs",
        );
        const chains = (await sourceRead("getBridgeOutChains"))[0];
        transferRequire(
          Array.isArray(chains) &&
            chains.some((c) => parseUint(c, 8) === BigInt(route.targetChain ?? -1)),
          "InvalidConfiguration",
          "Native destination chain is disabled",
        );
        sourceMinimum = parseUint((await sourceRead("getMinBridgeOutAmount", [sourceToken]))[0]);
        const capacity = await sourceRead("getOutflowCapacity", [sourceToken]);
        sourceCapacity = parseUint(capacity[0]);
        capacityResetBlock = parseUint(capacity[1]);
        const collector = parseAddress((await destinationRead("feeCollector"))[0]);
        const exempt = (
          await destinationRead("percentWithdrawalFeeExempts", [keccak256(recipient)])
        )[0];
        transferRequire(
          typeof exempt === "boolean",
          "InvalidConfiguration",
          "invalid Native percentage exemption",
        );
        estimatedDestinationFee = nativeWithdrawalFee({
          amount,
          percent: parseUint((await destinationRead("withdrawalFee"))[0]),
          denominator: parseUint((await destinationRead("BASIS_POINTS_DENOMINATOR"))[0]),
          flat: parseUint((await destinationRead("flatWithdrawalFees", [destinationToken]))[0]),
          exempt,
          collectorEnabled: collector !== zeroAddress,
        });
        const validators = parseUint((await destinationRead("bridgeValidatorsCount"))[0]),
          threshold = parseUint((await destinationRead("attestationThreshold"))[0]);
        transferRequire(
          threshold > 0n && validators >= threshold,
          "InvalidConfiguration",
          "Native validator threshold is unavailable",
        );
        transferRequire(
          parseUint((await destinationTokenRead("balanceOf", [destinationBridge]))[0]) >= amount,
          "BoundExceeded",
          "Native destination custody currently lacks the gross amount",
        );
      }
      const tokenBalance = parseUint((await sourceTokenRead("balanceOf", [account]))[0]),
        allowance = parseUint((await sourceTokenRead("allowance", [account, sourceBridge]))[0]),
        nativeBalance = parseUint(await sourceTransport.getBalance(account, sourceCoordinate));
      const quote: Readonly<NativeTransferQuote> = Object.freeze({
        routeId: route.id,
        account,
        recipient,
        amount,
        source: Object.freeze({
          coordinate: sourceCoordinate,
          contractId: route.source.contractId,
          bridge: sourceBridge,
          token: sourceToken,
          decimals,
        }),
        destination: Object.freeze({
          coordinate: destinationCoordinate,
          contractId: route.destination.contractId,
          bridge: destinationBridge,
          token: destinationToken,
          decimals: destinationDecimals,
        }),
        sourceMinimum,
        sourceCapacity,
        capacityResetBlock,
        estimatedDestinationFee,
        estimatedDestinationAmount: amount - estimatedDestinationFee,
        maxEstimatedDestinationFee,
        sourceGasReserve,
        tokenBalance,
        nativeBalance,
        allowance,
        maxSourceAgeBlocks,
        maxDestinationAgeBlocks,
      });
      checkNativeQuote(quote);
      await checkNativeClient(readClient);
      await transferAnchor(sourceTransport, sourceCoordinate, signal);
      await transferAnchor(destinationTransport, destinationCoordinate, signal);
      return quote;
    },
  });
}
