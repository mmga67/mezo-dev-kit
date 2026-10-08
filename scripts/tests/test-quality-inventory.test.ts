import { expect, test } from "vitest";
import { validateGeneratorSelection, validateTestSelections } from "../lib/quality-inventory.ts";

test("new tests cannot disappear between the default, browser and Node runners", () => {
  expect(
    validateTestSelections(["a.test.ts", "browser.test.ts", "node.test.ts"], {
      quality: ["a.test.ts"],
      browser: ["browser.test.ts"],
      node: ["node.test.ts"],
    }),
  ).toEqual([]);
  expect(validateTestSelections(["new.test.ts"], { quality: [] })).toEqual([
    expect.stringContaining("new.test.ts: select its runner"),
  ]);
});
test("stale and overlapping runner selections fail", () => {
  expect(
    validateTestSelections(["a.test.ts"], {
      quality: ["a.test.ts", "missing.test.ts"],
      browser: ["a.test.ts"],
    }),
  ).toEqual([
    "a.test.ts: selected by both quality and browser",
    "quality: selected test is absent: missing.test.ts",
  ]);
});
test("runtime projections need drift checks; human references keep their separate scope", () => {
  const files = [
    "scripts/generate/generate-new-package.ts",
    "scripts/generate/generate-new-reference.ts",
  ];
  expect(
    validateGeneratorSelection(files, "node scripts/generate/generate-new-package.ts --check"),
  ).toEqual([]);
  expect(
    validateGeneratorSelection(files, "node scripts/generate/generate-new-package.ts"),
  ).toEqual([expect.stringContaining("missing --check registration")]);
});
test("deleted generators and duplicate drift invocations fail", () => {
  expect(
    validateGeneratorSelection([], "node scripts/generate/generate-old-package.ts --check"),
  ).toEqual([expect.stringContaining("absent generator")]);
  const call = "node scripts/generate/generate-new-package.ts --check";
  expect(
    validateGeneratorSelection(["scripts/generate/generate-new-package.ts"], `${call} && ${call}`),
  ).toEqual([expect.stringContaining("duplicate")]);
});
