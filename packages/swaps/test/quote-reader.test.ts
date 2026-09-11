import { expect, test, vi } from "vitest";
import * as api from "@mezo-dev-kit/swaps/quotes";
import type {
  BasicSwapQuote,
  BasicSwapQuoteInput,
  CLSwapQuoteInput,
  SwapQuoteRequest,
  SwapQuoteReaderConfig,
} from "@mezo-dev-kit/swaps/quotes";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { BasicPoolSnapshot } from "@mezo-dev-kit/pools";
import { clQuoteFixture } from "./cl-fixture.ts";

function fixture() {
  const cl = clQuoteFixture(),
    snapshot = cl.pools[0]!.snapshot;
  const router = createContractRegistry().resolve({
    ...cl.coordinate,
    contractId: "mezo-earn.router",
  }).address;
  const pool: BasicPoolSnapshot = {
    coordinate: cl.coordinate,
    timestamp: cl.timestamp,
    providerId: "synthetic-basic",
    account: cl.account,
    key: { token0: snapshot.key.token0, token1: snapshot.key.token1, stable: false },
    router,
    factory: snapshot.factory.address,
    factoryRegistry: snapshot.factoryRegistry.address,
    implementation: snapshot.implementation.address,
    pool: snapshot.pool,
    poolFees: snapshot.pool,
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
    reserve0: 10n ** 18n,
    reserve1: 10n ** 18n,
    reserveTimestamp: cl.timestamp,
    poolBalance0: 10n ** 18n,
    poolBalance1: 10n ** 18n,
    totalSupply: 10n ** 18n,
    poolLpBalance: 0n,
    writeCompatible: true,
    token0: { ...cl.inputToken, spender: router },
    token1: { ...cl.outputToken, spender: router },
    lp: {
      ...cl.inputToken,
      spender: router,
      target: { ...cl.inputToken.target, address: snapshot.pool },
    },
  };
  const basic: BasicSwapQuote = {
    ...cl,
    router,
    route: [{ tokenIn: cl.route[0]!.tokenIn, tokenOut: cl.route[0]!.tokenOut, stable: false }],
    pools: [pool],
    inputToken: pool.token0,
    outputToken: pool.token1,
    estimatedAmountOut: cl.estimatedAmountOut - 1n,
    amounts: [cl.amountIn, cl.estimatedAmountOut - 1n],
  };
  const input: SwapQuoteRequest = {
    account: cl.account,
    tokenIn: cl.inputToken.target.address,
    tokenOut: cl.outputToken.target.address,
    amountIn: cl.amountIn,
    maxAgeBlocks: 2n,
    eligibility: "all-quotes",
    candidates: [
      { id: "basic", required: true, family: "basic", route: basic.route, intermediateAssets: [] },
      {
        id: "cl",
        required: false,
        family: "concentrated-liquidity",
        route: cl.route,
        intermediateAssets: [],
        budget: cl.budget,
      },
    ],
  };
  const transport = {
    getChainId: vi.fn(async () => cl.coordinate.chainId),
    getBlockNumber: vi.fn(async () => cl.coordinate.blockNumber),
    getBlock: vi.fn<SwapQuoteReaderConfig["transport"]["getBlock"]>(async () => ({
      number: cl.coordinate.blockNumber,
      hash: cl.coordinate.blockHash,
    })),
    getBlockTimestamp: vi.fn(async () => cl.timestamp),
  };
  const basicReader = {
      quote: vi.fn<(input: BasicSwapQuoteInput) => Promise<BasicSwapQuote>>(async () => basic),
    },
    clReader = { quote: vi.fn<(input: CLSwapQuoteInput) => Promise<typeof cl>>(async () => cl) };
  const reader = api.createSwapQuoteReader({
    networkId: "mezo-mainnet",
    transport,
    basic: basicReader,
    concentratedLiquidity: clReader,
  });
  return { input, basic, cl, transport, basicReader, clReader, reader };
}

test("built read-only subpath exports deliberate readers and no writer or execution target", () => {
  expect(Object.keys(api).sort()).toEqual([
    "SwapError",
    "createBasicSwapReader",
    "createCLSwapReader",
    "createSwapQuoteReader",
    "encodeCLSwapPath",
    "rankBasicSwapQuotes",
    "validateBasicSwapRoute",
    "validateCLSwapRoute",
  ]);
});

