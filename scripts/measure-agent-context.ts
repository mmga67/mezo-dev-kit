import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateAgentSkills } from "./lib/agent-skills.ts";

const [root = process.cwd(), ...unexpected] = process.argv.slice(2);
if (unexpected.length > 0) throw new Error("Usage: measure-agent-context.ts [repository-root]");
const repositoryRoot = resolve(root);
const inventory = await validateAgentSkills(repositoryRoot);

function size(text: string): Readonly<{ bytes: number; characters: number }> {
  return { bytes: Buffer.byteLength(text, "utf8"), characters: text.length };
}

const instructions = await readFile(resolve(repositoryRoot, "AGENTS.md"), "utf8");
const skills = await Promise.all(
  inventory.catalog.skills.map(async (entry) => {
    const skill = inventory.skills.get(entry.name);
    if (!skill) throw new Error(`Missing validated skill: ${entry.name}`);
    const source = await readFile(resolve(repositoryRoot, entry.path, "SKILL.md"), "utf8");
    return {
      name: entry.name,
      audience: entry.audience,
      path: `${entry.path}/SKILL.md`,
      body: size(source),
      // A provider-neutral inventory, not the host's rendered discovery prompt.
      discovery: size(`${entry.name}\n${skill.description}\n`),
    };
  }),
);

process.stdout.write(
  `${JSON.stringify(
    {
      measurement: "source-size-only",
      instructions: { path: "AGENTS.md", ...size(instructions) },
      audiences: ["contributor", "consumer"].map((audience) => {
        const selected = skills.filter((skill) => skill.audience === audience);
        return {
          audience,
          count: selected.length,
          availableSkillBytes: selected.reduce((sum, skill) => sum + skill.body.bytes, 0),
          discoveryNameDescriptionBytes: selected.reduce(
            (sum, skill) => sum + skill.discovery.bytes,
            0,
          ),
        };
      }),
      skills,
      limitations:
        "Canonical source sizes; excludes host rendering, global instructions, tools, actual retrieval and token/cache usage.",
    },
    null,
    2,
  )}\n`,
);
