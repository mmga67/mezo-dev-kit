import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.argv[2];
if (!directory)
  throw new Error("usage: node scripts/compare-explorer-build.ts <reproduction-directory>");

type JsonObject = Record<string, unknown>;

const explorer = object(
  JSON.parse(await readFile(join(directory, "explorer.json"), "utf8")) as unknown,
  "explorer capture",
);
const contractName = text(explorer.name, "explorer contract name");
const artifact = object(
  JSON.parse(
    await readFile(join(directory, "out", `${contractName}.sol`, `${contractName}.json`), "utf8"),
  ) as unknown,
  "compiler artifact",
);

const normalize = (value: string): string => value.toLowerCase().replace(/^0x/, "");
const sha256 = (hex: string): string =>
  createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const stripMetadata = (hex: string): BytecodeParts => {
  const normalized = normalize(hex);
  if (normalized.length < 4) throw new Error("bytecode is too short");
  const metadataBytes = Number.parseInt(normalized.slice(-4), 16) + 2;
  const executableEnd = normalized.length - metadataBytes * 2;
  if (executableEnd < 0) throw new Error("invalid Solidity metadata length");
  return {
    full: normalized,
    executable: normalized.slice(0, executableEnd),
    metadata: normalized.slice(executableEnd),
    metadataBytes,
  };
};

const applyImmutableReferences = (
  compiled: string,
  deployed: string,
  references: JsonObject = {},
): { bytecode: string; substitutions: number } => {
  if (compiled.length !== deployed.length) {
    throw new Error("compiled and deployed executable lengths differ");
  }
  let substituted = compiled;
  let substitutions = 0;
  for (const [label, ranges] of Object.entries(references)) {
    for (const [index, rangeValue] of array(ranges, `immutable references ${label}`).entries()) {
      const range = object(rangeValue, `immutable reference ${label}[${index}]`);
      const start = number(range.start, `immutable reference ${label}[${index}].start`) * 2;
      const end = start + number(range.length, `immutable reference ${label}[${index}].length`) * 2;
      if (start < 0 || end > compiled.length)
        throw new Error("immutable reference escapes runtime executable");
      substituted = `${substituted.slice(0, start)}${deployed.slice(start, end)}${substituted.slice(end)}`;
      substitutions += 1;
    }
  }
  return { bytecode: substituted, substitutions };
};

const artifactBytecode = object(artifact.bytecode, "artifact bytecode");
const deployedBytecode = object(artifact.deployedBytecode, "artifact deployed bytecode");
const compiledCreation = stripMetadata(text(artifactBytecode.object, "artifact creation bytecode"));
const constructorArgs = normalize(optionalText(explorer.constructor_args, "constructor arguments"));
const explorerCreationInput = normalize(
  text(explorer.creation_bytecode, "explorer creation bytecode"),
);
if (constructorArgs && !explorerCreationInput.endsWith(constructorArgs)) {
  throw new Error("explorer creation input does not end with its declared constructor arguments");
}
const explorerCreation = stripMetadata(
  constructorArgs
    ? explorerCreationInput.slice(0, explorerCreationInput.length - constructorArgs.length)
    : explorerCreationInput,
);
const compiledRuntime = stripMetadata(text(deployedBytecode.object, "artifact runtime bytecode"));
const explorerRuntime = stripMetadata(
  text(explorer.deployed_bytecode, "explorer runtime bytecode"),
);
const runtimeWithImmutables = applyImmutableReferences(
  compiledRuntime.executable,
  explorerRuntime.executable,
  object(deployedBytecode.immutableReferences, "artifact immutable references"),
);
const implementations = array(explorer.implementations, "explorer implementations");
const firstImplementation = implementations[0];
const result = {
  contractName,
  implementationAddress:
    firstImplementation === undefined
      ? null
      : text(
          object(firstImplementation, "explorer implementation").address,
          "implementation address",
        ),
  compilerVersion: text(explorer.compiler_version, "explorer compiler version"),
  explorerVerification: {
    fully: boolean(explorer.is_fully_verified, "fully verified"),
    partially: boolean(explorer.is_partially_verified, "partially verified"),
    changedBytecode: boolean(explorer.is_changed_bytecode, "changed bytecode"),
  },
  creation: {
    constructorArgsBytes: constructorArgs.length / 2,
    fullExact: compiledCreation.full === explorerCreation.full,
    executableExact: compiledCreation.executable === explorerCreation.executable,
    compiledSha256: sha256(compiledCreation.full),
    explorerSha256: sha256(explorerCreation.full),
    compiledExecutableSha256: sha256(compiledCreation.executable),
    explorerExecutableSha256: sha256(explorerCreation.executable),
    compiledMetadataBytes: compiledCreation.metadataBytes,
    explorerMetadataBytes: explorerCreation.metadataBytes,
  },
  runtime: {
    fullExact: compiledRuntime.full === explorerRuntime.full,
    executableExact: runtimeWithImmutables.bytecode === explorerRuntime.executable,
    immutableSubstitutions: runtimeWithImmutables.substitutions,
    compiledSha256: sha256(compiledRuntime.full),
    explorerSha256: sha256(explorerRuntime.full),
    compiledTemplateExecutableSha256: sha256(compiledRuntime.executable),
    compiledExecutableSha256: sha256(runtimeWithImmutables.bytecode),
    explorerExecutableSha256: sha256(explorerRuntime.executable),
    compiledMetadataBytes: compiledRuntime.metadataBytes,
    explorerMetadataBytes: explorerRuntime.metadataBytes,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.creation.executableExact || !result.runtime.executableExact) process.exitCode = 1;

interface BytecodeParts {
  full: string;
  executable: string;
  metadata: string;
  metadataBytes: number;
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value as unknown[];
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function optionalText(value: unknown, label: string): string {
  return value === null || value === undefined ? "" : text(value, label);
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} must be a number`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}
