import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseMinimalProxyImplementation,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { INCENTIVES_MODEL } from "./model.generated.ts";
import { calculateCLGaugeEarned } from "./cl-gauge-math.ts";
import type { CLGaugeReader, CLGaugeReaderConfig, CLGaugeState } from "./cl-gauge-types.ts";
const zero = parseAddress(`0x${"0".repeat(40)}`);
export function createCLGaugeReader(config: CLGaugeReaderConfig): Readonly<CLGaugeReader> {
  const { transport, registry } = config,
    codec = createAbiCodec(),
    tokens = createTokenReader({ transport }),
    network = getNetwork("mezo-mainnet");
  return Object.freeze({
    async read(input) {
      const account = parseAddress(input.account),
        tokenId = parseUint(input.tokenId);
      incentiveRequire(
        account !== zero && tokenId > 0n,
        "InvalidInput",
        "nonzero CL account and NFT required",
      );
      const pool = await config.positions.read({
          account,
          tokenIds: [tokenId],
          ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }),
        }),
        coordinate = pool.coordinate;
      incentiveRequire(
        coordinate.networkId === network.id &&
          coordinate.chainId === network.evmChainId &&
          pool.account === account &&
          (input.blockNumber === undefined || coordinate.blockNumber === input.blockNumber) &&
          pool.positions.length === 1,
        "IdentityMismatch",
        "CL position port returned a different request",
      );
      const position = pool.positions[0];
      incentiveRequire(
        position?.tokenId === tokenId && pool.gauge !== null,
        "UnavailableState",
        "CL NFT or gauge unavailable",
      );
      const gauge = pool.gauge.address,
        contract = registry.resolve({
          ...coordinate,
          contractId: "incentives.cl-gauge-implementation",
        }),
        manager = registry.resolve({ ...coordinate, contractId: "mezo-earn.cl-position-manager" });
      await Promise.all(
        [contract, manager].map((contract) =>
          verifyContractRuntime({ contract, coordinate, transport }),
        ),
      );
      incentiveRequire(
        pool.gauge.implementation === contract.address &&
          pool.manager.address === manager.address &&
          parseMinimalProxyImplementation(await transport.getCode(gauge, coordinate)) ===
            contract.address,
        "IdentityMismatch",
        "CL gauge generation differs",
      );
      async function call(
        address: `0x${string}`,
        abi: readonly ContractAbiEntry[],
        name: string,
        args: readonly AbiValue[] = [],
      ) {
        const entry = abi.find((row) => row.type === "function" && row.name === name);
        incentiveRequire(entry !== undefined, "UnavailableState", `CL getter missing: ${name}`);
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
      const g = async (name: string, args: readonly AbiValue[] = []) =>
        (await call(gauge, contract.readAbi, name, args))[0];
      const p = async (name: string, args: readonly AbiValue[] = []) =>
        (await call(pool.pool, pool.implementation.readAbi, name, args))[0];
      const gn = async (name: string, args: readonly AbiValue[] = []) =>
        parseUint(await g(name, args));
      const pn = async (name: string) => parseUint(await p(name));
      for (const [name, expected] of [
        ["pool", pool.pool],
        ["nft", manager.address],
        ["voter", pool.gauge.voter],
        ["gaugeFactory", pool.gauge.factory],
        ["rewardToken", pool.gauge.rewardToken],
      ] as const)
        incentiveRequire(
          parseAddress(await g(name)) === expected,
          "IdentityMismatch",
          `CL gauge topology differs: ${name}`,
        );
      const profile = INCENTIVES_MODEL.escrows.find((row) => row.role === "vemezo-current");
      incentiveRequire(
        pool.gauge.rewardToken === profile?.underlying,
        "IdentityMismatch",
        "CL reward is not canonical MEZO",
      );
      const staked = await g("stakedContains", [account, tokenId]),
        operator = (
          await call(manager.address, manager.readAbi, "isApprovedForAll", [account, gauge])
        )[0];
      incentiveRequire(
        typeof staked === "boolean" && typeof operator === "boolean",
        "IdentityMismatch",
        "CL stake or approval response invalid",
      );
      incentiveRequire(
        !staked ||
          (position.owner === gauge && position.staked && position.beneficialDepositor === account),
        "IdentityMismatch",
        "CL depositor proof differs",
      );
      const [
        rewardRate,
        periodFinish,
        globalX128,
        reserve,
        rollover,
        lastUpdated,
        positionInsideX128,
        positionLastUpdate,
        stored,
        lower,
        upper,
        reward,
        rewardCustody,
        earned,
      ] = await Promise.all([
        gn("rewardRate"),
        gn("periodFinish"),
        pn("rewardGrowthGlobalX128"),
        pn("rewardReserve"),
        pn("rollover"),
        pn("lastUpdated"),
        gn("rewardGrowthInside", [tokenId]),
        gn("lastUpdateTime", [tokenId]),
        gn("rewards", [tokenId]),
        call(pool.pool, pool.implementation.readAbi, "ticks", [BigInt(position.tickLower)]),
        call(pool.pool, pool.implementation.readAbi, "ticks", [BigInt(position.tickUpper)]),
        tokens.read({
          coordinate,
          account,
          spender: gauge,
          target: {
            contractId: contract.contractId,
            address: profile.underlying,
            targetRole: "cl-gauge-reward",
          },
        }),
        call(profile.underlying, getTokenInterface(), "balanceOf", [gauge]).then((row) =>
          parseUint(row[0]),
        ),
        staked ? gn("earned", [account, tokenId]) : Promise.resolve(0n),
      ]);
      incentiveRequire(
        lower.length === 10 &&
          upper.length === 10 &&
          reward.decimals === BigInt(profile.decimals) &&
          rewardRate === (await pn("rewardRate")) &&
          periodFinish === (await pn("periodFinish")),
        "IdentityMismatch",
        "CL reward configuration differs",
      );
      const snapshot: Readonly<CLGaugeState> = Object.freeze({
        pool,
        position,
        contract,
        gauge,
        staked,
        gaugeApproved: position.approved === gauge || operator,
        operatorApproved: operator,
        reward,
        rewardCustody,
        earned,
        rewards: Object.freeze({
          rewardRate,
          periodFinish,
          globalX128,
          reserve,
          rollover,
          lastUpdated,
          positionInsideX128,
          positionLastUpdate,
          stored,
          lowerOutsideX128: parseUint(lower[5]),
          upperOutsideX128: parseUint(upper[5]),
        }),
      });
      if (staked)
        incentiveRequire(
          calculateCLGaugeEarned(snapshot) === earned,
          "IdentityMismatch",
          "CL reward growth differs from exact earned getter",
        );
      const final = await transport.getBlock(coordinate.blockNumber);
      incentiveRequire(
        final &&
          parseHash32(final.hash) === coordinate.blockHash &&
          parseUint(await transport.getChainId()) === coordinate.chainId,
        "IdentityMismatch",
        "CL gauge coordinate changed",
      );
      return snapshot;
    },
  } satisfies CLGaugeReader);
}
export function createCLGaugeTargetResolver(config: {
  readonly reader: CLGaugeReader;
  readonly account: `0x${string}`;
  readonly tokenId: bigint;
}): ExecutionTargetResolver {
  return async (input) => {
    const s = await config.reader.read({
      account: config.account,
      tokenId: config.tokenId,
      blockNumber: input.coordinate.blockNumber,
    });
    incentiveRequire(
      input.contractId === s.contract.contractId &&
        input.role === "cl-gauge" &&
        input.coordinate.blockHash === s.pool.coordinate.blockHash &&
        input.coordinate.chainId === s.pool.coordinate.chainId &&
        input.coordinate.networkId === s.pool.coordinate.networkId,
      "IdentityMismatch",
      "CL gauge execution role differs",
    );
    return s.gauge;
  };
}
