import type { ContractAddress, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate } from "@mezo-dev-kit/core";

import { amount } from "./accounting.ts";
import { SavingsReadError } from "./errors.ts";
import { SAVINGS_ROLE_TEMPLATES } from "./model.generated.ts";
import {
  address,
  dynamicRead,
  optional,
  readCall,
  sameAddress,
  scalar,
  verifyRole,
} from "./reads.ts";
import type {
  SavingsConverter,
  SavingsGauge,
  SavingsReaderConfig,
  SavingsStrategy,
} from "./types.ts";

export interface RoleContext {
  readonly config: SavingsReaderConfig;
  readonly coordinate: ReadCoordinate;
  readonly savings: ResolvedContract;
  readonly musd: ContractAddress;
  readonly voter: ContractAddress;
}
export async function readStrategy(
  context: RoleContext,
  target: ContractAddress,
): Promise<SavingsStrategy> {
  const { config, coordinate, savings, musd } = context;
  await verifyRole(config, coordinate, "strategy", target);
  const abi = SAVINGS_ROLE_TEMPLATES.strategy.readAbi;
  const [vault, token] = await Promise.all(
    ["vault", "token"].map((name) => dynamicRead(config, coordinate, target, readCall(abi, name))),
  );
  sameAddress(vault, savings.address, "strategy.vault");
  sameAddress(token, musd, "strategy.token");
  return Object.freeze({ address: target, vault: savings.address, token: musd });
}
export async function readConverter(
  context: RoleContext,
  target: ContractAddress,
): Promise<SavingsConverter> {
  const { config, coordinate, savings, musd } = context;
  const implementationAddress = await verifyRole(config, coordinate, "converter", target);
  const abi = SAVINGS_ROLE_TEMPLATES.converter.readAbi;
  const [root, token, slippage] = await Promise.all(
    ["musdSavingsRate", "musdToken", "maxSlippageBps"].map((name) =>
      dynamicRead(config, coordinate, target, readCall(abi, name)),
    ),
  );
  sameAddress(root, savings.address, "converter.musdSavingsRate");
  sameAddress(token, musd, "converter.musdToken");
  return Object.freeze({
    address: target,
    implementationAddress,
    savings: savings.address,
    musdToken: musd,
    maxSlippageBps: scalar(slippage, "converter.maxSlippageBps"),
  });
}
export async function readGauge(
  context: RoleContext,
  target: ContractAddress,
  account: ContractAddress,
  supply: bigint,
): Promise<SavingsGauge> {
  const { config, coordinate, savings, voter } = context;
  await verifyRole(config, coordinate, "gauge", target);
  const abi = SAVINGS_ROLE_TEMPLATES.gauge.readAbi;
  const [stakingToken, gaugeVoter, rewardToken] = await Promise.all(
    ["stakingToken", "voter", "rewardToken"].map((name) =>
      dynamicRead(config, coordinate, target, readCall(abi, name)),
    ),
  );
  sameAddress(stakingToken, savings.address, "gauge.stakingToken");
  sameAddress(gaugeVoter, voter, "gauge.voter");
  const reward = address(rewardToken, "gauge.rewardToken");
  const [balance, stakedSupply, custody, earnedRewards, cachedVoterRevenue] = await Promise.all([
    dynamicRead(config, coordinate, target, readCall(abi, "balanceOf", [account])),
    dynamicRead(config, coordinate, target, readCall(abi, "totalSupply")),
    dynamicRead(
      config,
      coordinate,
      savings.address,
      readCall(savings.readAbi, "balanceOf", [target]),
    ),
    optional("gauge.earned", async () =>
      amount(
        "gauge-reward-token",
        scalar(
          await dynamicRead(config, coordinate, target, readCall(abi, "earned", [account])),
          "gauge.earned",
        ),
      ),
    ),
    optional("gauge.fees", async () =>
      amount(
        "MUSD",
        scalar(await dynamicRead(config, coordinate, target, readCall(abi, "fees")), "gauge.fees"),
      ),
    ),
  ]);
  const beneficial = scalar(balance, "gauge.balanceOf");
  const total = scalar(stakedSupply, "gauge.totalSupply");
  const held = scalar(custody, "savings.balanceOf(gauge)");
  // Donations can make custody exceed stake. They are never attributed to the account.
  if (beneficial > total || total > held || held > supply)
    throw new SavingsReadError("TopologyMismatch", "gauge.custody");
  return Object.freeze({
    address: target,
    stakingToken: savings.address,
    voter,
    rewardToken: reward,
    beneficialReceipts: amount("sMUSD", beneficial),
    totalStakedReceipts: amount("sMUSD", total),
    custodyReceipts: amount("sMUSD", held),
    earnedRewards,
    cachedVoterRevenue,
  });
}
