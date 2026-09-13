/** Application-owned composition example. Each invocation requires fresh second-leg consent. */
import { parseSubmissionRecord } from "@mezo-dev-kit/core";
import type { SubmissionRecord } from "@mezo-dev-kit/core";
import { parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import { validateBasicSwapRoute, validateCLSwapRoute } from "@mezo-dev-kit/swaps";
import type {
  BasicSwapBounds,
  BasicSwapQuoteInput,
  BasicSwapWriter,
  PreparedBasicSwap,
  CLSwapBounds,
  CLSwapQuoteInput,
  CLSwapWriter,
  PreparedCLSwap,
} from "@mezo-dev-kit/swaps";

export interface MixedSwapCheckpoint {
  readonly kind: "mixed-swap-first-settled";
  readonly version: 1;
  readonly firstOperationId: string;
  readonly secondOperationId: string;
  readonly account: string;
  readonly networkId: string;
  readonly transactionHash: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly intermediateToken: string;
  readonly realizedAmount: string;
}
/** The application supplies validated prepared values, its durable Core store and atomic checkpoint persistence. */
export interface MixedSwapPersistence {
  readonly loadCheckpoint: () => Promise<unknown>;
  readonly saveCheckpoint: (value: Readonly<MixedSwapCheckpoint>) => Promise<void>;
  /** Read the same durable store used by Core, including reservations without a hash. */
  readonly loadSecondSubmission: (operationId: string) => Promise<unknown>;
}
type FirstLeg =
  | Readonly<{
      family: "basic";
      writer: BasicSwapWriter;
      prepared: PreparedBasicSwap;
      record: unknown;
    }>
  | Readonly<{ family: "cl"; writer: CLSwapWriter; prepared: PreparedCLSwap; record: unknown }>;
type SecondLeg =
  | Readonly<{
      family: "basic";
      writer: BasicSwapWriter;
      quote: Omit<BasicSwapQuoteInput, "amountIn" | "blockNumber">;
      bounds: BasicSwapBounds;
    }>
  | Readonly<{
      family: "cl";
      writer: CLSwapWriter;
      quote: Omit<CLSwapQuoteInput, "amountIn" | "blockNumber">;
      bounds: CLSwapBounds;
    }>;
export type MixedSwapContinuation =
  | Readonly<{
      state: "second-submitted";
      checkpoint: MixedSwapCheckpoint;
      record: SubmissionRecord;
    }>
  | Readonly<{
      state: "ready";
      family: "basic";
      checkpoint: MixedSwapCheckpoint;
      prepared: PreparedBasicSwap;
    }>
  | Readonly<{
      state: "ready";
      family: "cl";
      checkpoint: MixedSwapCheckpoint;
      prepared: PreparedCLSwap;
    }>;
function assertContinuation(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): Record<string, unknown> {
  assertContinuation(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "invalid mixed swap checkpoint",
  );
  return value as Record<string, unknown>;
}

/** Reconcile first-leg custody again, persist its anchor, then prepare only the realized intermediate amount. Never submits. */
export async function prepareMixedSwapContinuation(input: {
  readonly first: FirstLeg;
  readonly second: SecondLeg;
  readonly secondOperationId: string;
  readonly intermediateToken: `0x${string}`;
  readonly consentToSeparateTransactions: boolean;
  readonly persistence: MixedSwapPersistence;
}): Promise<MixedSwapContinuation> {
  assertContinuation(
    input.consentToSeparateTransactions === true,
    "separate transactions require explicit consent",
  );
  const { persistence } = input;
  const first: FirstLeg =
    input.first.family === "basic"
      ? {
          ...input.first,
          prepared: structuredClone(input.first.prepared),
          record: parseSubmissionRecord(input.first.record),
        }
      : {
          ...input.first,
          prepared: structuredClone(input.first.prepared),
          record: parseSubmissionRecord(input.first.record),
        };
  const second: SecondLeg =
    input.second.family === "basic"
      ? {
          ...input.second,
          quote: structuredClone(input.second.quote),
          bounds: structuredClone(input.second.bounds),
        }
      : {
          ...input.second,
          quote: structuredClone(input.second.quote),
          bounds: structuredClone(input.second.bounds),
        };
  assertContinuation(
    (first.family === "basic" || first.family === "cl") &&
      (second.family === "basic" || second.family === "cl") &&
      first.family !== second.family,
    "choose two different supported router families",
  );
  const operationId = input.secondOperationId;
  assertContinuation(
    typeof operationId === "string" &&
      operationId.length > 0 &&
      operationId !== first.prepared.transaction.operationId,
    "retain a distinct stable second-leg operation ID",
  );
  const intermediate = parseAddress(input.intermediateToken),
    account = parseAddress(first.prepared.quote.account);
  const route =
    second.family === "basic"
      ? validateBasicSwapRoute(second.quote.route, second.quote.intermediateAssets)
      : validateCLSwapRoute(second.quote.route, second.quote.intermediateAssets);
  assertContinuation(
    parseAddress(second.quote.account) === account &&
      route[0]?.tokenIn === intermediate &&
      first.prepared.quote.route.at(-1)?.tokenOut === intermediate,
    "mixed route account or intermediate custody differs",
  );
  const settled =
    first.family === "basic"
      ? await first.writer.reconcile(first.prepared, first.record)
      : await first.writer.reconcile(first.prepared, first.record);
  if ("boundsSatisfied" in settled.outcome)
    assertContinuation(
      settled.outcome.boundsSatisfied,
      "first-leg settlement breached its policy; inspect retained funds",
    );
  const amount = parseUint(settled.outcome.amountOut);
  assertContinuation(amount > 0n, "first leg produced no intermediate funds");
  const checkpoint: Readonly<MixedSwapCheckpoint> = Object.freeze({
    kind: "mixed-swap-first-settled",
    version: 1,
    firstOperationId: settled.record.operationId,
    secondOperationId: operationId,
    account,
    networkId: settled.record.networkId,
    transactionHash: parseHash32(settled.receipt.transactionHash),
    blockNumber: parseUint(settled.receipt.blockNumber).toString(),
    blockHash: parseHash32(settled.receipt.blockHash),
    intermediateToken: intermediate,
    realizedAmount: amount.toString(),
  });
  const previous = await persistence.loadCheckpoint();
  if (previous !== null) {
    const saved = object(previous);
    assertContinuation(
      Object.entries(checkpoint).every(([key, value]) => saved[key] === value),
      "saved first-leg anchor, intent or amount changed; reobserve before proceeding",
    );
  }
  await persistence.saveCheckpoint(checkpoint);
  const submission = await persistence.loadSecondSubmission(operationId);
  if (submission !== null) {
    const record = parseSubmissionRecord(submission);
    assertContinuation(
      record.operationId === operationId &&
        record.networkId === checkpoint.networkId &&
        record.call.from === account,
      "saved second-leg submission identity differs",
    );
    return Object.freeze({ state: "second-submitted", checkpoint, record });
  }
  // The writer re-quotes current pools/balances and creates an instance-owned preparation.
  // Never use a saved estimate or the account's entire existing intermediate balance.
  if (second.family === "basic") {
    const prepared = await second.writer.prepare({
      operationId,
      quote: { ...second.quote, amountIn: amount },
      bounds: second.bounds,
    });
    return Object.freeze({ state: "ready", family: "basic", checkpoint, prepared });
  }
  const prepared = await second.writer.prepare({
    ...second.quote,
    amountIn: amount,
    operationId,
    bounds: second.bounds,
  });
  return Object.freeze({ state: "ready", family: "cl", checkpoint, prepared });
}
