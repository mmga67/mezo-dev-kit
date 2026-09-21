import { describe, expect, test } from "vitest";
import { createMemorySubmissionStore } from "@mezo-dev-kit/core";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { EvmValueError } from "@mezo-dev-kit/evm";
import { CliError } from "@mezo-dev-kit/cli";
import { createConnection } from "../setup.ts";
import { prepareAmount } from "../evm/amounts.ts";
import { selectNetwork } from "../chains/select-network.ts";
import { evaluatePrice } from "../prices/normalize.ts";
import { allocateRepayment } from "../institutional-debt/inspect-position.ts";
import { configureProject, foundationConfig } from "../project-tooling/configure.ts";
import { readMusdBalances } from "../core/read-balances.ts";

describe("focused application boundaries", () => {
  test("coherent balance example encodes the requested accounts and retains one coordinate", async () => {
    const first = `0x${"11".repeat(20)}`,
      second = `0x${"22".repeat(20)}`;
    const requests: { data: string; blockNumber: bigint }[] = [];
    const hash = `0x${"33".repeat(32)}`;
    const result = await readMusdBalances(
      {
        network: getNetwork("mezo-mainnet"),
        registry: createContractRegistry(),
        transport: {
          id: "synthetic-coherent-read",
          getChainId: () => 31612n,
          getBlockNumber: () => 12_000_000n,
          getBlock: (number) => ({ number, hash }),
          read: ({ data, blockNumber }) => {
            requests.push({ data, blockNumber });
            return `0x${(data.endsWith("11".repeat(20)) ? 123n : 456n).toString(16).padStart(64, "0")}`;
          },
        },
      },
      first,
      second,
    );
    expect(result).toMatchObject({
      firstBalance: 123n,
      secondBalance: 456n,
      coordinate: { blockNumber: 12_000_000n, blockHash: hash },
    });
    expect(requests).toEqual([
      { data: `0x70a08231${"0".repeat(24)}${"11".repeat(20)}`, blockNumber: 12_000_000n },
      { data: `0x70a08231${"0".repeat(24)}${"22".repeat(20)}`, blockNumber: 12_000_000n },
    ]);
  });
  test("RPC and wallet connections remain separate and construction submits nothing", async () => {
    const account = `0x${"11".repeat(20)}`;
    const reads: string[] = [],
      wallet: string[] = [];
    const connection = createConnection({
      networkId: "mezo-mainnet",
      account,
      store: createMemorySubmissionStore(),
      readRequest: async ({ method }) => {
        reads.push(method);
        if (method === "eth_chainId") return "0x7b7c";
        throw new Error(method);
      },
      walletRequest: async ({ method }) => {
        wallet.push(method);
        if (method === "eth_accounts") return [account];
        throw new Error(method);
      },
    });
    expect(reads).toEqual([]);
    expect(wallet).toEqual([]);
    expect(await connection.transport.getChainId()).toBe(connection.network.evmChainId);
    expect(await connection.signer.getAddress()).toBe(account);
    expect(reads).toEqual(["eth_chainId"]);
    expect(wallet).toEqual(["eth_accounts"]);
  });

  test("excess input precision rejects instead of silently rounding a transfer amount", () => {
    const address = `0x${"11".repeat(20)}`;
    expect(prepareAmount(address, "12.345", 6)).toMatchObject({
      baseUnits: 12345000n,
      roundTrip: 12345000n,
      displayAmount: "12.345",
    });
    expect(() => prepareAmount(address, "0.0000001", 6)).toThrow(EvmValueError);
  });

  test("network selection rejects a real but different RPC chain", async () => {
    await expect(selectNetwork("mezo-mainnet", async () => "0x1")).rejects.toThrow(
      "RPC chain differs",
    );
  });

  test("valid scaling does not hide a stale publication or fabricate confidence", () => {
    const input = {
      amount: {
        raw: 12345n,
        exponent: -2,
        targetDecimals: 6,
        rounding: "floor" as const,
        zeroAllowed: false,
        allowPrecisionLoss: false,
      },
      confidence: null,
      publishedAt: 1000n,
      asOf: 1060n,
      maxAgeSeconds: 60n,
    };
    expect(evaluatePrice(input)).toMatchObject({
      validAmountAndTime: true,
      amount: { status: "valid", value: 123450000n },
      confidence: { status: "unsupported", value: null },
    });
    expect(evaluatePrice({ ...input, asOf: 1061n })).toMatchObject({
      validAmountAndTime: false,
      freshness: { status: "stale" },
    });
  });

  test("institutional repayment preserves fee-first allocation and economic rejection", () => {
    expect(allocateRepayment({ principal: 100n, totalFees: 10n, payment: 50n })).toEqual({
      accepted: true,
      feePayment: 10n,
      principalPayment: 40n,
      remainingPrincipal: 60n,
    });
    expect(allocateRepayment({ principal: 100n, totalFees: 10n, payment: 9n })).toEqual({
      accepted: false,
      reason: "payment-below-fees",
    });
  });

  test("project configuration parsing retains exact allowed shape and rejects unknown fields", () => {
    expect(configureProject(foundationConfig)).toEqual(foundationConfig);
    expect(() =>
      configureProject({ ...foundationConfig, privateKey: "invalid-example-field" }),
    ).toThrow(CliError);
  });
});
