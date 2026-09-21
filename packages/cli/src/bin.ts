#!/usr/bin/env node
import { runCommand } from "./command.ts";
import { CliError } from "./errors.ts";
import { jsonText, record } from "./contracts.ts";

try {
  const result = await runCommand(process.argv.slice(2), { cwd: process.cwd() });
  const json = process.argv.includes("--json");
  if (!json && typeof result.data === "string") process.stdout.write(result.data);
  else if (
    !json &&
    typeof result.data === "object" &&
    result.data !== null &&
    "content" in result.data
  ) {
    const data = record(result.data, "reference result");
    process.stdout.write(
      `${jsonText({ resource: data.resource, path: data.path })}\n${String(data.content)}`,
    );
  } else process.stdout.write(jsonText({ ok: result.exitCode === 0, data: result.data }));
  process.exitCode = result.exitCode;
} catch (error) {
  const code = error instanceof CliError ? error.code : "Unavailable";
  const message =
    error instanceof CliError
      ? error.message
      : "Local operation failed; inspect project paths, permissions, and installed artifacts";
  process.stderr.write(jsonText({ ok: false, error: { code, message } }));
  process.exitCode = code === "InvalidInput" ? 2 : 1;
}
