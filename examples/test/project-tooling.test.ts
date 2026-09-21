import { test, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleDigest, parseConfig } from "@mezo-dev-kit/cli";
import type { ReferenceBundle } from "@mezo-dev-kit/cli";
import { initializeFoundationProject, inspectProject } from "../project-tooling/initialize.ts";

test("project example initializes real files in the selected directory and doctor detects subsequent drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdk-example-project-"));
  try {
    const project = join(root, "app"),
      assets = join(root, "assets");
    await mkdir(project);
    await mkdir(join(assets, "references"), { recursive: true });
    const template = "# Application instructions\n",
      guide = "Synthetic example guidance\n";
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    // A synthetic guidance-only bundle isolates command context and filesystem behavior.
    // Real bundles additionally verify their selected SDK artifacts.
    const base: Omit<ReferenceBundle, "id"> = {
      formatVersion: 1,
      source: { revision: null, inputsDigest: digest("example fixture") },
      packages: [],
      domains: ["typescript", "foundation"].map((id) => ({
        id,
        packages: [],
        resources: ["guide:example"],
      })),
      skills: [],
      starter: [],
      template: {
        path: "APP_AGENTS.md",
        digest: digest(template),
        size: Buffer.byteLength(template),
      },
      resources: [
        {
          id: "guide:example",
          title: "Example",
          searchTerms: ["example"],
          path: "references/example.md",
          digest: digest(guide),
          size: Buffer.byteLength(guide),
          sourcePath: "docs/example.md",
          sourceDigest: digest(guide),
          domains: ["typescript", "foundation"],
          requires: [],
          kind: "guide",
          moduleId: null,
          resourceId: null,
          recordIds: [],
          reviewAfter: null,
          limitations: ["Synthetic test bundle"],
        },
      ],
      exclusions: [],
      remoteBase: null,
    };
    await writeFile(
      join(assets, "bundle.json"),
      JSON.stringify({ ...base, id: bundleDigest(base) }),
    );
    await writeFile(join(assets, "APP_AGENTS.md"), template);
    await writeFile(join(assets, "references/example.md"), guide);
    await writeFile(join(project, "package.json"), JSON.stringify({ private: true }));
    await writeFile(join(project, "AGENTS.md"), "Keep the application's own instructions\n");
    expect((await initializeFoundationProject(project, assets)).exitCode).toBe(0);
    expect(
      parseConfig(JSON.parse(await readFile(join(project, "mdk.config.json"), "utf8"))),
    ).toMatchObject({ domains: ["typescript", "foundation"] });
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe(
      "Keep the application's own instructions\n",
    );
    const asOf = new Date("2026-09-15T00:00:00Z");
    expect(await inspectProject(project, asOf)).toMatchObject({
      exitCode: 0,
      data: { issues: [], cached: 1 },
    });
    await writeFile(join(project, ".mdk/reference/references/example.md"), "Changed locally\n");
    const damaged = await inspectProject(project, asOf);
    expect(damaged.exitCode).toBe(1);
    if (!damaged.data || typeof damaged.data !== "object" || !("issues" in damaged.data))
      throw new Error("Doctor did not return structured diagnostics");
    expect(damaged.data.issues).toContainEqual({
      code: "ReferenceIntegrity",
      message: "guide:example",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