test("one pinned request compares separate families, exposes fee units and limits, and preserves input order", async () => {
  const f = fixture(),
    result = await f.reader.quote(f.input);
  expect(result).toMatchObject({
    state: "complete",
    best: "cl",
    ranked: ["cl", "basic"],
    coordinate: f.cl.coordinate,
    observedHead: f.cl.coordinate.blockNumber,
    expiresAfterBlock: f.cl.coordinate.blockNumber + 2n,
    rankingPolicy: "highest-estimated-output",
    coverage: {
      scope: "provided-candidates-only",
      requested: 2,
      attempted: 2,
      quoted: 2,
      eligible: 2,
      failed: 0,
      requiredFailures: 0,
    },
    priceImpact: { status: "unavailable" },
    gas: { status: "not-estimated", rankingAdjustment: "none" },
    currencyConversion: "none",
  });
  expect(result.candidates.map((candidate) => candidate.id)).toEqual(["basic", "cl"]);
  expect(result.candidates[0]).toMatchObject({
    fees: [{ token: f.input.tokenIn, decimals: 18n, amount: 3_000_000_000_000n }],
  });
  expect(result.candidates[1]).toMatchObject({ fees: [{ amount: f.cl.pools[0]!.feeAmount }] });
  for (const reader of [f.basicReader, f.clReader])
    expect(reader.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: f.cl.coordinate.blockNumber,
        amountIn: f.input.amountIn,
      }),
    );
});

test("equal outputs use ASCII candidate ID, independent of input ordering", async () => {
  const f = fixture();
  f.basicReader.quote.mockResolvedValue({
    ...f.basic,
    estimatedAmountOut: f.cl.estimatedAmountOut,
    amounts: f.cl.amounts,
  });
  expect(
    (await f.reader.quote({ ...f.input, candidates: [...f.input.candidates].reverse() })).ranked,
  ).toEqual(["basic", "cl"]);
});

test("equivalent hop objects compare by fields rather than property insertion order", async () => {
  const f = fixture();
  f.basicReader.quote.mockResolvedValue({
    ...f.basic,
    route: [{ stable: false, tokenOut: f.input.tokenOut, tokenIn: f.input.tokenIn }],
  });
  expect((await f.reader.quote(f.input)).state).toBe("complete");
});

test("multi-hop fees preserve each input currency and are not subtracted from output twice", async () => {
  const f = fixture(),
    pool = f.basic.pools[0]!,
    intermediate = `0x${"44".repeat(20)}` as const;
  const middle = {
    ...pool.token0,
    target: { ...pool.token0.target, address: intermediate },
    decimals: 6n,
  };
  const route = [
    { tokenIn: f.input.tokenIn, tokenOut: intermediate, stable: false },
    { tokenIn: intermediate, tokenOut: f.input.tokenOut, stable: false },
  ];
  f.basicReader.quote.mockResolvedValue({
    ...f.basic,
    route,
    intermediateAssets: [intermediate],
    amounts: [f.input.amountIn, 1_000_000n, f.basic.estimatedAmountOut],
    writeCompatible: false,
    pools: [
      {
        ...pool,
        key: { token0: f.input.tokenIn, token1: intermediate, stable: false },
        token1: middle,
      },
      {
        ...pool,
        pool: `0x${"55".repeat(20)}`,
        key: { token0: f.input.tokenOut, token1: intermediate, stable: false },
        token0: pool.token1,
        token1: middle,
      },
    ],
  });
  const result = await f.reader.quote({
    ...f.input,
    candidates: [
      { id: "two-hop", required: true, family: "basic", route, intermediateAssets: [intermediate] },
    ],
  });
  expect(result).toMatchObject({ state: "complete", best: "two-hop" });
  expect(result.candidates[0]).toMatchObject({
    quote: { estimatedAmountOut: f.basic.estimatedAmountOut },
    fees: [
      { token: f.input.tokenIn, decimals: 18n, amount: 3_000_000_000_000n },
      { token: intermediate, decimals: 6n, amount: 3000n },
    ],
  });
});

