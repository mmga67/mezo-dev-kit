import type { ContractRegistry, ResolvedContract, VotingDomain } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import type { LockSnapshot } from "./lock-types.ts";
/**
 * Per-target reward child and accounting/checkpoint evidence, separate from direct streamed
 * gauge rewards.
 */
export interface VotingRewardState {
  readonly role: "fees" | "bribe";
  readonly address: `0x${string}`;
  readonly balance: bigint;
  readonly totalSupply: bigint;
  readonly numCheckpoints: bigint;
  readonly supplyNumCheckpoints: bigint;
  readonly checkpointTimestamp: bigint | null;
  readonly supplyCheckpointTimestamp: bigint | null;
}
/**
 * One verified voter target with liveness, allocated weight and associated reward children at
 * the snapshot coordinate.
 */
export interface VotingTarget {
  /** Pool address for pools; gauge address for boost and validator domains. */
  readonly target: `0x${string}`;
  readonly gauge: `0x${string}`;
  readonly registered: boolean;
  readonly alive: boolean;
  readonly weight: bigint;
  readonly vote: bigint;
  readonly rewards: readonly Readonly<VotingRewardState>[];
}
/**
 * One voter domain, NFT and the union of requested targets and existing allocations, with
 * bounded coverage.
 */
export interface VotingSnapshot {
  readonly domain: VotingDomain;
  readonly contract: Readonly<ResolvedContract>;
  readonly escrow: Readonly<LockSnapshot>;
  readonly tokenId: bigint;
  readonly forwarder: `0x${string}`;
  readonly totalWeight: bigint;
  readonly usedWeight: bigint;
  readonly lastVoted: bigint;
  readonly maxVotingNum: bigint;
  readonly whitelisted: boolean;
  readonly deactivated: boolean;
  readonly voterAuthorized: boolean;
  readonly previousTargets: readonly `0x${string}`[];
  readonly targets: readonly Readonly<VotingTarget>[];
}
/**
 * Explicit pools/boost/validator voter domain and registry/RPC inputs; each domain retains its
 * own target semantics.
 */
export interface VotingReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly domain: VotingDomain;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
/**
 * Anchored NFT, target and allocation reads. Existing allocations are included independently of
 * requested targets.
 */
export interface VotingReader {
  /**
   * Read one NFT, requested targets and all bounded prior allocations at one block; validate
   * voter/escrow/reward identity.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    /** Up to 32 additional targets; all previous allocations are included independently. */
    readonly targets: readonly `0x${string}`[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<VotingSnapshot>>;
}
