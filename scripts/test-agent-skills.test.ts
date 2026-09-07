import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  materializeAgentSkills,
  validateAgentSkills,
  validateSkillDirectory,
  type SkillAudience,
} from "./lib/agent-skills.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function snapshot(directory: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function visit(current: string): Promise<void> {
    for (const item of await readdir(current, { withFileTypes: true })) {
      const itemPath = join(current, item.name);
      if (item.isDirectory()) {
        await visit(itemPath);
      } else {
        files.set(relative(directory, itemPath), await readFile(itemPath, "base64"));
      }
    }
  }
  await visit(directory);
  return files;
}

async function writeFixtureSkill(
  fixtureRoot: string,
  sourcePath: string,
  frontmatterName: string,
  extraFrontmatter = "",
): Promise<void> {
  const directory = join(fixtureRoot, sourcePath);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    [
      "---",
      `name: ${frontmatterName}`,
      "description: Fixture skill used by the validator test.",
      extraFrontmatter,
      "---",
      "",
      "# Fixture",
      "",
      "Follow the fixture procedure.",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    "utf8",
  );
}

async function writeFixtureCatalog(
  fixtureRoot: string,
  skills: {
    name: string;
    audience: SkillAudience;
    path: string;
    domains?: string[];
  }[],
): Promise<void> {
  await mkdir(join(fixtureRoot, "agents"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "agents/catalog.json"),
    `${JSON.stringify(
      {
        formatVersion: 1,
        profile: "portable-agent-skills-v1",
        skills: skills.map((skill) => ({
          ...skill,
          domains: skill.domains ?? ["fixture"],
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

await test("the maintained catalog validates", async () => {
  const result = await validateAgentSkills(repoRoot);
  assert.equal(result.catalog.skills.length, 22);
  assert.equal(
    result.catalog.skills.filter((skill) => skill.audience === "contributor").length,
    21,
  );
  assert.equal(result.catalog.skills.filter((skill) => skill.audience === "consumer").length, 1);
});

await test("skills materialize unchanged with strict audience separation", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "mdk-agent-skills-"));
  try {
    const validated = await validateAgentSkills(repoRoot);
    for (const audience of ["contributor", "consumer"] as const) {
      const target = join(temporaryRoot, audience);
      const selected = await materializeAgentSkills({
        repoRoot,
        outputRoot: target,
        audience,
      });
      const expectedNames = validated.catalog.skills
        .filter((skill) => skill.audience === audience)
        .map((skill) => skill.name)
        .sort();
      assert.deepEqual((await readdir(target)).sort(), expectedNames);

      for (const entry of selected) {
        const source = resolve(repoRoot, entry.path);
        const materialized = join(target, entry.name);
        assert.deepEqual(await snapshot(materialized), await snapshot(source));
        await validateSkillDirectory(materialized, entry.name);
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

await test("catalog validation rejects identity, metadata, coverage, and path failures", async (t) => {
  await t.test("duplicate identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdk-agent-skills-duplicate-"));
    try {
      await writeFixtureSkill(root, "agents/skills/mdk-fixture", "mdk-fixture");
      await writeFixtureCatalog(root, [
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "agents/skills/mdk-fixture",
        },
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "agents/skills/mdk-fixture",
        },
      ]);
      await assert.rejects(validateAgentSkills(root), /duplicate name/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("directory and frontmatter drift", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdk-agent-skills-drift-"));
    try {
      await writeFixtureSkill(root, "agents/skills/mdk-fixture", "mdk-other");
      await writeFixtureCatalog(root, [
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "agents/skills/mdk-fixture",
        },
      ]);
      await assert.rejects(validateAgentSkills(root), /does not match directory/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("unsupported top-level frontmatter", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdk-agent-skills-frontmatter-"));
    try {
      await writeFixtureSkill(
        root,
        "agents/skills/mdk-fixture",
        "mdk-fixture",
        "vendor-runtime: required",
      );
      await writeFixtureCatalog(root, [
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "agents/skills/mdk-fixture",
        },
      ]);
      await assert.rejects(validateAgentSkills(root), /unsupported top-level frontmatter/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("uncataloged skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdk-agent-skills-coverage-"));
    try {
      await writeFixtureSkill(root, "agents/skills/mdk-fixture", "mdk-fixture");
      await writeFixtureSkill(root, "agents/skills/mdk-unlisted", "mdk-unlisted");
      await writeFixtureCatalog(root, [
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "agents/skills/mdk-fixture",
        },
      ]);
      await assert.rejects(validateAgentSkills(root), /uncataloged skill/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await t.test("repository path escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdk-agent-skills-path-"));
    try {
      await writeFixtureCatalog(root, [
        {
          name: "mdk-fixture",
          audience: "contributor",
          path: "../mdk-fixture",
        },
      ]);
      await assert.rejects(validateAgentSkills(root), /Catalog path.*must be/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
