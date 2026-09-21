import { runCommand } from "@mezo-dev-kit/cli";
import type { CommandContext, CommandResult } from "@mezo-dev-kit/cli";

/** Initialize foundation/TypeScript guidance in an application whose matching SDK artifacts are installed. */
export async function initializeFoundationProject(
  projectDirectory: string,
  bundleDirectory: string,
): Promise<CommandResult> {
  // CommandContext is the CLI package's filesystem environment, not an EVM connection.
  const context: CommandContext = {
    cwd: projectDirectory,
    // For runCommand this is the generated bundle/assets directory, not the MDK source checkout.
    sourceRoot: bundleDirectory,
  };
  // This call writes selected guidance and lock/config files, preserving application-owned files.
  // Pass --dry-run when invoking runCommand to inspect the planned changes first.
  return runCommand(["init", "--domains", "typescript,foundation", "--offline"], context);
}

/** Inspect the initialized project with an explicit review date; retain exitCode and diagnostics. */
export async function inspectProject(projectDirectory: string, asOf: Date): Promise<CommandResult> {
  // The doctor reads the installed project's lock, artifacts and references. No wallet or RPC is involved.
  return runCommand(["doctor", "--offline", "--json"], { cwd: projectDirectory, now: asOf });
}
