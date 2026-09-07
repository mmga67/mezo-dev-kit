import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import * as prettier from "prettier";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { validateWorkspaceBoundaries } from "./validate-package-boundaries.ts";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureDirectory = path.join(repositoryRoot, "scripts", "fixtures", "coding-gates");

async function lintFixture(fileName: string): Promise<readonly string[]> {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const [result] = await eslint.lintFiles([path.join(fixtureDirectory, fileName)]);
  return result?.messages.map((message) => message.ruleId ?? "fatal") ?? [];
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, undefined, 2)}\n`, "utf8");
}

describe("coding-standard negative gates", () => {
  test("TypeScript rejects use of unknown before validation", () => {
    const configPath = path.join(fixtureDirectory, "tsconfig.json");
    const configFile = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
    expect(configFile.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fixtureDirectory);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 2322 &&
          diagnostic.file?.fileName.endsWith("unsafe-unknown.ts") === true,
      ),
    ).toBe(true);
  });

  test.each([
    ["explicit-any.ts", "@typescript-eslint/no-explicit-any"],
    ["floating-promise.ts", "@typescript-eslint/no-floating-promises"],
    ["invalid-suppression.ts", "fatal"],
  ])("typed lint rejects %s", async (fileName, expectedRule) => {
    expect(await lintFixture(fileName)).toContain(expectedRule);
  });

  test("Prettier rejects mechanical formatting drift", async () => {
    expect(await prettier.check("export const drift={answer:42}\n", { parser: "typescript" })).toBe(
      false,
    );
  });

  test("package boundary validator accepts declared public dependencies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mdk-boundary-valid-"));
    try {
      const provider = path.join(root, "packages", "provider");
      const consumer = path.join(root, "packages", "consumer");
      await Promise.all([
        mkdir(path.join(provider, "src"), { recursive: true }),
        mkdir(path.join(consumer, "src"), { recursive: true }),
      ]);
      await writeJson(path.join(provider, "package.json"), {
        name: "@fixture/provider",
        exports: { ".": "./src/index.ts", "./feature": "./src/feature.ts" },
      });
      await writeJson(path.join(consumer, "package.json"), {
        name: "@fixture/consumer",
        exports: "./src/index.ts",
        dependencies: { "@fixture/provider": "workspace:*" },
      });
      await Promise.all([
        writeFile(path.join(provider, "src", "index.ts"), "export const publicValue = 1;\n"),
        writeFile(path.join(provider, "src", "feature.ts"), "export const feature = 1;\n"),
        writeFile(
          path.join(consumer, "src", "index.ts"),
          'export { feature } from "@fixture/provider/feature";\n',
        ),
      ]);

      expect(await validateWorkspaceBoundaries(root)).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("package boundary validator rejects deep, relative, undeclared, and cyclic edges", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mdk-boundary-invalid-"));
    try {
      const packageNames = ["a", "b", "c"] as const;
      await Promise.all(
        packageNames.map((name) =>
          mkdir(path.join(root, "packages", name, "src"), { recursive: true }),
        ),
      );
      await writeJson(path.join(root, "packages", "a", "package.json"), {
        name: "@fixture/a",
        exports: "./src/index.ts",
        dependencies: { "@fixture/b": "workspace:*" },
      });
      await writeJson(path.join(root, "packages", "b", "package.json"), {
        name: "@fixture/b",
        exports: "./src/index.ts",
        dependencies: { "@fixture/a": "workspace:*" },
      });
      await writeJson(path.join(root, "packages", "c", "package.json"), {
        name: "@fixture/c",
        exports: "./src/index.ts",
      });
      await Promise.all([
        writeFile(
          path.join(root, "packages", "a", "src", "index.ts"),
          'export { hidden } from "@fixture/b/src/internal.ts";\nexport { publicValue } from "../../b/src/index.ts";\n',
        ),
        writeFile(
          path.join(root, "packages", "b", "src", "index.ts"),
          "export const publicValue = 1;\nexport const hidden = 2;\n",
        ),
        writeFile(
          path.join(root, "packages", "c", "src", "index.ts"),
          'export { publicValue } from "@fixture/b";\n',
        ),
      ]);

      const diagnostics = await validateWorkspaceBoundaries(root);
      expect(new Set(diagnostics.map(({ code }) => code))).toEqual(
        new Set([
          "cross-package-relative-import",
          "dependency-cycle",
          "undeclared-workspace-dependency",
          "undeclared-workspace-entrypoint",
        ]),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fixture source remains deliberately invalid rather than configuration-only", async () => {
    const contents = await readFile(path.join(fixtureDirectory, "unsafe-unknown.ts"), "utf8");
    expect(contents).toContain("trustedValue: string = untrustedValue");
  });
});
