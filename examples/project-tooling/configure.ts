import { parseConfig } from "@mezo-dev-kit/cli";
import type { ProjectConfig } from "@mezo-dev-kit/cli";

/** Validate parsed project JSON before using it to select consumer guidance. */
export function configureProject(value: unknown): ProjectConfig {
  // The current public parser checks shape, version, paths and duplicate identities.
  // Domain availability must also be checked against the chosen bundle during project setup.
  return parseConfig(value);
}

/** A concrete configuration value for the foundation domain; this function performs no filesystem work. */
export const foundationConfig = configureProject({
  formatVersion: 1,
  domains: ["foundation"],
  skillsDirectory: ".agents/skills",
  references: { mode: "selected" },
});
