import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { materializeAgentSkills, type SkillAudience } from "./lib/agent-skills.ts";

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const audienceValue = optionValue("--audience");
const outputValue = optionValue("--output");

if (
  (audienceValue !== "contributor" && audienceValue !== "consumer") ||
  outputValue === undefined
) {
  process.stderr.write(
    "Usage: node scripts/materialize-agent-skills.ts " +
      "--audience <contributor|consumer> --output <directory>\n",
  );
  process.exitCode = 2;
} else {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const selected = await materializeAgentSkills({
      repoRoot,
      outputRoot: resolve(outputValue),
      audience: audienceValue satisfies SkillAudience,
    });
    process.stdout.write(
      `Materialized ${selected.length} ${audienceValue} MDK skill(s) into ${resolve(outputValue)}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
