import { CliError } from "./errors.ts";
import { record, arrayValue, jsonText } from "./contracts.ts";
import type { CommandResult } from "./command.ts";

export function formatError(error: unknown): string {
  if (!(error instanceof CliError))
    return "Local operation failed. Inspect project paths, permissions, and installed artifacts.";
  const advice: Record<CliError["code"], string> = {
    InvalidInput: "Check the input or run mdk --help.",
    Incompatible: "Install a matching private CLI and SDK artifact set before retrying.",
    Conflict: "Keep your local edits. Review the conflicting files before retrying.",
    Unavailable: "Check the named file, tool, or connection and retry the failed step.",
    Integrity: "Restore the affected file from your trusted, matching artifact set.",
    RecoveryRequired: "Wait for the owning process to exit, then review mdk recover --dry-run.",
  };
  return `${error.message}\n${advice[error.code]}`;
}

/** Human output is separate from the unchanged structured command results. */
export function formatResult(args: readonly string[], result: CommandResult): string {
  if (typeof result.data === "string") return result.data;
  const data = record(result.data, "command result");
  if (args[0] === "sets" || args[0] === "skills")
    return arrayValue(data[args[0]], "catalog")
      .map((value) => {
        const item = record(value, "catalog entry");
        return `${String(item.id ?? item.name)}${item.selected ? " [selected]" : ""}${typeof item.title === "string" ? ` — ${item.title}` : ""}${typeof item.description === "string" ? `\n  ${item.description}` : ""}`;
      })
      .join("\n");
  if (args[0] === "add")
    return [
      `${data.dryRun ? "Plan" : "Ready"}: ${String(data.selection)}`,
      `Packages to install: ${arrayValue(data.packages, "packages").join(", ") || "none"}`,
      `Skills for this selection: ${arrayValue(data.skills, "skills").join(", ")}`,
      `${arrayValue(data.changed, "changes").length} file change(s). Application source, existing AGENTS.md and memory stay application-owned.`,
      ...(data.dryRun && arrayValue(data.packages, "packages").length
        ? [
            "Dependency installation may update package.json, pnpm-workspace.yaml and pnpm-lock.yaml. Partial installation is retained; retry the same addition to finish.",
          ]
        : data.dryRun
          ? []
          : [
              "Packages and guidance verified. Run your application's checks before using the new capability.",
            ]),
    ].join("\n");
  if (args[0] === "memory") {
    if (Array.isArray(data.entries))
      return data.entries.length
        ? data.entries
            .map((value: unknown) => {
              const entry = record(value, "memory result");
              return `${String(entry.id)} — ${String(entry.title)} [${String(entry.status)}]`;
            })
            .join("\n")
        : "No matching project memories.";
    if (data.entry) {
      const entry = record(data.entry, "memory entry");
      return `${String(entry.title)}\n${String(entry.summary)}\nSources: ${arrayValue(entry.sources, "sources").join(", ")}\n${String(entry.status)} · ${String(entry.updated)}`;
    }
    if (data.valid)
      return `✓ ${String(data.entries)} memory entries validated in ${String(data.scope)} scope.\n${String(data.note)}`;
    return `${data.dryRun ? "Planned memory save" : "Memory saved"}: ${String(data.path)}`;
  }
  if (args[0] === "doctor") {
    const issues = arrayValue(data.issues, "issues"),
      warnings = arrayValue(data.warnings, "warnings");
    return [
      issues.length
        ? `Setup needs attention (${issues.length} issue(s)).`
        : "✓ Setup checks passed.",
      ...issues.map((value) => {
        const issue = record(value, "issue");
        return `  ${String(issue.code)}: ${String(issue.message)}`;
      }),
      `${String(data.cached)} of ${String(data.total)} references cached.`,
      ...(warnings.length
        ? [
            `${warnings.length} reference(s) have review dates that need attention; run mdk doctor --json for details.`,
          ]
        : []),
      String(data.note),
    ].join("\n");
  }
  if (typeof data.content === "string") return `${String(data.path)}\n\n${data.content}`;
  if (Array.isArray(data.resources))
    return data.resources.length
      ? data.resources
          .map((value: unknown) => {
            const item = record(value, "resource");
            return `${String(item.id)} — ${String(item.title)} [${String(item.availability)}]`;
          })
          .join("\n")
      : "No matching references.";
  if (Array.isArray(data.changed))
    return [
      data.dryRun ? "Planned file changes:" : "Guidance synchronized:",
      ...data.changed.map((path: unknown) => `  ${String(path)}`),
      ...(data.changed.length ? [] : ["  No file changes needed."]),
      ...(typeof data.routing === "string"
        ? [`\nOptional routing to add to your existing AGENTS.md:\n${data.routing}`]
        : []),
    ].join("\n");
  if (typeof data.complete === "boolean")
    return `Reference cache ${data.complete ? "ready" : "incomplete"}.\n${jsonText(data)}`;
  return jsonText(data);
}
