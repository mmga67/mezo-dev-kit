import { afterEach, expect, test } from "vitest";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildReferenceBundle } from "../src/index.ts";
import { digest } from "../src/contracts.ts";
import { showReference } from "../src/references.ts";

const repository = resolve(import.meta.dirname, "../../..");
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function write(root: string, path: string, contents: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

test("distributed references keep environment, evidence and support context and literal examples", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdk-documentation-"));
  temporary.push(root);
  const source = join(root, "source");
  const project = join(root, "consumer");
  const output = join(project, ".mdk/reference");
  const guidance = [
    "# Synthetic deployment guide",
    "",
    "## Mainnet",
    "",
    "Deployment: demo-production; amounts are integer base units (6 decimals).",
    "",
    "## Testnet",
    "",
    "Deployment: demo-testing; never substitute the mainnet deployment.",
    "",
    "> Historical observation only. Recheck current state before use.",
    "> The reader is available; transaction submission is unsupported.",
    "",
    "```ts",
    'const literal = "[Network](./networks.md#testnet)";',
    'const example = "[Excluded example](./example-only.md)";',
    "```",
    "",
    "~~~sh",
    "printf '%s' '[Network](./networks.md#testnet)'",
    "~~~",
    "",
    "Literal syntax: `[Network](./networks.md#testnet)`.",
    "",
    "[Network](./networks.md#testnet)",
    "[Raw evidence](../evidence/capture.json)",
    "",
  ].join("\n");
  const record = JSON.stringify({
    scope: { network: "synthetic-testnet", block: "42" },
    reviewAfter: "2020-02-01T00:00:00Z",
    limitations: ["Historical observation; no current availability or writer support implied."],
    records: [{ id: "demo-testing", units: "integer base units", decimals: 6 }],
  });
  const files = {
    "agents/consumer/distribution.json": JSON.stringify({
      formatVersion: 1,
      domains: [{ id: "typescript", packages: [], resources: ["guide:docs/guide.md"] }],
      sets: [],
      guides: ["docs/guide.md", "docs/networks.md", "docs/example-only.md"],
      knowledgeRoles: ["canonical-record"],
      exclusionReason: "Raw evidence is outside the synthetic consumer corpus.",
    }),
    "agents/catalog.json": JSON.stringify({ skills: [] }),
    "agents/consumer/APP_AGENTS.template.md": "# Synthetic application\n",
    "knowledge/index.json": JSON.stringify({
      resources: [{ id: "knowledge-module-catalog", path: "modules.json" }],
    }),
    "knowledge/modules.json": JSON.stringify({
      modules: [{ moduleId: "widgets", indexPath: "widgets/index.json" }],
    }),
    "knowledge/widgets/index.json": JSON.stringify({
      moduleId: "widgets",
      knowledgeVersion: "0.4",
      resources: [
        {
          id: "observations",
          role: "canonical-record",
          path: "records.json",
          recordIds: ["demo-testing"],
        },
        { id: "capture", role: "artifact", path: "capture.json" },
      ],
    }),
    "knowledge/widgets/records.json": record,
    "docs/guide.md": guidance,
    "docs/networks.md": "# Synthetic networks\n\n## Testnet\n\nUse demo-testing.\n",
    "docs/example-only.md": "# Example target\n",
  };
  for (const [path, contents] of Object.entries(files)) await write(source, path, contents);
  await mkdir(join(source, "packages"));
  await mkdir(join(source, "templates/typescript"), { recursive: true });
  // Reuse the approved toolchain metadata; lockfile interpretation performs no installation.
  for (const path of [
    "package.json",
    "pnpm-lock.yaml",
    "templates/typescript/package.template.json",
  ])
    await copyFile(join(repository, path), join(source, path));

  const bundle = await buildReferenceBundle({
    sourceRoot: source,
    outputRoot: output,
    revision: null,
  });
  const shown = await showReference(project, bundle, "guide:docs/guide.md");
  const network = bundle.resources.find((resource) => resource.id === "guide:docs/networks.md");
  expect(network).toBeDefined();
  const expected = guidance
    .replace(
      "\n[Network](./networks.md#testnet)",
      `\n[Network](${network?.path.slice("references/".length)}#testnet)`,
    )
    .replace(
      "[Raw evidence](../evidence/capture.json)",
      "Raw evidence (source: `evidence/capture.json`; outside this corpus)",
    );
  expect(shown.content).toBe(expected);
  expect(shown.resource.requires).toEqual(["guide:docs/networks.md"]);
  expect(shown.resource.sourceDigest).toBe(digest(guidance));
  expect(shown.resource.digest).toBe(digest(expected));

  const observation = await showReference(project, bundle, "knowledge:widgets:observations");
  expect(observation.content).toBe(record);
  expect(observation.resource.reviewAfter).toBe("2020-02-01T00:00:00Z");
  expect(observation.resource.limitations).toEqual([
    "Historical observation; no current availability or writer support implied.",
  ]);
  expect(bundle.exclusions).toContainEqual({
    id: "knowledge:widgets:capture",
    sourcePath: "knowledge/widgets/capture.json",
    reason: "artifact: Raw evidence is outside the synthetic consumer corpus.",
  });
  expect(await readFile(join(output, shown.resource.path), "utf8")).toBe(shown.content);
});
