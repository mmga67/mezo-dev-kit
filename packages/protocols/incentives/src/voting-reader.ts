import { resolveVotingInterface, resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractId, ResolvedContract } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { createLockReader } from "./lock-reader.ts";
import type {
  VotingReader,
  VotingReaderConfig,
  VotingRewardState,
  VotingTarget,
} from "./voting-types.ts";
const zero = parseAddress(`0x${"0".repeat(40)}`),
  codec = createAbiCodec();
function boolean(value: unknown) {
  incentiveRequire(typeof value === "boolean", "IdentityMismatch", "invalid voting boolean");
  return value;
}
function nonzero(value: unknown) {
  const address = parseAddress(value);
  incentiveRequire(address !== zero, "IdentityMismatch", "zero voting graph address");
  return address;
}
function bounded(value: unknown): value is readonly `0x${string}`[] {
  return Array.isArray(value) && value.length <= 32;
}
export function createVotingReader(config: VotingReaderConfig): Readonly<VotingReader> {
  const { registry, transport } = config,
    profile = resolveVotingInterface(config),
    locks = createLockReader({
      ...config,
      role: config.domain === "boost" ? "vemezo-current" : "vebtc-current",
    });
  return Object.freeze({
    async read(input) {
      incentiveRequire(
        bounded(input.targets),
        "LimitExceeded",
        "at most 32 requested voting targets",
      );
      const targets = input.targets.map(nonzero),
        tokenId = parseUint(input.tokenId);
      incentiveRequire(
        tokenId > 0n && new Set(targets).size === targets.length,
        "InvalidInput",
        "positive NFT and distinct targets required",
      );
      const escrow = await locks.read({
          account: input.account,
          tokenIds: [tokenId],
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
        }),
        coordinate = escrow.coordinate,
        resolve = (contractId: ContractId) =>
          registry.resolve({
            contractId,
            networkId: coordinate.networkId,
            blockNumber: coordinate.blockNumber,
          }),
        contract = resolve(profile.contractId),
        factory = resolve("incentives.factory-registry"),
        rewardFactory = resolve("incentives.voting-rewards-factory");
      for (const target of [contract, rewardFactory])
        await verifyContractRuntime({ contract: target, coordinate, transport });
      async function call(
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
      ) {
        const matches = abi.filter((row) => row.type === "function" && row.name === name),
          entry = matches[0];
        incentiveRequire(
          matches.length === 1 && entry !== undefined,
          "IdentityMismatch",
          `voting getter unavailable: ${name}`,
        );
        return codec.decodeFunction(
          entry,
          await transport.read({
            ...coordinate,
            contractId: contract.contractId,
            address,
            data: codec.encodeFunction(entry, args),
          }),
        );
      }
      const rootCall = (target: ResolvedContract, name: string, args: readonly AbiValue[] = []) =>
          call(target.address, target.readAbi, name, args),
        n = async (name: string, args: readonly AbiValue[] = []) =>
          parseUint((await rootCall(contract, name, args))[0]),
        b = async (name: string, args: readonly AbiValue[] = []) =>
          boolean((await rootCall(contract, name, args))[0]);
      incentiveRequire(
        parseAddress((await rootCall(contract, "ve"))[0]) === escrow.contract.address &&
          parseAddress((await rootCall(contract, "factoryRegistry"))[0]) === factory.address,
        "IdentityMismatch",
        "voter escrow or factory registry differs",
      );
      const forwarder = nonzero((await rootCall(contract, "forwarder"))[0]),
        voterAuthorized =
          escrow.primaryVoter === contract.address ||
          boolean((await rootCall(escrow.contract, "isSecondaryVoter", [contract.address]))[0]);
      for (const [name, expected] of [
        ["epochStart", escrow.epoch.start],
        ["epochNext", escrow.epoch.next],
        ["epochVoteStart", escrow.epoch.voteStart],
        ["epochVoteEnd", escrow.epoch.voteEnd],
      ] as const)
        incentiveRequire(
          (await n(name, [escrow.timestamp])) === expected,
          "IdentityMismatch",
          "voter epoch generation differs",
        );
      const [totalWeight, usedWeight, lastVoted, maxVotingNum, whitelisted, deactivated] =
        await Promise.all([
          n("totalWeight"),
          n("usedWeights", [tokenId]),
          n("lastVoted", [tokenId]),
          n("maxVotingNum"),
          b("isWhitelistedNFT", [tokenId]),
          rootCall(escrow.contract, "deactivated", [tokenId]).then((row) => boolean(row[0])),
        ]);
      // uint256 mapping key followed by its compiler-proven storage slot. The
      // resulting dynamic-array head contains length, not the first target.
      const head = keccak256(
          `0x${tokenId.toString(16).padStart(64, "0")}${BigInt(profile.targetListSlot).toString(16).padStart(64, "0")}`,
        ),
        count = parseUint(
          BigInt(parseHash32(await transport.getStorage(contract.address, head, coordinate))),
        );
      incentiveRequire(
        count <= 32n,
        "LimitExceeded",
        "existing voting allocation exceeds 32 targets",
      );
      const previousTargets: `0x${string}`[] = [];
      for (let i = 0n; i < count; i++)
        previousTargets.push(
          nonzero((await rootCall(contract, profile.listGetter, [tokenId, i]))[0]),
        );
      incentiveRequire(
        new Set(previousTargets).size === previousTargets.length,
        "IdentityMismatch",
        "duplicate stored voting targets",
      );
      const requested = [...new Set([...previousTargets, ...targets])],
        rows: VotingTarget[] = [],
        rewardAddresses = new Set<string>();
      for (const target of requested) {
        const gauge =
            config.domain === "pools"
              ? parseAddress((await rootCall(contract, "gauges", [target]))[0])
              : target,
          registered = gauge !== zero && (await b("isGauge", [gauge])),
          alive = await b("isAlive", [gauge]),
          weight = await n("weights", [target]),
          vote = await n("votes", [tokenId, target]);
        const rewards: VotingRewardState[] = [];
        incentiveRequire(!alive || registered, "IdentityMismatch", "live unregistered gauge");
        if (registered) {
          if (config.domain === "pools")
            incentiveRequire(
              parseAddress((await rootCall(contract, "poolForGauge", [gauge]))[0]) === target,
              "IdentityMismatch",
              "pool gauge reverse mapping differs",
            );
          for (const role of config.domain === "pools"
            ? (["fees", "bribe"] as const)
            : (["bribe"] as const)) {
            const address = nonzero(
                (
                  await rootCall(contract, role === "fees" ? "gaugeToFees" : "gaugeToBribe", [
                    gauge,
                  ])
                )[0],
              ),
              template = resolveVotingRewardInterface({ networkId: config.networkId, role });
            incentiveRequire(
              !rewardAddresses.has(address),
              "IdentityMismatch",
              "reward shared by distinct voting targets",
            );
            rewardAddresses.add(address);
            let expected: string = template.runtimeTemplate;
            for (const word of template.immutableWords) {
              const value = { voter: contract.address, ve: escrow.contract.address, forwarder }[
                  word.role
                ]
                  .slice(2)
                  .padStart(64, "0"),
                start = 2 + word.start * 2;
              expected = expected.slice(0, start) + value + expected.slice(start + 64);
            }
            incentiveRequire(
              parseHexData(await transport.getCode(address, coordinate)) === expected,
              "IdentityMismatch",
              "voting reward executable differs from factory child",
            );
            const rewardCall = (name: string, args: readonly AbiValue[] = []) =>
              call(address, template.abi, name, args);
            for (const [name, value] of [
              ["voter", contract.address],
              ["ve", escrow.contract.address],
              ["authorized", contract.address],
            ] as const)
              incentiveRequire(
                parseAddress((await rewardCall(name))[0]) === value,
                "IdentityMismatch",
                "voting reward authority differs",
              );
            const [balance, supply, numCheckpoints, supplyNumCheckpoints] = await Promise.all([
              rewardCall("balanceOf", [tokenId]),
              rewardCall("totalSupply"),
              rewardCall("numCheckpoints", [tokenId]),
              rewardCall("supplyNumCheckpoints"),
            ]).then((values) => values.map((row) => parseUint(row[0])));
            incentiveRequire(
              balance !== undefined &&
                supply !== undefined &&
                numCheckpoints !== undefined &&
                supplyNumCheckpoints !== undefined &&
                balance === vote &&
                supply >= balance,
              "IdentityMismatch",
              "voting reward accounting differs",
            );
            let checkpointTimestamp: bigint | null = null,
              supplyCheckpointTimestamp: bigint | null = null;
            if (numCheckpoints > 0n) {
              const row = await rewardCall("checkpoints", [tokenId, numCheckpoints - 1n]);
              checkpointTimestamp = parseUint(row[0]);
              incentiveRequire(
                parseUint(row[1]) === balance && checkpointTimestamp <= escrow.timestamp,
                "IdentityMismatch",
                "reward balance checkpoint differs",
              );
            } else
              incentiveRequire(
                balance === 0n,
                "IdentityMismatch",
                "reward balance without checkpoint",
              );
            if (supplyNumCheckpoints > 0n) {
              const row = await rewardCall("supplyCheckpoints", [supplyNumCheckpoints - 1n]);
              supplyCheckpointTimestamp = parseUint(row[0]);
              incentiveRequire(
                parseUint(row[1]) === supply && supplyCheckpointTimestamp <= escrow.timestamp,
                "IdentityMismatch",
                "reward supply checkpoint differs",
              );
            } else
              incentiveRequire(
                supply === 0n,
                "IdentityMismatch",
                "reward supply without checkpoint",
              );
            rewards.push(
              Object.freeze({
                role,
                address,
                balance,
                totalSupply: supply,
                numCheckpoints,
                supplyNumCheckpoints,
                checkpointTimestamp,
                supplyCheckpointTimestamp,
              }),
            );
          }
        }
        incentiveRequire(
          weight >= vote && (!previousTargets.includes(target) || (registered && vote > 0n)),
          "IdentityMismatch",
          "stored allocation target differs",
        );
        rows.push(
          Object.freeze({
            target,
            gauge,
            registered,
            alive,
            weight,
            vote,
            rewards: Object.freeze(rewards),
          }),
        );
      }
      const previousWeight = rows
          .filter((row) => previousTargets.includes(row.target))
          .reduce((sum, row) => parseUint(sum + row.vote), 0n),
        lock = escrow.locks[0];
      incentiveRequire(
        lock !== undefined &&
          previousWeight === usedWeight &&
          totalWeight >= usedWeight &&
          lock.voters.includes(contract.address) === usedWeight > 0n &&
          rows.every((row) => previousTargets.includes(row.target) || row.vote === 0n),
        "IdentityMismatch",
        "voter allocation coverage differs",
      );
      incentiveRequire(
        parseUint(await transport.getChainId()) === coordinate.chainId &&
          parseHash32((await transport.getBlock(coordinate.blockNumber))?.hash) ===
            coordinate.blockHash,
        "IdentityMismatch",
        "voter snapshot anchor changed",
      );
      return Object.freeze({
        domain: config.domain,
        contract,
        escrow,
        tokenId,
        forwarder,
        totalWeight,
        usedWeight,
        lastVoted,
        maxVotingNum,
        whitelisted,
        deactivated,
        voterAuthorized,
        previousTargets: Object.freeze(previousTargets),
        targets: Object.freeze(rows),
      });
    },
  } satisfies VotingReader);
}
