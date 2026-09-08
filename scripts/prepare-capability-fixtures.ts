import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const snapshots = [
  "before",
  "added",
  "removed",
  "internal-only",
  "conflict",
  "missing-build",
] as const;

/** Creates fictional packages for agent behavior exercises, never Mezo support records. */
export async function prepareCapabilityFixtures(outputRoot: string): Promise<void> {
  const root = resolve(outputRoot);
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length !== 0) throw new Error("Fixture target must be empty");
  for (const snapshot of snapshots) {
    const directory = join(root, snapshot);
    await mkdir(join(directory, "src"), { recursive: true });
    const hasPublicSummary = snapshot === "added" || snapshot === "missing-build";
    const saysPublicSummary = hasPublicSummary || snapshot === "conflict";
    const manifest = {
      name: "@mezo-dev-kit/synthetic-widgets",
      version: "0.0.0-private",
      private: true,
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
      scripts: { build: "tsc --project tsconfig.json" },
    };
    const configuration = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        erasableSyntaxOnly: true,
        declaration: true,
        rootDir: "src",
        outDir: "dist",
        types: [],
      },
      include: ["src/index.ts"],
    };
    const source = [
      'export { readWidget } from "./reader.js";',
      'export type { Widget } from "./reader.js";',
      ...(hasPublicSummary ? ['export { summarizeWidgets } from "./summary.js";'] : []),
      "",
    ].join("\n");
    await Promise.all([
      writeFile(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`),
      writeFile(join(directory, "tsconfig.json"), `${JSON.stringify(configuration, null, 2)}\n`),
      writeFile(join(directory, "src/index.ts"), source),
      writeFile(
        join(directory, "src/reader.ts"),
        "export interface Widget { readonly value: bigint; }\nexport function readWidget(): Widget { return { value: 7n }; }\n",
      ),
      writeFile(
        join(directory, "README.md"),
        [
          "# Synthetic widget package",
          "",
          "Fictional contributor exercise; no Mezo network or protocol support.",
          "Use the package export map and built entrypoint. Compile tsconfig.json",
          "with the MDK checkout's existing pinned TypeScript toolchain; no install is required.",
          "readWidget() returns a synthetic Widget with a bigint value.",
          saysPublicSummary
            ? "summarizeWidgets(widgets: readonly Widget[]): bigint is also public and returns the sum of their values."
            : "Only readWidget and its Widget type are public; summary functionality is unavailable through this entrypoint.",
          "Use only declared entrypoints in consumer examples. Inspecting source does not make it public.",
          "",
        ].join("\n"),
      ),
    ]);
    if (snapshot !== "before") {
      await writeFile(
        join(directory, "src/summary.ts"),
        'import type { Widget } from "./reader.js";\nexport function summarizeWidgets(widgets: readonly Widget[]): bigint { return widgets.reduce((sum, widget) => sum + widget.value, 0n); }\n',
      );
    }
    if (snapshot === "added") {
      await writeFile(
        join(directory, "previous-task.md"),
        "Historical observation from the before snapshot: the summary helper was unavailable. This note is supporting context, not current package authority.\n",
      );
    }
    if (snapshot === "removed") {
      await writeFile(
        join(directory, "consumer.ts"),
        'import { readWidget, summarizeWidgets } from "@mezo-dev-kit/synthetic-widgets";\nconsole.log(summarizeWidgets([readWidget()]));\n',
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/prepare-capability-fixtures.ts <new-or-empty-output>");
  }
  await prepareCapabilityFixtures(output);
  process.stdout.write(
    "Prepared six fictional package snapshots; build them before testing imports.\n",
  );
}
