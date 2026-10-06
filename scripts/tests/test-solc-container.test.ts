import { expect, test } from "vitest";
import {
  compilerRunArguments,
  validateCompiler,
  validateCompilerInput,
  validateCompilerOutput,
} from "../lib/solc-container.ts";

test("refuses unreviewed compiler bytes before Docker execution", () => {
  expect(() => {
    validateCompiler(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]));
  }).toThrow("checksum");
});

test("accepts self-contained input but rejects filesystem/network source callbacks", () => {
  validateCompilerInput(
    JSON.stringify({ language: "Solidity", sources: { "C.sol": { content: "contract C {}" } } }),
  );
  for (const source of [
    { urls: ["https://example.invalid/C.sol"] },
    { content: "contract C {}", urls: ["file:///secret"] },
  ])
    expect(() => {
      validateCompilerInput(JSON.stringify({ language: "Solidity", sources: { "C.sol": source } }));
    }).toThrow();
  expect(() => {
    validateCompilerInput('{"language":"Solidity","sources":{}}');
  }).toThrow("sources");
});

test("fails compilation errors even when solc exits zero, preserving warning-only builds", () => {
  const contracts = { "C.sol": { C: { abi: [] } } };
  validateCompilerOutput(
    JSON.stringify({ contracts, errors: [{ severity: "warning", message: "SPDX omitted" }] }),
  );
  expect(() => {
    validateCompilerOutput(
      JSON.stringify({ contracts, errors: [{ severity: "error", message: "Parser error" }] }),
    );
  }).toThrow("Parser error");
  expect(() => {
    validateCompilerOutput('{"errors":[]}');
  }).toThrow("contracts");
  expect(() => {
    validateCompilerOutput("invalid JSON");
  }).toThrow();
});

test("compiler runs use immutable images and expose neither network nor host mounts", () => {
  const name = "mdk-solc-00000000-0000-0000-0000-000000000000";
  const args = compilerRunArguments(`sha256:${"a".repeat(64)}`, name);
  for (const arg of [
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--user=65534:65534",
    "--security-opt=no-new-privileges",
    "--memory=2g",
    "--pids-limit=32",
  ])
    expect(args).toContain(arg);
  expect(
    args.some((arg) => arg.startsWith("--mount") || arg === "--volume" || arg === "--privileged"),
  ).toBe(false);
  expect(() => compilerRunArguments("solc:latest", name)).toThrow("immutable");
  expect(() => compilerRunArguments(`sha256:${"a".repeat(64)}`, "other-container")).toThrow(
    "unique",
  );
});
