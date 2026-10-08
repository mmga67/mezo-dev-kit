import { expect, test } from "vitest";
import formulas from "../../knowledge/protocols/incentives/fixtures/formulas.json" with { type: "json" };
import allocations from "../../knowledge/protocols/incentives/fixtures/validator-allocation.json" with { type: "json" };
import evidence from "../../knowledge/protocols/incentives/evidence/validator-allocation-mainnet-2026-08-24.json" with { type: "json" };
import {
  validateIncentiveFormulaFixtures,
  validateValidatorAllocationFixtures,
} from "../lib/incentive-formula-validation.ts";

const notification = evidence.representativeRewardNotification;

test("retained canonical formula and allocation fixtures pass independent validation", () => {
  expect(() => {
    validateIncentiveFormulaFixtures(formulas);
  }).not.toThrow();
  expect(() => {
    validateValidatorAllocationFixtures(allocations, notification);
  }).not.toThrow();
});

test("a changed rounding expectation names its resource and fixture", () => {
  const changed = structuredClone(formulas);
  const fixture = changed.records.find(({ id }) => id === "unlock-rounds-down");
  if (!fixture) throw new Error("retained fixture missing");
  fixture.expected = "1209601";
  expect(() => {
    validateIncentiveFormulaFixtures(changed);
  }).toThrow(/incentives-formula-fixtures: unlock-rounds-down/);
});

test("unknown formula IDs fail rather than escaping fixture coverage", () => {
  const changed = structuredClone(formulas);
  const fixture = changed.records[0];
  if (!fixture) throw new Error("retained fixture missing");
  fixture.formulaId = "unrecognized-formula";
  expect(() => {
    validateIncentiveFormulaFixtures(changed);
  }).toThrow(
    /incentives-formula-fixtures: unknown incentives fixture formula unrecognized-formula/,
  );
});

test("allocation floor dust remains part of the validation contract", () => {
  const changed = structuredClone(allocations);
  const fixture = changed.records.find(({ id }) => id === "validator-vote-floor-dust");
  if (!fixture) throw new Error("retained fixture missing");
  fixture.expected.allocationFloorDustRaw = "0";
  expect(() => {
    validateValidatorAllocationFixtures(changed, notification);
  }).toThrow(
    /incentives-validator-allocation-fixtures: validator-vote-floor-dust vote dust differs/,
  );
});

test("pinned notification fixtures must agree with injected settled evidence", () => {
  expect(() => {
    validateValidatorAllocationFixtures(allocations, { shareSumRaw: "0", floorDustRaw: "0" });
  }).toThrow(/pinned evidence differs/);
});
