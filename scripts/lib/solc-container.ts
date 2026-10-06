import { createHash } from "node:crypto";
import { object, objects, parseJson, text } from "./json.ts";

/** Reviewed historical compiler, used only for source/build reproduction. */
export const evidenceCompiler = {
  version: "0.8.29+commit.ab55807c",
  sha256: "18d418a40dc04d17656b1b5c8a7b35cfbab8942b51f38d005d5b59e8aa6637e0",
  url: "https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.29+commit.ab55807c",
} as const;

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateCompiler(bytes: Uint8Array): void {
  if (sha256(bytes) !== evidenceCompiler.sha256)
    throw new Error("Compiler checksum differs from the reviewed official binary");
}

/** The compiler receives all source bytes through stdin, without filesystem callbacks. */
export function validateCompilerInput(input: string): void {
  const document = object(parseJson(input, "compiler input"), "compiler input");
  if (document.language !== "Solidity") throw new Error("Expected Solidity Standard JSON");
  const sources = object(document.sources, "sources");
  if (Object.keys(sources).length === 0) throw new Error("Expected embedded Solidity sources");
  for (const [path, value] of Object.entries(sources)) {
    const source = object(value, `source ${path}`);
    text(source.content, `source ${path} content`);
    if (source.urls !== undefined) throw new Error("External source URLs are not permitted");
  }
}

/** solc may exit zero even when Standard JSON contains compilation errors. */
export function validateCompilerOutput(output: string): void {
  const document = object(parseJson(output, "compiler output"), "compiler output");
  const errors = document.errors === undefined ? [] : objects(document.errors, "diagnostics");
  for (const error of errors) {
    if (error.severity !== "warning" && error.severity !== "info")
      throw new Error(`Solidity compilation failed: ${text(error.message, "diagnostic message")}`);
  }
  if (Object.keys(object(document.contracts, "compiled contracts")).length === 0)
    throw new Error("Compiler returned no contracts; request contract outputs in outputSelection");
}

export const compilerDockerfile =
  'FROM scratch\nCOPY --chmod=0555 solc /solc\nUSER 65534:65534\nENTRYPOINT ["/solc"]\n';

export function compilerRunArguments(image: string, name: string): string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(image) || !/^mdk-solc-[a-f0-9-]{36}$/.test(name))
    throw new Error("Expected immutable local image ID and unique compiler container name");
  return [
    "run",
    "--rm",
    "--interactive",
    "--name",
    name,
    "--platform=linux/amd64",
    "--network=none",
    "--read-only",
    "--user=65534:65534",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--memory=2g",
    "--memory-swap=2g",
    "--cpus=2",
    "--pids-limit=32",
    image,
  ];
}
