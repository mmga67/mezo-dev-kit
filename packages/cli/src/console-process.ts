import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { CliError } from "./errors.ts";

export class ConsoleCancelled extends Error {
  constructor() {
    super("Console closed. Completed work has been kept.");
    this.name = "ConsoleCancelled";
  }
}

export type RunPnpm = (cwd: string, args: readonly string[]) => Promise<void>;
export type ReadPnpm = (cwd: string, args: readonly string[]) => Promise<string>;

function invocation(args: readonly string[]): { command: string; args: string[] } {
  const entry = process.env.npm_execpath;
  const useNode = entry !== undefined && /(?:^|[/\\])pnpm\.[cm]?js$/.test(entry);
  return {
    command: useNode ? process.execPath : "pnpm",
    args: useNode ? [entry, ...args] : [...args],
  };
}

/** Bounded metadata reads; never execute project scripts or print configuration. */
export const readPnpm: ReadPnpm = async (cwd, args) => {
  const input = invocation(args);
  try {
    const result = await promisify(execFile)(input.command, input.args, {
      cwd,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout;
  } catch (cause) {
    throw new CliError(
      "Unavailable",
      "Could not read pnpm project settings. Check the pinned pnpm installation.",
      { cause },
    );
  }
};

/** Keep stdout reserved for the command's JSON result. */
export const runPnpmCommand: RunPnpm = async (cwd, args) => execute(cwd, args, true);

/** Run one explicit package-manager operation without interpreting shell text. */
export const runPnpm: RunPnpm = async (cwd, args) => {
  await execute(cwd, args, false);
};

async function execute(
  cwd: string,
  args: readonly string[],
  commandOutput: boolean,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // pnpm scripts expose their JS entrypoint, including on Windows.
    const input = invocation(args);
    const child = spawn(input.command, input.args, {
      cwd,
      stdio: commandOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: false,
    });
    if (commandOutput) {
      child.stdout?.pipe(process.stderr, { end: false });
      child.stderr?.pipe(process.stderr, { end: false });
    }
    let cancelled = false;
    const cancel = (): void => {
      cancelled = true;
      child.kill("SIGINT");
    };
    process.on("SIGINT", cancel);
    child.once("error", (cause) => {
      process.off("SIGINT", cancel);
      reject(
        new CliError(
          "Unavailable",
          "Could not start pnpm. Install the project's pinned pnpm version and retry.",
          { cause },
        ),
      );
    });
    child.once("close", (code, signal) => {
      process.off("SIGINT", cancel);
      if (cancelled || signal === "SIGINT") reject(new ConsoleCancelled());
      else if (code !== 0)
        reject(
          new CliError(
            "Unavailable",
            `pnpm ${args[0] ?? ""} failed${code === null ? "" : ` (exit ${code})`}. Review the output above; completed files are preserved.`,
          ),
        );
      else resolve();
    });
  });
}
