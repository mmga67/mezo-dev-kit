import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractId, ResolvedContract } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver, ReadCoordinate } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { calculateBoostFactor, calculateLockVotingPower, calculateVotingEpoch } from "./math.ts";
import { INCENTIVES_MODEL } from "./model.generated.ts";
import type {
  EscrowKind,
  EscrowLock,
  LockReader,
  LockReaderConfig,
  LockSnapshot,
} from "./lock-types.ts";
const zero = parseAddress(`0x${"0".repeat(40)}`),
  codec = createAbiCodec();
function nonzero(value: unknown): `0x${string}` {
  const address = parseAddress(value);
  incentiveRequire(address !== zero, "InvalidInput", "nonzero account required");
  return address;
}
function boolean(value: unknown): boolean {
  incentiveRequire(
    typeof value === "boolean",
    "IdentityMismatch",
    "boolean escrow response required",
  );
  return value;
}
function tuple(value: unknown, length: number): readonly unknown[] {
  incentiveRequire(
    Array.isArray(value) && value.length === length,
    "IdentityMismatch",
    "escrow tuple shape differs",
  );
  return value as readonly unknown[];
}
function boundedIds(value: unknown): value is readonly bigint[] {
  return Array.isArray(value) && value.length <= 32;
}
export function createLockReader(config: LockReaderConfig): Readonly<LockReader> {
  incentiveRequire(config.networkId === "mezo-mainnet", "InvalidInput", "mainnet escrow required");
  const selectedProfile = INCENTIVES_MODEL.escrows.find((row) => row.role === config.role);
  incentiveRequire(selectedProfile !== undefined, "InvalidInput", "unknown escrow role");
  const profile = selectedProfile;
  const { registry, transport } = config,
    network = getNetwork(config.networkId),
    tokens = createTokenReader({ transport });
  async function start(account: `0x${string}`, blockNumber?: bigint) {
    account = nonzero(account);
    incentiveRequire(
      parseUint(await transport.getChainId()) === network.evmChainId,
      "IdentityMismatch",
      "escrow chain differs",
    );
    const number = parseUint(blockNumber ?? (await transport.getBlockNumber())),
      block = await transport.getBlock(number);
    incentiveRequire(block?.number === number, "IdentityMismatch", "escrow block unavailable");
    const coordinate: Readonly<ReadCoordinate> = Object.freeze({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber: number,
        blockHash: parseHash32(block.hash),
      }),
      timestamp = parseUint(await transport.getBlockTimestamp(coordinate));
    const resolve = (contractId: ContractId) =>
      registry.resolve({ contractId, networkId: network.id, blockNumber: number });
    const contract = resolve(profile.contractId),
      btc = resolve("incentives.ve-btc"),
      mezo = resolve("incentives.ve-mezo"),
      poolsVoter = resolve("incentives.pools-voter"),
      boostVoter = resolve("incentives.boost-voter"),
      factory = resolve("incentives.factory-registry");
    for (const target of [btc, mezo, poolsVoter, boostVoter, factory])
      await verifyContractRuntime({ contract: target, coordinate, transport });
    async function read(target: ResolvedContract, name: string, args: readonly AbiValue[] = []) {
      const matches = target.readAbi.filter(
          (entry) => entry.type === "function" && entry.name === name,
        ),
        abi = matches[0];
      incentiveRequire(
        matches.length === 1 && abi !== undefined,
        "IdentityMismatch",
        `missing escrow getter ${name}`,
      );
      return codec.decodeFunction(
        abi,
        await transport.read({
          ...coordinate,
          contractId: target.contractId,
          address: target.address,
          data: codec.encodeFunction(abi, args),
        }),
      );
    }
    const n = async (target: ResolvedContract, name: string, args: readonly AbiValue[] = []) =>
      parseUint((await read(target, name, args))[0]);
    for (const [target, name, expected] of [
      [btc, "voter", poolsVoter.address],
      [btc, "booster", boostVoter.address],
      [mezo, "voter", boostVoter.address],
      [poolsVoter, "ve", btc.address],
      [boostVoter, "ve", mezo.address],
      [boostVoter, "boostableVe", btc.address],
      [btc, "factoryRegistry", factory.address],
      [mezo, "factoryRegistry", factory.address],
      [poolsVoter, "factoryRegistry", factory.address],
      [boostVoter, "factoryRegistry", factory.address],
    ] as const)
      incentiveRequire(
        parseAddress((await read(target, name))[0]) === expected,
        "IdentityMismatch",
        `escrow topology differs: ${name}`,
      );
    const underlying = parseAddress((await read(contract, "token"))[0]),
      maxLockSeconds = parseUint(
        BigInt(
          parseHash32(
            await transport.getStorage(contract.address, profile.maxLockSlot, coordinate),
          ),
        ),
      ),
      primaryVoter = parseAddress((await read(contract, "voter"))[0]),
      booster = parseAddress((await read(contract, "booster"))[0]);
    incentiveRequire(
      underlying === parseAddress(profile.underlying) &&
        maxLockSeconds === BigInt(profile.maxLockSeconds) &&
        (profile.boostable || booster === zero),
      "IdentityMismatch",
      "escrow token, duration or booster differs",
    );
    const forwarder = parseAddress((await read(contract, "forwarder"))[0]);
    const [
      ownedCount,
      lastMintedTokenId,
      supply,
      permanentBalance,
      virtualPermanentBalance,
      totalVotingPower,
      totalUnboostedPower,
      nativeBalance,
    ] = await Promise.all([
      n(contract, "balanceOf", [account]),
      n(contract, "tokenId"),
      n(contract, "supply"),
      n(contract, "permanentLockBalance"),
      n(contract, "virtualPermanentLockBalance"),
      n(contract, "totalVotingPower"),
      n(contract, "unboostedTotalVotingPower"),
      transport.getBalance(account, coordinate),
    ]);
    const target = {
        contractId: contract.contractId,
        address: underlying,
        targetRole: "escrow-token",
      },
      token = await tokens.read({ target, account, spender: contract.address, coordinate }),
      custody = await tokens.read({
        target,
        account: contract.address,
        spender: contract.address,
        coordinate,
      });
    incentiveRequire(
      token.decimals === BigInt(profile.decimals) && permanentBalance <= supply,
      "IdentityMismatch",
      "escrow token precision or permanent total differs",
    );
    async function lock(tokenId: bigint): Promise<Readonly<EscrowLock>> {
      const values = tuple((await read(contract, "locked", [tokenId]))[0], 4),
        amount = parseUint(values[0]),
        end = parseUint(values[1]),
        permanent = boolean(values[2]),
        storedBoost = parseUint(values[3]);
      incentiveRequire(amount < 1n << 127n, "IdentityMismatch", "escrow amount exceeds int128");
      const owner = parseAddress((await read(contract, "ownerOf", [tokenId]))[0]),
        approved = parseAddress((await read(contract, "getApproved", [tokenId]))[0]),
        callerApproved = boolean(
          (await read(contract, "isApprovedOrOwner", [account, tokenId]))[0],
        ),
        kindCode = await n(contract, "escrowType", [tokenId]);
      const kind: EscrowKind | undefined = (["normal", "locked", "managed"] as const)[
        Number(kindCode)
      ];
      incentiveRequire(
        kind !== undefined && (owner !== zero || amount === 0n),
        "IdentityMismatch",
        "escrow kind or absent owner differs",
      );
      const [
        managedTokenId,
        delegatee,
        vestingEnd,
        currentVotingPower,
        currentUnboostedPower,
        atTimeVotingPower,
        atTimeUnboosted,
        voterCount,
      ] = await Promise.all([
        n(contract, "idToManaged", [tokenId]),
        n(contract, "delegates", [tokenId]),
        n(contract, "vestingEnd", [tokenId]),
        n(contract, "votingPowerOfNFT", [tokenId]),
        n(contract, "unboostedVotingPowerOfNFT", [tokenId]),
        n(contract, "votingPowerOfNFTAt", [tokenId, timestamp]),
        n(contract, "unboostedVotingPowerOfNFTAt", [tokenId, timestamp]),
        n(contract, "votedVotersLength", [tokenId]),
      ]);
      const grantManager = parseAddress((await read(contract, "grantManager", [tokenId]))[0]),
        voted = boolean((await read(contract, "voted", [tokenId]))[0]);
      incentiveRequire(voterCount <= 16n, "LimitExceeded", "escrow voter list exceeds budget");
      const voters = tuple(
        (await read(contract, "votedVoters", [tokenId]))[0],
        Number(voterCount),
      ).map((value) => nonzero(value));
      incentiveRequire(
        new Set(voters).size === voters.length && voted === voters.length > 0,
        "IdentityMismatch",
        "escrow vote flags differ",
      );
      const lockPowerEstimate = calculateLockVotingPower({
        amount,
        boost: storedBoost,
        end,
        permanent,
        maxLockSeconds,
        timestamp,
      });
      incentiveRequire(
        currentUnboostedPower === atTimeUnboosted &&
          (currentVotingPower === atTimeVotingPower || currentVotingPower === 0n) &&
          (kind !== "normal" ||
            (lockPowerEstimate.unboosted === atTimeUnboosted &&
              lockPowerEstimate.boosted === atTimeVotingPower)),
        "IdentityMismatch",
        "escrow voting power differs",
      );
      let currentBoost: bigint | null = null,
        boostGauge: `0x${string}` | null = null;
      if (profile.boostable) {
        boostGauge = parseAddress(
          (await read(boostVoter, "boostableTokenIdToGauge", [tokenId]))[0],
        );
        const [gaugeWeight, votingVeTotalWeight, boostableVeTotalWeight, observed] =
          await Promise.all([
            n(boostVoter, "weights", [boostGauge]),
            n(mezo, "totalVotingPower"),
            n(btc, "unboostedTotalVotingPower"),
            n(boostVoter, "getBoost", [tokenId]),
          ]);
        currentBoost = calculateBoostFactor({
          gaugeWeight,
          votingVeTotalWeight,
          boostableVeTotalWeight,
          boostableVeWeight: currentUnboostedPower,
        });
        incentiveRequire(currentBoost === observed, "IdentityMismatch", "current boost differs");
      }
      return Object.freeze({
        tokenId,
        owner,
        approved,
        callerApproved,
        kind,
        amount,
        end,
        permanent,
        storedBoost,
        currentBoost,
        boostGauge,
        voted,
        voters: Object.freeze(voters),
        managedTokenId,
        delegatee,
        grantManager,
        vestingEnd,
        currentVotingPower,
        currentUnboostedPower,
        atTimeVotingPower,
        ownershipChangeSuppressed: currentVotingPower === 0n && atTimeVotingPower > 0n,
        lockPowerEstimate,
      });
    }
    async function finish(ids: readonly bigint[]): Promise<Readonly<LockSnapshot>> {
      const locks: EscrowLock[] = [];
      for (const id of ids) locks.push(await lock(id));
      incentiveRequire(
        parseUint(await transport.getChainId()) === coordinate.chainId &&
          parseHash32((await transport.getBlock(number))?.hash) === coordinate.blockHash,
        "IdentityMismatch",
        "escrow snapshot anchor changed",
      );
      return Object.freeze({
        role: config.role,
        contract,
        coordinate,
        timestamp,
        account,
        underlying,
        maxLockSeconds,
        forwarder,
        primaryVoter,
        booster,
        ownedCount,
        lastMintedTokenId,
        supply,
        permanentBalance,
        virtualPermanentBalance,
        totalVotingPower,
        totalUnboostedPower,
        nativeBalance,
        token,
        escrowTokenBalance: custody.balance,
        locks: Object.freeze(locks),
        epoch: calculateVotingEpoch(timestamp),
      });
    }
    return { contract, read, finish, ownedCount };
  }
  return Object.freeze({
    async read(input) {
      incentiveRequire(
        boundedIds(input.tokenIds),
        "LimitExceeded",
        "at most 32 explicit escrow token IDs",
      );
      const ids = input.tokenIds.map((value) => parseUint(value));
      incentiveRequire(
        ids.every((id) => id > 0n) && new Set(ids).size === ids.length,
        "InvalidInput",
        "unique positive token IDs required",
      );
      return (await start(input.account, input.blockNumber)).finish(ids);
    },
    async listOwned(input) {
      const offset = parseUint(input.offset);
      incentiveRequire(
        Number.isSafeInteger(input.limit) && input.limit > 0 && input.limit <= 32,
        "LimitExceeded",
        "owner page limit must be one to 32",
      );
      const context = await start(input.account, input.blockNumber),
        end =
          offset + BigInt(input.limit) < context.ownedCount
            ? offset + BigInt(input.limit)
            : context.ownedCount,
        ids: bigint[] = [];
      incentiveRequire(offset <= context.ownedCount, "InvalidInput", "owner offset exceeds total");
      for (let i = offset; i < end; i++)
        ids.push(
          parseUint(
            (
              await context.read(context.contract, "ownerToNFTokenIdList", [
                parseAddress(input.account),
                i,
              ])
            )[0],
          ),
        );
      incentiveRequire(
        ids.every((id) => id > 0n) && new Set(ids).size === ids.length,
        "IdentityMismatch",
        "owner enumeration differs",
      );
      const snapshot = await context.finish(ids);
      incentiveRequire(
        snapshot.locks.every((lock) => lock.owner === snapshot.account),
        "IdentityMismatch",
        "enumerated escrow owner differs",
      );
      return Object.freeze({
        snapshot,
        offset,
        nextOffset: end < context.ownedCount ? end : null,
        total: context.ownedCount,
      });
    },
  } satisfies LockReader);
}
export function createLockTargetResolver(config: {
  readonly reader: LockReader;
  readonly account: `0x${string}`;
}): ExecutionTargetResolver {
  return async (input) => {
    const snapshot = await config.reader.read({
      account: config.account,
      tokenIds: [],
      blockNumber: input.coordinate.blockNumber,
    });
    incentiveRequire(
      input.contractId === snapshot.contract.contractId &&
        input.role === "escrow-token" &&
        input.coordinate.networkId === snapshot.coordinate.networkId &&
        input.coordinate.chainId === snapshot.coordinate.chainId &&
        input.coordinate.blockHash === snapshot.coordinate.blockHash,
      "IdentityMismatch",
      "escrow execution target differs",
    );
    return snapshot.underlying;
  };
}
