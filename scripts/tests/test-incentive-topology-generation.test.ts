import { expect, test } from "vitest";
import {
  topologyGenerationMatches,
  recordedGenerationMatches,
} from "../lib/incentive-topology-generation.ts";

const restored = {
  validity: { currentCodeFrom: { blockNumber: 200 }, effectiveUntilExclusive: null },
  proxy: {
    currentImplementationAddress: "implementation-a",
    implementationHistory: [
      {
        implementationAddress: "implementation-a",
        effectiveFrom: { blockNumber: 100 },
        effectiveUntilExclusive: { blockNumber: 200 },
      },
      {
        implementationAddress: "migration-b",
        effectiveFrom: { blockNumber: 200 },
        effectiveUntilExclusive: { blockNumber: 200 },
      },
      {
        implementationAddress: "implementation-a",
        effectiveFrom: { blockNumber: 200 },
        effectiveUntilExclusive: null,
      },
    ],
  },
};

test("an earlier snapshot uses its recorded interval after an implementation is restored", () => {
  expect(topologyGenerationMatches(restored, 150, "implementation-a")).toBe(true);
  expect(topologyGenerationMatches(restored, 200, "implementation-a")).toBe(true);
  expect(topologyGenerationMatches(restored, 250, "implementation-a")).toBe(true);
  expect(topologyGenerationMatches(restored, 99, "implementation-a")).toBe(false);
});

test("a block-final snapshot never admits a temporary or incompatible implementation", () => {
  expect(topologyGenerationMatches(restored, 200, "migration-b")).toBe(false);
  const different = structuredClone(restored);
  different.proxy.implementationHistory[0]!.implementationAddress = "older-c";
  expect(topologyGenerationMatches(different, 150, "implementation-a")).toBe(false);
  expect(topologyGenerationMatches(different, 150, "older-c")).toBe(false);
  expect(topologyGenerationMatches(restored, 150, null)).toBe(false);
});

test("gaps, overlapping intervals and absent history cannot establish a snapshot", () => {
  const gap = structuredClone(restored);
  gap.proxy.implementationHistory[0]!.effectiveUntilExclusive = { blockNumber: 140 };
  expect(topologyGenerationMatches(gap, 150, "implementation-a")).toBe(false);
  const overlap = structuredClone(restored);
  overlap.proxy.implementationHistory.push({ ...overlap.proxy.implementationHistory[0]! });
  expect(topologyGenerationMatches(overlap, 150, "implementation-a")).toBe(false);
  const missing = structuredClone(restored);
  missing.proxy.implementationHistory = [];
  expect(topologyGenerationMatches(missing, 250, "implementation-a")).toBe(false);
});

test("closed deployments, malformed coordinates and proxy/direct mismatches stay rejected", () => {
  const closed = {
    ...restored,
    validity: { ...restored.validity, effectiveUntilExclusive: { blockNumber: 300 } },
  };
  expect(topologyGenerationMatches(closed, 250, "implementation-a")).toBe(false);
  for (const block of [-1, 150.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
    expect(topologyGenerationMatches(restored, block, "implementation-a")).toBe(false);
  const direct = { ...restored, proxy: null };
  expect(topologyGenerationMatches(direct, 199, null)).toBe(false);
  expect(topologyGenerationMatches(direct, 200, null)).toBe(true);
  expect(topologyGenerationMatches(direct, 200, "implementation-a")).toBe(false);
});

test("historical coverage does not imply current ABI qualification", () => {
  const upgraded = structuredClone(restored);
  upgraded.proxy.implementationHistory[0]!.implementationAddress = "old-generation";
  expect(recordedGenerationMatches(upgraded, 150, "old-generation")).toBe(true);
  expect(topologyGenerationMatches(upgraded, 150, "old-generation")).toBe(false);
  expect(recordedGenerationMatches(upgraded, 200, "old-generation")).toBe(false);
  expect(recordedGenerationMatches(upgraded, 150, "implementation-a")).toBe(false);
  expect(recordedGenerationMatches(upgraded, 200, "migration-b")).toBe(false);
});