test.for([false, true])(
  "CL failure preserves cause and required=%s controls best selection",
  async (required) => {
    const f = fixture(),
      cause = new api.SwapError("BoundExceeded", "tick budget exhausted");
    f.clReader.quote.mockRejectedValue(cause);
    const result = await f.reader.quote({
      ...f.input,
      candidates: [f.input.candidates[0]!, { ...f.input.candidates[1]!, required }],
    });
    expect(result.state).toBe(required ? "incomplete" : "partial");
    expect(result.best).toBe(required ? null : "basic");
    expect(result.coverage.requiredFailures).toBe(required ? 1 : 0);
    expect(result.candidates[1]).toMatchObject({
      status: "failed",
      issue: { code: "QuoteUnavailable", cause },
    });
  },
);

test("unconfigured families remain visible and all optional failures yield unavailable", async () => {
  const f = fixture(),
    reader = api.createSwapQuoteReader({ networkId: "mezo-mainnet", transport: f.transport });
  const result = await reader.quote({
    ...f.input,
    candidates: f.input.candidates.map((c) => ({ ...c, required: false })),
  });
  expect(result).toMatchObject({
    state: "unavailable",
    best: null,
    ranked: [],
    coverage: { attempted: 0, failed: 2 },
  });
  expect(
    result.candidates.every((c) => c.status === "failed" && c.issue.code === "ReaderUnavailable"),
  ).toBe(true);
});

test("application cancellation aborts the set without starting later candidates", async () => {
  const f = fixture(),
    cause = new DOMException("application cancelled", "AbortError");
  f.basicReader.quote.mockRejectedValue(cause);
  await expect(f.reader.quote(f.input)).rejects.toBe(cause);
  expect(f.clReader.quote).not.toHaveBeenCalled();
});

test.for(["all-quotes", "writer-compatible"] as const)(
  "eligibility %s explicitly controls quote-only candidate ranking",
  async (eligibility) => {
    const f = fixture();
    f.clReader.quote.mockResolvedValue({ ...f.cl, writeCompatible: false });
    const result = await f.reader.quote({ ...f.input, eligibility });
    expect(result.best).toBe(eligibility === "all-quotes" ? "cl" : "basic");
    expect(result.candidates[1]?.status).toBe(
      eligibility === "all-quotes" ? "quoted" : "ineligible",
    );
  },
);

test("a required ineligible quote prevents selection but retains the quote", async () => {
  const f = fixture();
  f.basicReader.quote.mockResolvedValue({ ...f.basic, writeCompatible: false });
  const result = await f.reader.quote({ ...f.input, eligibility: "writer-compatible" });
  expect(result).toMatchObject({
    state: "incomplete",
    best: null,
    coverage: { quoted: 2, eligible: 1, requiredFailures: 1 },
  });
  expect(result.candidates[0]?.status).toBe("ineligible");
});

test.for([
  { label: "zero output", patch: { estimatedAmountOut: 0n } },
  { label: "truncated amounts", patch: { amounts: [1n] } },
  { label: "missing provider", patch: { providerId: "" } },
  { label: "different timestamp", patch: { timestamp: 999n } },
] as const)("malformed quote $label cannot enter ranking", async ({ patch }) => {
  const f = fixture();
  f.basicReader.quote.mockResolvedValue({ ...f.basic, ...patch });
  const result = await f.reader.quote(f.input);
  expect(result).toMatchObject({ state: "incomplete", best: null });
  expect(result.candidates[0]).toMatchObject({ status: "failed", issue: { code: "InvalidQuote" } });
});

test("mismatching token decimals invalidate the complete comparison", async () => {
  const f = fixture();
  f.clReader.quote.mockResolvedValue({
    ...f.cl,
    outputToken: { ...f.cl.outputToken, decimals: 6n },
  });
  await expect(f.reader.quote(f.input)).rejects.toMatchObject({ code: "InconsistentQuote" });
});

test("CL traversal fee amounts must match the complete input/output", async () => {
  const f = fixture();
  f.clReader.quote.mockResolvedValue({
    ...f.cl,
    pools: [{ ...f.cl.pools[0]!, feeAmount: f.cl.amountIn }],
  });
  const result = await f.reader.quote(f.input);
  expect(result.candidates[1]).toMatchObject({ status: "failed", issue: { code: "InvalidQuote" } });
});

