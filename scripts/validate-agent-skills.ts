import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgentSkills } from "./lib/agent-skills.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await validateAgentSkills(repoRoot);
  const contributorCount = result.catalog.skills.filter(
    (skill) => skill.audience === "contributor",
  ).length;
  const consumerCount = result.catalog.skills.filter(
    (skill) => skill.audience === "consumer",
  ).length;
  process.stdout.write(
    `Validated ${result.catalog.skills.length} portable MDK skills ` +
      `(${contributorCount} contributor, ${consumerCount} consumer).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
