import { expect, test } from "vitest";
import { parseMinimalProxyImplementation } from "../src/index.ts";
const code =
  "0x363d3d373d3d3d363d73bebebebebebebebebebebebebebebebebebebebe5af43d82803e903d91602b57fd5bf3";
test("ERC-1167 specification example extracts its implementation", () => {
  expect(parseMinimalProxyImplementation(code)).toBe("0xbebebebebebebebebebebebebebebebebebebebe");
});
test.for([
  code.slice(0, -2),
  code + "00",
  code.replace("602b", "602a"),
  "0x6000",
  "0x363d3d373d3d3d363d73",
])("nonstandard runtime rejected: %s", (value) => {
  expect(() => parseMinimalProxyImplementation(value)).toThrow(
    expect.objectContaining({ code: "InvalidProxyCode" }),
  );
});
