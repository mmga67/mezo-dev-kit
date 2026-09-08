import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { LockVotingPower, VotingEpoch } from "./math.ts";
export type EscrowRole = "vebtc-current" | "vemezo-current";
export type EscrowKind = "normal" | "locked" | "managed";
export interface EscrowLock {
  readonly tokenId: bigint;
  readonly owner: `0x${string}`;
  readonly approved: `0x${string}`;
  readonly callerApproved: boolean;
  readonly kind: EscrowKind;
  readonly amount: bigint;
  readonly end: bigint;
  readonly permanent: boolean;
  readonly storedBoost: bigint;
  readonly currentBoost: bigint | null;
  readonly boostGauge: `0x${string}` | null;
  readonly voted: boolean;
  readonly voters: readonly `0x${string}`[];
  readonly managedTokenId: bigint;
  readonly delegatee: bigint;
  readonly grantManager: `0x${string}`;
  readonly vestingEnd: bigint;
  readonly currentVotingPower: bigint;
  readonly currentUnboostedPower: bigint;
  readonly atTimeVotingPower: bigint;
  readonly ownershipChangeSuppressed: boolean;
  readonly lockPowerEstimate: Readonly<LockVotingPower>;
}
export interface LockSnapshot {
  readonly role: EscrowRole;
  readonly contract: Readonly<ResolvedContract>;
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly account: `0x${string}`;
  readonly underlying: `0x${string}`;
  readonly maxLockSeconds: bigint;
  readonly forwarder: `0x${string}`;
  readonly primaryVoter: `0x${string}`;
  readonly booster: `0x${string}`;
  readonly ownedCount: bigint;
  readonly lastMintedTokenId: bigint;
  readonly supply: bigint;
  readonly permanentBalance: bigint;
  readonly virtualPermanentBalance: bigint;
  readonly totalVotingPower: bigint;
  readonly totalUnboostedPower: bigint;
  readonly nativeBalance: bigint;
  readonly token: Readonly<TokenSnapshot>;
  readonly escrowTokenBalance: bigint;
  readonly locks: readonly Readonly<EscrowLock>[];
  readonly epoch: Readonly<VotingEpoch>;
}
export interface LockReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly role: EscrowRole;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
export interface LockReader {
  read(input: {
    readonly account: `0x${string}`;
    readonly tokenIds: readonly bigint[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<LockSnapshot>>;
  listOwned(input: {
    readonly account: `0x${string}`;
    readonly offset: bigint;
    readonly limit: number;
    readonly blockNumber?: bigint;
  }): Promise<
    Readonly<{
      snapshot: Readonly<LockSnapshot>;
      offset: bigint;
      nextOffset: bigint | null;
      total: bigint;
    }>
  >;
}
