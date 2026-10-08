import { normalizeTransactionHash, type TransactionHash } from "./validation.ts";
import {
  GENERATED_TRANSACTION_STATES,
  GENERATED_TRANSACTION_TRANSITIONS,
} from "./model.generated.ts";

export const TRANSACTION_STATES = Object.freeze(
  GENERATED_TRANSACTION_STATES.map((item) => Object.freeze({ ...item })),
);

export const TRANSACTION_TRANSITIONS = Object.freeze(
  GENERATED_TRANSACTION_TRANSITIONS.map((item) => Object.freeze({ ...item })),
);

export type TransactionStateId = (typeof GENERATED_TRANSACTION_STATES)[number]["id"];
export type TransactionEvent = (typeof GENERATED_TRANSACTION_TRANSITIONS)[number]["event"];

export interface LifecycleReplacement {
  readonly hash: TransactionHash;
  readonly reason: string;
  readonly successorOperationId: string;
}

export interface LifecycleHistoryItem {
  readonly from: TransactionStateId | null;
  readonly event: TransactionEvent | "created";
  readonly to: TransactionStateId;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface Lifecycle {
  readonly operationId: string;
  readonly state: TransactionStateId;
  readonly call: unknown;
  readonly approvalHash: TransactionHash | null;
  readonly actionHash: TransactionHash | null;
  readonly replacement: Readonly<LifecycleReplacement> | null;
  readonly cancellationHash: TransactionHash | null;
  readonly history: readonly LifecycleHistoryItem[];
}

const statesById = new Map(TRANSACTION_STATES.map((item) => [item.id, item]));
const transitionsByKey = new Map(
  TRANSACTION_TRANSITIONS.map((item) => [`${item.from}\0${item.event}`, item]),
);

export function createLifecycle({
  operationId,
  call = null,
}: {
  readonly operationId: string;
  readonly call?: unknown;
}): Readonly<Lifecycle> {
  if (typeof operationId !== "string" || operationId.length === 0) {
    throw new TypeError("operationId is required");
  }
  return freezeLifecycle({
    operationId,
    state: "constructed",
    call,
    approvalHash: null,
    actionHash: null,
    replacement: null,
    cancellationHash: null,
    history: [{ from: null, event: "created", to: "constructed", context: {} }],
  });
}

export function transitionLifecycle(
  lifecycle: Lifecycle,
  event: TransactionEvent,
  context: Readonly<Record<string, unknown>> = {},
): Readonly<Lifecycle> {
  assertLifecycle(lifecycle);
  const current = statesById.get(lifecycle.state);
  if (!current) throw new TypeError(`unknown lifecycle state '${lifecycle.state}'`);
  if (current.terminal) throw new Error(`terminal lifecycle '${current.id}' cannot transition`);
  const selected = transitionsByKey.get(`${current.id}\0${event}`);
  if (!selected) throw new Error(`event '${event}' is invalid from '${current.id}'`);

  let approvalHash = lifecycle.approvalHash;
  let actionHash = lifecycle.actionHash;
  let replacement = lifecycle.replacement;
  let cancellationHash = lifecycle.cancellationHash;
  if (event === "approval-required-and-submitted") {
    approvalHash = normalizeTransactionHash(context.approvalHash, "approvalHash");
  }
  if (event === "action-submitted") {
    actionHash = normalizeTransactionHash(context.actionHash, "actionHash");
  }
  if (event === "replacement-observed") {
    replacement = Object.freeze({
      hash: normalizeTransactionHash(context.replacementHash, "replacementHash"),
      reason: requiredText(context.reason, "replacement reason"),
      successorOperationId: requiredText(context.successorOperationId, "successorOperationId"),
    });
  }
  if (event === "cancellation-observed") {
    cancellationHash = normalizeTransactionHash(context.cancellationHash, "cancellationHash");
  }

  const target = statesById.get(selected.to);
  if (!target) throw new TypeError(`unknown lifecycle state '${selected.to}'`);
  if (target.actionHashRequired && !actionHash)
    throw new Error(`${target.id} requires an action hash`);
  if (target.approvalHashRequired && !approvalHash)
    throw new Error(`${target.id} requires an approval hash`);

  return freezeLifecycle({
    ...lifecycle,
    state: target.id,
    approvalHash,
    actionHash,
    replacement,
    cancellationHash,
    history: [
      ...lifecycle.history,
      { from: selected.from, event, to: selected.to, context: Object.freeze({ ...context }) },
    ],
  });
}

export function getLifecycleState(
  id: TransactionStateId,
): (typeof TRANSACTION_STATES)[number] | null {
  return statesById.get(id) ?? null;
}

export function nextLifecycleEvents(lifecycle: Lifecycle): readonly TransactionEvent[] {
  assertLifecycle(lifecycle);
  return TRANSACTION_TRANSITIONS.filter((item) => item.from === lifecycle.state).map(
    (item) => item.event,
  );
}

export function isProtocolSuccess(lifecycle: Lifecycle): boolean {
  assertLifecycle(lifecycle);
  return lifecycle.state === "reconciled";
}

function assertLifecycle(lifecycle: Lifecycle): void {
  if (!lifecycle || typeof lifecycle !== "object") throw new TypeError("lifecycle is required");
  if (!statesById.has(lifecycle.state))
    throw new TypeError(`unknown lifecycle state '${lifecycle.state}'`);
  if (!Array.isArray(lifecycle.history)) throw new TypeError("lifecycle history is required");
}

function freezeLifecycle(lifecycle: Lifecycle): Readonly<Lifecycle> {
  return Object.freeze({ ...lifecycle, history: Object.freeze(lifecycle.history) });
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
  return value;
}