test.for(["chain", "hash", "missing", "regressed-head"] as const)(
  "final %s failure invalidates every candidate",
  async (kind) => {
    const f = fixture();
    if (kind === "chain")
      f.transport.getChainId.mockResolvedValueOnce(f.cl.coordinate.chainId).mockResolvedValue(1n);
    if (kind === "hash")
      f.transport.getBlock
        .mockResolvedValueOnce({
          number: f.cl.coordinate.blockNumber,
          hash: f.cl.coordinate.blockHash,
        })
        .mockResolvedValue({ number: f.cl.coordinate.blockNumber, hash: `0x${"cd".repeat(32)}` });
    if (kind === "missing")
      f.transport.getBlock
        .mockResolvedValueOnce({
          number: f.cl.coordinate.blockNumber,
          hash: f.cl.coordinate.blockHash,
        })
        .mockResolvedValue(null);
    if (kind === "regressed-head")
      f.transport.getBlockNumber
        .mockResolvedValueOnce(f.cl.coordinate.blockNumber)
        .mockResolvedValue(f.cl.coordinate.blockNumber - 1n);
    await expect(f.reader.quote(f.input)).rejects.toMatchObject({ code: "InconsistentQuote" });
  },
);

test.for([2n, 3n])("age %s at completion respects the inclusive maximum", async (age) => {
  const f = fixture();
  f.transport.getBlockNumber
    .mockResolvedValueOnce(f.cl.coordinate.blockNumber)
    .mockResolvedValue(f.cl.coordinate.blockNumber + age);
  if (age === 2n) expect((await f.reader.quote(f.input)).state).toBe("complete");
  else await expect(f.reader.quote(f.input)).rejects.toMatchObject({ code: "BoundExceeded" });
});

test("initial stale or future blocks fail before any candidate reads", async () => {
  const f = fixture();
  for (const offset of [-3n, 1n])
    await expect(
      f.reader.quote({ ...f.input, blockNumber: f.cl.coordinate.blockNumber + offset }),
    ).rejects.toMatchObject({ code: "BoundExceeded" });
  expect(f.basicReader.quote).not.toHaveBeenCalled();
  expect(f.clReader.quote).not.toHaveBeenCalled();
});

test("sparse candidate/hop arrays, null allowlists, duplicate IDs and mixed families fail before RPC", async () => {
  const f = fixture();
  const malformed: unknown[] = [
    new Array(1),
    [f.input.candidates[0], f.input.candidates[0]],
    [{ ...f.input.candidates[0], route: new Array(1) }],
    [{ ...f.input.candidates[0], intermediateAssets: null }],
    [{ ...f.input.candidates[0], family: "mixed" }],
    [
      {
        ...f.input.candidates[0],
        route: [{ tokenIn: f.input.tokenOut, tokenOut: f.input.tokenIn, stable: false }],
      },
    ],
    Array.from({ length: 17 }, (_, i) => ({ ...f.input.candidates[0], id: `candidate-${i}` })),
  ];
  for (const candidates of malformed)
    // Deliberately cross the runtime boundary with malformed caller input.
    await expect(
      f.reader.quote({ ...f.input, candidates } as SwapQuoteRequest),
    ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(f.transport.getChainId).not.toHaveBeenCalled();
});

test("sixteen candidates are bounded, deterministic and independently retained", async () => {
  const f = fixture(),
    result = await f.reader.quote({
      ...f.input,
      candidates: Array.from({ length: 16 }, (_, i) => ({
        ...f.input.candidates[0]!,
        id: `candidate-${i.toString().padStart(2, "0")}`,
      })),
    });
  expect(result.coverage).toMatchObject({ requested: 16, attempted: 16, eligible: 16 });
  expect(f.basicReader.quote).toHaveBeenCalledTimes(16);
  expect(result.best).toBe("candidate-00");
});

test("caller mutations during RPC cannot change the snapshotted request", async () => {
  const f = fixture(),
    candidate = { ...f.input.candidates[0]! },
    input = { ...f.input, candidates: [candidate] };
  f.transport.getChainId.mockImplementation(async () => {
    input.amountIn = 1n;
    candidate.required = false;
    return f.cl.coordinate.chainId;
  });
  const result = await f.reader.quote(input);
  expect(f.basicReader.quote).toHaveBeenCalledWith(
    expect.objectContaining({ amountIn: f.cl.amountIn }),
  );
  expect(result.candidates[0]?.required).toBe(true);
});
