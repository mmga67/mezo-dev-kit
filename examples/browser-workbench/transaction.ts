import type { ExecutionObservation } from "@mezo-dev-kit/core";
import { parseUnitsExact } from "@mezo-dev-kit/evm";

/** Accept actual public Core results at this adapter boundary in an integrated app. */
export function describeObservation(observation: ExecutionObservation): string {
  return `${observation.record.operationId}: ${observationLabels[observation.state]}`;
}

const observationLabels = {
  "submission-uncertain": "Submission uncertain — recover the reserved intent; do not resubmit.",
  submitted: "Submitted — a hash is not completion.",
  included: "Confirming — receipt included.",
  confirmed: "Receipt confirmed — protocol reconciliation pending.",
  "execution-reverted": "Execution reverted — retain the record.",
  reorged: "Inclusion changed — inspect the retained record.",
} satisfies Record<ExecutionObservation["state"], string>;

export const demoSteps = {
  success: ["awaiting-wallet", "submitted", "included", "confirmed", "reconciled"],
  uncertain: [
    "awaiting-wallet",
    "submission-uncertain",
    "submitted",
    "included",
    "confirmed",
    "reconciled",
  ],
  "wallet-rejected": ["awaiting-wallet", "wallet-rejected"],
  "simulation-failed": ["simulation-failed"],
  replacement: ["awaiting-wallet", "submitted", "replacement"],
  "refresh-failed": [
    "awaiting-wallet",
    "submitted",
    "included",
    "confirmed",
    "refresh-failed",
    "reconciled",
  ],
  reorg: [
    "awaiting-wallet",
    "submitted",
    "included",
    "reorged",
    "included",
    "confirmed",
    "reconciled",
  ],
  reverted: ["awaiting-wallet", "submitted", "execution-reverted"],
} as const;
export type DemoScenario = keyof typeof demoSteps;
export type DemoPhase = (typeof demoSteps)[DemoScenario][number];
export interface DemoCheckpoint {
  readonly version: 1;
  readonly scenario: DemoScenario;
  readonly step: number;
  readonly amount: bigint;
}
export function parseScenario(value: unknown): DemoScenario {
  if (typeof value !== "string" || !Object.hasOwn(demoSteps, value))
    throw new Error("Unknown demo scenario");
  return value as DemoScenario;
}
export function parseCheckpoint(value: unknown): DemoCheckpoint | null {
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("version" in value) ||
    value.version !== 1 ||
    !("scenario" in value) ||
    !("step" in value) ||
    !("amount" in value)
  )
    throw new Error("Invalid demo checkpoint");
  const scenario = parseScenario(value.scenario);
  const step = value.step;
  if (
    typeof step !== "number" ||
    !Number.isInteger(step) ||
    step < 0 ||
    step >= demoSteps[scenario].length
  )
    throw new Error("Invalid demo step");
  return { version: 1, scenario, step, amount: parseUnitsExact(value.amount, 0) };
}
export function encodeCheckpoint(value: DemoCheckpoint | null): unknown {
  return value === null ? null : { ...value, amount: value.amount.toString() };
}
export function advanceDemo(value: DemoCheckpoint): DemoCheckpoint {
  return { ...value, step: Math.min(value.step + 1, demoSteps[value.scenario].length - 1) };
}
export function demoProgress(
  value: DemoCheckpoint,
): Readonly<{ phase: DemoPhase; label: string; hash: string | null; finished: boolean }> {
  const phase = demoSteps[value.scenario][value.step];
  if (phase === undefined) throw new Error("Invalid demo step");
  const otherLabels = {
    "awaiting-wallet": "Awaiting wallet (simulated) — duplicate start disabled.",
    "wallet-rejected":
      "Wallet rejected — Core submission remains uncertain; retain the reserved intent.",
    "simulation-failed": "Simulation failed — no wallet request or submission.",
    replacement:
      "Replacement detected — inspect the replacement; the original intent is not complete.",
    "refresh-failed":
      "Receipt confirmed — follow-up read failed. Retry reconciliation, not submission.",
    reconciled: "Protocol outcome reconciled (simulated).",
  };
  const label =
    phase in observationLabels
      ? observationLabels[phase as ExecutionObservation["state"]]
      : otherLabels[phase as keyof typeof otherLabels];
  const hasHash = demoSteps[value.scenario]
    .slice(0, value.step + 1)
    .some((step) => step === "submitted");
  return {
    phase,
    label,
    hash: hasHash ? `0x${"ab".repeat(32)}` : null,
    finished: value.step === demoSteps[value.scenario].length - 1,
  };
}
