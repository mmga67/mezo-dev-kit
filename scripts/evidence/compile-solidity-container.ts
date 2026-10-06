import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  compilerDockerfile,
  compilerRunArguments,
  evidenceCompiler,
  sha256,
  validateCompiler,
  validateCompilerInput,
  validateCompilerOutput,
} from "../lib/solc-container.ts";

async function docker(args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    let inputError: Error | undefined;
    const child = execFile(
      "docker",
      [...args],
      {
        timeout: 600_000,
        maxBuffer: 64 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error || inputError)
          reject(
            new Error(
              `Docker command failed: ${stderr || (error?.message ?? inputError?.message)}`,
            ),
          );
        else resolveOutput(stdout);
      },
    );
    child.stdin?.on("error", (error: Error) => {
      if (input !== undefined) inputError = error;
    });
    child.stdin?.end(input);
  });
}

async function main(): Promise<void> {
  const [binaryPath, inputPath, outputDirectory, ...extra] = process.argv.slice(2);
  if (!binaryPath || !inputPath || !outputDirectory || extra.length)
    throw new Error(
      "Usage: node scripts/evidence/compile-solidity-container.ts <solc-binary> <input.json> <new-output-directory>",
    );
  const binary = await readFile(resolve(binaryPath));
  validateCompiler(binary);
  const input = await readFile(resolve(inputPath), "utf8");
  validateCompilerInput(input);
  // mkdir without recursive deliberately refuses any existing output directory.
  await mkdir(resolve(outputDirectory));
  const output = (name: string) => resolve(outputDirectory, name);
  const directory = await mkdtemp(join(tmpdir(), "mdk-solc-image-"));
  const name = `mdk-solc-${randomUUID()}`;
  const failures: unknown[] = [];
  const cancellation = new AbortController();
  const interrupt = () => {
    cancellation.abort(new Error("Compiler run interrupted"));
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    await writeFile(join(directory, "solc"), binary);
    await writeFile(join(directory, "Dockerfile"), compilerDockerfile);
    const serverVersion = (await docker(["version", "--format", "{{.Server.Version}}"])).trim();
    await docker([
      "build",
      "--network=none",
      "--platform=linux/amd64",
      "--iidfile",
      join(directory, "image.id"),
      directory,
    ]);
    const image = (await readFile(join(directory, "image.id"), "utf8")).trim();
    const args = compilerRunArguments(image, name);
    cancellation.signal.throwIfAborted();
    const version = (await docker([...args, "--version"])).trim();
    if (!version.endsWith(`Version: ${evidenceCompiler.version}.Linux.g++`))
      throw new Error("Container compiler reports an unexpected version");
    cancellation.signal.throwIfAborted();
    const compiled = await docker([...args, "--standard-json"], input);
    await writeFile(output("input.json"), input, { flag: "wx" });
    await writeFile(output("output.json"), compiled, { flag: "wx" });
    let disposition = "compiled";
    try {
      validateCompilerOutput(compiled);
    } catch (error) {
      disposition = "compilation-failed";
      failures.push(error);
    }
    await writeFile(
      output("receipt.json"),
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          disposition,
          compiler: evidenceCompiler,
          reportedVersion: version,
          image,
          dockerServer: serverVersion,
          dockerfileSha256: sha256(compilerDockerfile),
          inputSha256: sha256(input),
          outputSha256: sha256(compiled),
          runtimeArguments: [...args, "--standard-json"],
          scope:
            "Compiler reproduction only; does not establish deployed identity or contract security",
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    cancellation.signal.throwIfAborted();
  } catch (error) {
    failures.push(error);
  }
  try {
    const existing = (
      await docker([
        "container",
        "ls",
        "--all",
        "--filter",
        `name=^/${name}$`,
        "--format",
        "{{.Names}}",
      ])
    ).trim();
    if (existing === name) await docker(["rm", "--force", name]);
    else if (existing) throw new Error("Unexpected compiler container cleanup target");
  } catch (error) {
    failures.push(error);
  }
  await rm(directory, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (failures.length) throw new AggregateError(failures, failures.map(String).join("\n"));
  process.stdout.write(`${output("receipt.json")}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
