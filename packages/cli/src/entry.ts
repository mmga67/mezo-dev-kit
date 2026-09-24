import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { runCommand } from "./command.ts";
import { CliError } from "./errors.ts";
import { jsonText, record } from "./contracts.ts";
import { runConsole } from "./console.ts";
import { terminalUI } from "./terminal.ts";
import { ConsoleCancelled, runPnpm } from "./console-process.ts";
import { formatError, formatResult } from "./output.ts";

export function shouldOpenConsole(args: readonly string[], interactive: boolean): boolean {
  return args[0] === "console" || (args.length === 0 && interactive);
}

export async function runTerminal(args: readonly string[], cwd: string): Promise<number> {
  const interactive =
    process.stdin.isTTY === true && process.stdout.isTTY === true && !process.env.CI;
  const json = args.includes("--json");
  try {
    if (shouldOpenConsole(args, interactive)) {
      const parsed = parseArgs({
        args: args[0] === "console" ? [...args.slice(1)] : [...args],
        strict: true,
        options: {
          project: { type: "string" },
          workspace: { type: "string" },
          artifacts: { type: "string" },
          bundle: { type: "string" },
          offline: { type: "boolean" },
          plain: { type: "boolean" },
          help: { type: "boolean" },
          "no-input": { type: "boolean" },
          json: { type: "boolean" },
        },
      });
      if (parsed.values.help) {
        process.stdout.write(
          "MDK guided console\n\nmdk console [--project <directory>] [--artifacts <manifest>] [--bundle <assets>] [--offline] [--plain]\nRepository: pnpm cli (selects the MDK workspace explicitly).\nUse --plain for numbered prompts. Console requires an interactive terminal; use mdk --help for automation commands.\n",
        );
        return 0;
      }
      if (!interactive || parsed.values["no-input"] || json)
        throw new CliError(
          "InvalidInput",
          "The console requires an interactive terminal. Use explicit commands from mdk --help with --json for automation.",
        );
      const values = parsed.values;
      await runConsole(
        {
          cwd: resolve(cwd, values.project ?? "."),
          ...(values.workspace ? { workspace: resolve(cwd, values.workspace) } : {}),
          ...(values.artifacts ? { artifacts: resolve(cwd, values.artifacts) } : {}),
          ...(values.bundle ? { sourceRoot: resolve(cwd, values.bundle) } : {}),
          offline: values.offline === true,
        },
        terminalUI(values.plain === true || process.env.TERM === "dumb"),
        runPnpm,
      );
      return 0;
    }
    const commandArgs = args;
    const result = await runCommand(commandArgs, { cwd });
    if (json) process.stdout.write(jsonText({ ok: result.exitCode === 0, data: result.data }));
    else if (
      !interactive &&
      typeof result.data === "object" &&
      result.data !== null &&
      "content" in result.data
    ) {
      const data = record(result.data, "reference result");
      process.stdout.write(
        `${jsonText({ resource: data.resource, path: data.path })}\n${String(data.content)}`,
      );
    } else if (interactive || typeof result.data === "string")
      process.stdout.write(`${formatResult(commandArgs, result)}\n`);
    else process.stdout.write(jsonText({ ok: result.exitCode === 0, data: result.data }));
    return result.exitCode;
  } catch (error) {
    if (error instanceof ConsoleCancelled) {
      process.stderr.write(`${error.message}\n`);
      return 130;
    }
    const invalidArguments =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("ERR_PARSE_ARGS_");
    const code =
      error instanceof CliError ? error.code : invalidArguments ? "InvalidInput" : "Unavailable";
    const message =
      error instanceof CliError
        ? error.message
        : invalidArguments
          ? "Invalid console arguments; run mdk console --help"
          : "Local operation failed; inspect project paths, permissions, and installed artifacts";
    process.stderr.write(
      json || !interactive
        ? jsonText({ ok: false, error: { code, message } })
        : `${invalidArguments ? message : formatError(error)}\n`,
    );
    return code === "InvalidInput" ? 2 : 1;
  }
}
