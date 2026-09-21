import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { createLockReader } from "./lock-reader.ts";
import type { LockSnapshot } from "./lock-types.ts";
import { calculateRebaseClaim, rebaseWindow } from "./rebase-math.ts";
import type { RebaseClaim, RebaseCursorInput, RebasePeriod } from "./rebase-math.ts";
/**
 * Verified distributor/minter/escrow state and bounded periods, with locally recomputed claim
 * compared to on-chain output.
 */
export interface RebaseSnapshot extends RebaseCursorInput {
  readonly contract: Readonly<ResolvedContract>;
  readonly minter: Readonly<ResolvedContract>;
  readonly escrow: Readonly<LockSnapshot>;
  readonly tokenId: bigint;
  readonly activePeriod: bigint;
  readonly tokenLastBalance: bigint;
  readonly userPointEpoch: bigint;
  readonly custody: Readonly<TokenSnapshot>;
  readonly periods: readonly Readonly<RebasePeriod>[];
  readonly claim: Readonly<RebaseClaim>;
}
/**
 * Current bounded veMEZO claim inspection; it neither runs minter upkeep nor submits a claim.
 */
export interface RebaseReader {
  /**
   * Read the bounded distributor claim window and compare local integer accounting with
   * on-chain claimable at one block.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<RebaseSnapshot>>;
}
/**
 * Create bounded veMEZO distributor reads with verified escrow and minter identity.
 *
 * @remarks
 * The reader recomputes the contract's claim window and compares claimable output.
 * A hasMore result means further bounded work remains; it does not imply exhaustive
 * history. Reads neither claim tokens nor perform minter upkeep.
 */
export function createRebaseReader(config: {
  readonly networkId: "mezo-mainnet";
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}): Readonly<RebaseReader> {
  const locks = createLockReader({ ...config, role: "vemezo-current" }),
    tokens = createTokenReader({ transport: config.transport }),
    codec = createAbiCodec();
  return Object.freeze({
    async read(input) {
      const tokenId = parseUint(input.tokenId);
      const escrow = await locks.read({
          account: input.account,
          tokenIds: [tokenId],
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
        }),
        coordinate = escrow.coordinate;
      const contract = config.registry.resolve({
          ...coordinate,
          contractId: "incentives.mezo-rebase-distributor",
        }),
        minter = config.registry.resolve({ ...coordinate, contractId: "incentives.mezo-minter" });
      for (const target of [contract, minter])
        await verifyContractRuntime({ contract: target, coordinate, transport: config.transport });
      async function call(target: ResolvedContract, name: string, args: readonly AbiValue[] = []) {
        const entries = target.readAbi.filter(
            (row) => row.type === "function" && row.name === name,
          ),
          abi = entries[0];
        incentiveRequire(
          entries.length === 1 && abi !== undefined,
          "IdentityMismatch",
          `rebase getter unavailable: ${name}`,
        );
        return codec.decodeFunction(
          abi,
          await config.transport.read({
            ...coordinate,
            contractId: target.contractId,
            address: target.address,
            data: codec.encodeFunction(abi, args),
          }),
        );
      }
      const n = async (target: ResolvedContract, name: string, args: readonly AbiValue[] = []) =>
        parseUint((await call(target, name, args))[0]);
      for (const [target, name, expected] of [
        [contract, "ve", escrow.contract.address],
        [contract, "token", escrow.underlying],
        [contract, "depositor", minter.address],
        [minter, "mezoRebaseDistributor", contract.address],
        [minter, "veMEZO", escrow.contract.address],
        [minter, "mezo", escrow.underlying],
        [escrow.contract, "distributor", contract.address],
      ] as const)
        incentiveRequire(
          parseAddress((await call(target, name))[0]) === expected,
          "IdentityMismatch",
          `rebase graph differs: ${name}`,
        );
      const startTime = await n(contract, "startTime"),
        lastTokenTime = await n(contract, "lastTokenTime"),
        timeCursor = await n(contract, "timeCursorOf", [tokenId]),
        activePeriod = await n(minter, "activePeriod"),
        tokenLastBalance = await n(contract, "tokenLastBalance"),
        userPointEpoch = await n(escrow.contract, "userPointEpoch", [tokenId]);
      const week = escrow.epoch.next - escrow.epoch.start;
      incentiveRequire(
        (await n(contract, "week")) === week &&
          lastTokenTime <= escrow.timestamp &&
          activePeriod % week === 0n &&
          activePeriod <= escrow.epoch.start,
        "IdentityMismatch",
        "rebase time boundaries differ",
      );
      let firstUserTimestamp: bigint | null = null;
      if (userPointEpoch > 0n) {
        const point = (await call(escrow.contract, "userPointHistory", [tokenId, 1n]))[0];
        incentiveRequire(
          Array.isArray(point) && point.length === 8,
          "IdentityMismatch",
          "rebase first user checkpoint differs",
        );
        firstUserTimestamp = parseUint(point[2]);
        incentiveRequire(
          firstUserTimestamp <= escrow.timestamp && parseUint(point[3]) <= coordinate.blockNumber,
          "IdentityMismatch",
          "future rebase user point",
        );
      }
      const cursor = { startTime, lastTokenTime, timeCursor, firstUserTimestamp },
        window = rebaseWindow(cursor),
        periods: RebasePeriod[] = [];
      for (let i = 0n; i < window.periods; i++) {
        const at = window.begin + i * week,
          end = at + week - 1n;
        const [votingPower, totalVotingPower, allocated] = await Promise.all([
          n(escrow.contract, "votingPowerOfNFTAt", [tokenId, end]),
          n(escrow.contract, "totalVotingPowerAt", [end]),
          n(contract, "tokensPerWeek", [at]),
        ]);
        periods.push(Object.freeze({ week: at, votingPower, totalVotingPower, allocated }));
      }
      const claim = calculateRebaseClaim({ ...cursor, periods });
      incentiveRequire(
        (await n(contract, "claimable", [tokenId])) === claim.amount,
        "IdentityMismatch",
        "bounded rebase claim differs from contract",
      );
      const custody = await tokens.read({
        target: { contractId: contract.contractId, address: escrow.underlying },
        account: contract.address,
        spender: escrow.contract.address,
        coordinate,
      });
      incentiveRequire(
        custody.decimals === escrow.token.decimals,
        "IdentityMismatch",
        "rebase token precision differs",
      );
      incentiveRequire(
        parseUint(await config.transport.getChainId()) === coordinate.chainId &&
          parseHash32((await config.transport.getBlock(coordinate.blockNumber))?.hash) ===
            coordinate.blockHash,
        "IdentityMismatch",
        "rebase snapshot anchor changed",
      );
      return Object.freeze({
        ...cursor,
        contract,
        minter,
        escrow,
        tokenId,
        activePeriod,
        tokenLastBalance,
        userPointEpoch,
        custody,
        periods: Object.freeze(periods),
        claim,
      });
    },
  } satisfies RebaseReader);
}
