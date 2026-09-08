import type { BasicPoolSnapshot } from "../src/index.ts";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
const address = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const coordinate = {
  networkId: "mezo-mainnet",
  chainId: 31612n,
  blockNumber: 11703359n,
  blockHash: `0x${"ab".repeat(32)}`,
} as const;
const account = address("1"),
  router = address("2"),
  pool = address("3");
const token = (asset: `0x${string}`, role: string): TokenSnapshot => ({
  coordinate,
  account,
  spender: router,
  target: { contractId: "mezo-earn.pool-factory", address: asset, targetRole: role },
  decimals: 18n,
  balance: 100000n,
  allowance: 100000n,
});
export function snapshot(): BasicPoolSnapshot {
  return {
    coordinate,
    timestamp: 1000n,
    providerId: "fixture",
    key: { token0: address("4"), token1: address("5"), stable: false },
    account,
    router,
    factory: address("6"),
    factoryRegistry: address("7"),
    implementation: address("8"),
    pool,
    poolFees: address("9"),
    fees: {
      balance: 0n,
      index0: 0n,
      index1: 0n,
      supplyIndex0: 0n,
      supplyIndex1: 0n,
      claimable0: 0n,
      claimable1: 0n,
      pending0: 0n,
      pending1: 0n,
    },
    paused: false,
    feeBps: 30n,
    reserve0: 5000n,
    reserve1: 10000n,
    reserveTimestamp: 999n,
    poolBalance0: 5000n,
    poolBalance1: 10000n,
    totalSupply: 1000n,
    poolLpBalance: 0n,
    writeCompatible: true,
    token0: token(address("4"), "basic-token-0"),
    token1: token(address("5"), "basic-token-1"),
    lp: { ...token(pool, "basic-lp"), balance: 100n },
  };
}
export const bounds = {
  minAmount0: 1n,
  minAmount1: 1n,
  minLiquidity: 1n,
  deadline: 1100n,
  maxDeadlineSeconds: 100n,
  maxBlockAge: 2n,
};
