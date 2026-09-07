import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { display, object, objects, parseJson, values, type JsonObject } from "./lib/json.ts";

const [
  compilerOutputPath,
  sourceName,
  contractName,
  creationRpcPath,
  creationRpcId,
  runtimeRpcPath,
  runtimeRpcId,
] = process.argv.slice(2);

if (
  !compilerOutputPath ||
  !sourceName ||
  !contractName ||
  !creationRpcPath ||
  !creationRpcId ||
  !runtimeRpcPath ||
  !runtimeRpcId
) {
  throw new Error(
    "usage: node scripts/compare-standard-json-build.ts " +
      "<compiler-output> <source-name> <contract-name> " +
      "<creation-rpc-json> <creation-response-id> <runtime-rpc-json> <runtime-response-id>",
  );
}

const compilerOutput = await loadJson(compilerOutputPath);
const contracts = object(compilerOutput.contracts, "compiler contracts");
const sourceContracts = object(contracts[sourceName], `compiler contracts for ${sourceName}`);
const artifact = object(
  sourceContracts[contractName],
  `compiler artifact ${sourceName}:${contractName}`,
);

const creationResponse = findRpcResponse(await loadJson(creationRpcPath), creationRpcId);
const runtimeResponse = findRpcResponse(await loadJson(runtimeRpcPath), runtimeRpcId);
const creationInput = normalize(object(creationResponse.result, "creation transaction").input);
const deployedRuntime = normalize(runtimeResponse.result);
const evm = object(artifact.evm, "compiler EVM output");
const bytecode = object(evm.bytecode, "compiler creation bytecode");
const deployedBytecode = object(evm.deployedBytecode, "compiler deployed bytecode");
const compiledCreation = normalize(bytecode.object);
const compiledRuntime = normalize(deployedBytecode.object);
if (!creationInput || !deployedRuntime || !compiledCreation || !compiledRuntime) {
  throw new Error("compiler or RPC bytecode is missing");
}
if (!creationInput.startsWith(compiledCreation)) {
  throw new Error("deployment input does not begin with the compiled creation bytecode");
}

const constructorArguments = creationInput.slice(compiledCreation.length);
const creation = compareBytecode(compiledCreation, creationInput.slice(0, compiledCreation.length));
const runtime = compareRuntime(
  compiledRuntime,
  deployedRuntime,
  object(deployedBytecode.immutableReferences, "immutable references"),
);
const result = {
  sourceName,
  contractName,
  abiEntries: values(artifact.abi, "artifact ABI").length,
  creation: {
    ...creation,
    constructorArgumentsBytes: constructorArguments.length / 2,
    deploymentInputSha256: sha256Hex(creationInput),
  },
  runtime,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!creation.executableExact || !runtime.executableExact) process.exitCode = 1;

async function loadJson(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}

function findRpcResponse(document: unknown, id: string): JsonObject {
  const responses = Array.isArray(document)
    ? objects(document, "RPC responses")
    : [object(document, "RPC response")];
  const response = responses.find((candidate) => display(candidate.id, "RPC response ID") === id);
  if (!response) throw new Error(`RPC response ${id} is missing`);
  if (response.error)
    throw new Error(`RPC response ${id} failed: ${JSON.stringify(response.error)}`);
  return response;
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/^0x/, "") : "";
}

function sha256Hex(value: string): string {
  return createHash("sha256")
    .update(Buffer.from(normalize(value), "hex"))
    .digest("hex");
}

function stripMetadata(value: string): BytecodeParts {
  const normalized = normalize(value);
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
}

function compareBytecode(compiledValue: string, deployedValue: string): BytecodeComparison {
  const compiled = stripMetadata(compiledValue);
  const deployed = stripMetadata(deployedValue);
  return {
    fullExact: compiled.full === deployed.full,
    executableExact: compiled.executable === deployed.executable,
    compiledSha256: sha256Hex(compiled.full),
    deployedSha256: sha256Hex(deployed.full),
    compiledExecutableSha256: sha256Hex(compiled.executable),
    deployedExecutableSha256: sha256Hex(deployed.executable),
    compiledMetadataBytes: compiled.metadataBytes,
    deployedMetadataBytes: deployed.metadataBytes,
  };
}

function compareRuntime(
  compiledValue: string,
  deployedValue: string,
  immutableReferences: JsonObject = {},
): RuntimeComparison {
  const compiled = stripMetadata(compiledValue);
  const deployed = stripMetadata(deployedValue);
  if (compiled.executable.length !== deployed.executable.length) {
    throw new Error("compiled and deployed runtime executable lengths differ");
  }

  let compiledWithImmutables = compiled.executable;
  let immutableSubstitutions = 0;
  for (const [label, ranges] of Object.entries(immutableReferences)) {
    for (const range of objects(ranges, `immutable references ${label}`)) {
      const start = Number(range.start) * 2;
      const end = start + Number(range.length) * 2;
      if (start < 0 || end > compiled.executable.length) {
        throw new Error("immutable reference escapes the runtime executable");
      }
      compiledWithImmutables =
        compiledWithImmutables.slice(0, start) +
        deployed.executable.slice(start, end) +
        compiledWithImmutables.slice(end);
      immutableSubstitutions += 1;
    }
  }

  return {
    fullExact: compiled.full === deployed.full,
    executableExact: compiledWithImmutables === deployed.executable,
    immutableSubstitutions,
    compiledSha256: sha256Hex(compiled.full),
    deployedSha256: sha256Hex(deployed.full),
    compiledTemplateExecutableSha256: sha256Hex(compiled.executable),
    compiledExecutableSha256: sha256Hex(compiledWithImmutables),
    deployedExecutableSha256: sha256Hex(deployed.executable),
    compiledMetadataBytes: compiled.metadataBytes,
    deployedMetadataBytes: deployed.metadataBytes,
  };
}

interface BytecodeParts {
  full: string;
  executable: string;
  metadata: string;
  metadataBytes: number;
}

interface BytecodeComparison {
  fullExact: boolean;
  executableExact: boolean;
  compiledSha256: string;
  deployedSha256: string;
  compiledExecutableSha256: string;
  deployedExecutableSha256: string;
  compiledMetadataBytes: number;
  deployedMetadataBytes: number;
}

interface RuntimeComparison extends BytecodeComparison {
  immutableSubstitutions: number;
  compiledTemplateExecutableSha256: string;
}
