import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { EscrowLock, LockSnapshot } from "../src/index.ts";
import { calculateLockVotingPower, calculateVotingEpoch } from "../src/index.ts";
export const account = `0x${"11".repeat(20)}` as const,
  zero = `0x${"00".repeat(20)}` as const,
  W = 10n ** 18n,
  week = 604800n;
export function lockFixture(): LockSnapshot {
  const coordinate = {
    networkId: "mezo-mainnet",
    chainId: 31612n,
    blockNumber: 11703359n,
    blockHash: `0x${"ab".repeat(32)}`,
  } as const;
  const contract = createContractRegistry().resolve({
      networkId: coordinate.networkId,
      blockNumber: coordinate.blockNumber,
      contractId: "incentives.ve-btc",
    }),
    underlying = `0x${"22".repeat(20)}` as const,
    timestamp = week * 2n + 1n;
  const power = calculateLockVotingPower({
    amount: 10n * W,
    boost: 0n,
    end: week * 4n,
    permanent: false,
    maxLockSeconds: week * 4n,
    timestamp,
  });
  const lock: EscrowLock = {
    tokenId: 1n,
    owner: account,
    approved: zero,
    callerApproved: true,
    kind: "normal",
    amount: 10n * W,
    end: week * 4n,
    permanent: false,
    storedBoost: 0n,
    currentBoost: W,
    boostGauge: zero,
    voted: false,
    voters: [],
    managedTokenId: 0n,
    delegatee: 0n,
    grantManager: zero,
    vestingEnd: 0n,
    currentVotingPower: power.boosted,
    currentUnboostedPower: power.unboosted,
    atTimeVotingPower: power.boosted,
    ownershipChangeSuppressed: false,
    lockPowerEstimate: power,
  };
  return {
    role: "vebtc-current",
    contract,
    coordinate,
    timestamp,
    account,
    underlying,
    maxLockSeconds: week * 4n,
    forwarder: zero,
    primaryVoter: zero,
    booster: zero,
    ownedCount: 1n,
    lastMintedTokenId: 1n,
    supply: 10n * W,
    permanentBalance: 0n,
    virtualPermanentBalance: 0n,
    totalVotingPower: power.boosted,
    totalUnboostedPower: power.unboosted,
    nativeBalance: 100n * W,
    token: {
      target: { contractId: contract.contractId, targetRole: "escrow-token", address: underlying },
      account,
      spender: contract.address,
      coordinate,
      balance: 100n * W,
      allowance: 0n,
      decimals: 18n,
    },
    escrowTokenBalance: 10n * W,
    locks: [lock],
    epoch: calculateVotingEpoch(timestamp),
  };
}
