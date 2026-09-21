import { resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { calculateVotingEpoch } from "./math.ts";
import type { VotingReader, VotingRewardState, VotingSnapshot } from "./voting-types.ts";
/**
 * Reward token identity and bounded claim accounting; each token keeps its own decimal
 * precision.
 */
export interface VotingRewardToken {
  readonly token: `0x${string}`;
  readonly decimals: bigint;
  readonly walletBalance: bigint;
  readonly custody: bigint;
  readonly lastEarn: bigint;
  readonly firstClaimEpoch: bigint;
  readonly epochs: bigint;
  readonly earned: bigint;
}
/**
 * Anchored NFT/target/reward-child state for an explicit token set and bounded epoch history.
 */
export interface VotingRewardSnapshot {
  readonly voting: Readonly<VotingSnapshot>;
  readonly target: `0x${string}`;
  readonly reward: Readonly<VotingRewardState>;
  readonly tokens: readonly Readonly<VotingRewardToken>[];
}
/**
 * Explicit NFT, voter target, fee/bribe role and reward tokens; no token or epoch history is
 * inferred.
 */
export interface VotingRewardReadInput {
  readonly account: `0x${string}`;
  readonly tokenId: bigint;
  readonly target: `0x${string}`;
  readonly role: "fees" | "bribe";
  readonly tokens: readonly `0x${string}`[];
  readonly blockNumber?: bigint;
}
/**
 * Bounded fee/bribe entitlement inspection, separate from principal and streamed gauge rewards.
 */
export interface VotingRewardReader {
  /**
   * Read bounded fee/bribe claim history for the explicit NFT, target and reward-token set;
   * incomplete required evidence rejects.
   */
  read(input: VotingRewardReadInput): Promise<Readonly<VotingRewardSnapshot>>;
}
/** Exact factory reward accounting, bounded before calling the on-chain earned loop. */
export function createVotingRewardReader(config: {
  readonly voting: VotingReader;
  readonly transport: RpcTransport;
  readonly maxEpochs: number;
}): Readonly<VotingRewardReader> {
  incentiveRequire(
    Number.isSafeInteger(config.maxEpochs) && config.maxEpochs > 0 && config.maxEpochs <= 52,
    "InvalidInput",
    "reward epoch budget must be one to 52",
  );
  const codec = createAbiCodec(),
    tokenReader = createTokenReader({ transport: config.transport });
  return Object.freeze({
    async read(input) {
      incentiveRequire(
        Array.isArray(input.tokens) && input.tokens.length > 0 && input.tokens.length <= 8,
        "LimitExceeded",
        "one to eight explicit reward tokens required",
      );
      const tokens = input.tokens.map((token) => parseAddress(token));
      incentiveRequire(
        new Set(tokens).size === tokens.length &&
          tokens.every((token) => token !== `0x${"0".repeat(40)}`),
        "InvalidInput",
        "distinct nonzero reward tokens required",
      );
      const target = parseAddress(input.target);
      const voting = await config.voting.read({
        account: input.account,
        tokenId: input.tokenId,
        targets: [target],
        ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
      });
      const row = voting.targets.find((row) => row.target === target),
        selectedReward = row?.rewards.find((row) => row.role === input.role);
      incentiveRequire(
        row?.registered && selectedReward !== undefined,
        "UnavailableState",
        "registered target and reward role required",
      );
      const reward = selectedReward;
      incentiveRequire(
        reward.numCheckpoints <= 4096n && reward.supplyNumCheckpoints <= 4096n,
        "LimitExceeded",
        "reward checkpoint search exceeds budget",
      );
      const coordinate = voting.escrow.coordinate,
        epoch = voting.escrow.epoch,
        template = resolveVotingRewardInterface({
          networkId: coordinate.networkId,
          role: reward.role,
        });
      async function call(name: string, args: readonly AbiValue[] = []) {
        const entries = template.abi.filter((row) => row.type === "function" && row.name === name),
          abi = entries[0];
        incentiveRequire(
          entries.length === 1 && abi !== undefined,
          "IdentityMismatch",
          "reward getter unavailable",
        );
        return codec.decodeFunction(
          abi,
          await config.transport.read({
            ...coordinate,
            contractId: voting.contract.contractId,
            address: reward.address,
            data: codec.encodeFunction(abi, args),
          }),
        );
      }
      const n = async (name: string, args: readonly AbiValue[] = []) =>
        parseUint((await call(name, args))[0]);
      const duration = await n("duration");
      incentiveRequire(
        duration === epoch.next - epoch.start,
        "IdentityMismatch",
        "reward epoch duration differs",
      );
      const rows: VotingRewardToken[] = [];
      for (const token of tokens) {
        incentiveRequire(
          (await call("isReward", [token]))[0] === true,
          "UnavailableState",
          "token is not registered with this reward",
        );
        const lastEarn = await n("lastEarn", [token, voting.tokenId]);
        incentiveRequire(
          lastEarn <= voting.escrow.timestamp,
          "IdentityMismatch",
          "reward claim timestamp is in the future",
        );
        let firstClaimEpoch = epoch.start,
          earned = 0n;
        if (reward.numCheckpoints > 0n) {
          const start = calculateVotingEpoch(lastEarn).start;
          const index = await n("getPriorBalanceIndex", [voting.tokenId, start]);
          incentiveRequire(
            index < reward.numCheckpoints,
            "IdentityMismatch",
            "reward balance checkpoint index differs",
          );
          const first = await call("checkpoints", [voting.tokenId, index]);
          const firstEpoch = calculateVotingEpoch(parseUint(first[0])).start;
          firstClaimEpoch = start > firstEpoch ? start : firstEpoch;
          incentiveRequire(
            firstClaimEpoch <= epoch.start &&
              (epoch.start - firstClaimEpoch) / duration <= BigInt(config.maxEpochs),
            "LimitExceeded",
            "reward claim history exceeds epoch budget",
          );
          for (let at = firstClaimEpoch; at < epoch.start; at += duration) {
            const end = at + duration - 1n;
            const [balanceIndex, supplyIndex, amount] = await Promise.all([
              n("getPriorBalanceIndex", [voting.tokenId, end]),
              n("getPriorSupplyIndex", [end]),
              n("tokenRewardsPerEpoch", [token, at]),
            ]);
            incentiveRequire(
              balanceIndex < reward.numCheckpoints && supplyIndex < reward.supplyNumCheckpoints,
              "IdentityMismatch",
              "historical reward checkpoint index differs",
            );
            const [balance, supply] = await Promise.all([
              call("checkpoints", [voting.tokenId, balanceIndex]),
              call("supplyCheckpoints", [supplyIndex]),
            ]);
            const supplyValue = parseUint(supply[1]),
              balanceValue = parseUint(balance[1]);
            incentiveRequire(
              parseUint(balance[0]) <= end &&
                parseUint(supply[0]) <= end &&
                balanceValue <= supplyValue,
              "IdentityMismatch",
              "historical reward checkpoint differs",
            );
            earned = parseUint(
              earned + parseUint(balanceValue * amount) / (supplyValue > 0n ? supplyValue : 1n),
            );
          }
        }
        incentiveRequire(
          (await n("earned", [token, voting.tokenId])) === earned,
          "IdentityMismatch",
          "bounded reward calculation differs from contract",
        );
        const tokenInput = {
          target: { contractId: voting.contract.contractId, address: token },
          spender: reward.address,
          coordinate,
        };
        const [wallet, custody] = await Promise.all([
          tokenReader.read({ ...tokenInput, account: voting.escrow.account }),
          tokenReader.read({ ...tokenInput, account: reward.address }),
        ]);
        incentiveRequire(
          wallet.decimals === custody.decimals,
          "IdentityMismatch",
          "reward token precision differs",
        );
        rows.push(
          Object.freeze({
            token,
            decimals: wallet.decimals,
            walletBalance: wallet.balance,
            custody: custody.balance,
            lastEarn,
            firstClaimEpoch,
            epochs: (epoch.start - firstClaimEpoch) / duration,
            earned,
          }),
        );
      }
      incentiveRequire(
        parseUint(await config.transport.getChainId()) === coordinate.chainId &&
          parseHash32((await config.transport.getBlock(coordinate.blockNumber))?.hash) ===
            coordinate.blockHash,
        "IdentityMismatch",
        "reward snapshot anchor changed",
      );
      return Object.freeze({ voting, target, reward, tokens: Object.freeze(rows) });
    },
  } satisfies VotingRewardReader);
}
