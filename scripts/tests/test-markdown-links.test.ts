import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { markdownAnchors, validateMarkdownLinks } from "../lib/markdown-links.ts";

test("heading IDs retain Unicode, inline labels, duplicates, setext and explicit anchors", () => {
  const source =
    '# `client.read` — Details\n## Café\n## Same\n## Same\n## Same-1\nSetext\n------\n<a id="manual"></a>\n### [Read](other.md) **now**\n## `Result<T>` and <em>values</em>\n## `[label](target)`\n~~~md\n# Ignored\n~~~';
  expect([...markdownAnchors(source)]).toEqual([
    "clientread--details",
    "café",
    "same",
    "same-1",
    "same-1-1",
    "setext",
    "read-now",
    "resultt-and-values",
    "labeltarget",
    "manual",
  ]);
});

async function fixture(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "mdk-doc-links-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(dirname(join(root, name)), { recursive: true });
      await writeFile(join(root, name), contents);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("package README, template and extensionless manifest links are checked with original line numbers", async () => {
  await fixture(
    {
      "packages/sample/README.md":
        "# Package\n```md\n[example](missing.md)\n```\n\n[real](missing.md)\n",
      "templates/sample/README.md": "[missing heading](../../README.md#removed)",
      "docs/manifest": "[missing](absent.md)",
      "README.md": "# Root",
    },
    async (root) => {
      const result = await validateMarkdownLinks(root);
      expect(result.files).toBe(4);
      expect(result.diagnostics.map(({ file, line }) => [file, line])).toEqual([
        ["docs/manifest", 1],
        ["packages/sample/README.md", 6],
        ["templates/sample/README.md", 1],
      ]);
    },
  );
});

test("links support local fragments, encoded names, nested parentheses and reference definitions", async () => {
  await fixture(
    {
      "README.md":
        '# Start\n[local](#start)\n[unicode](docs/a%20file.md#caf%C3%A9)\n[title](docs/a%20file.md#same-1 "title")\n[nested](docs/a(b).md#ok)\n[reference][ref]\n[ref]: <docs/a file.md#same>\n[external](https://example.com/#anything)\n`[code](absent.md)`\n<!-- [hidden](absent.md) -->\n~~~\n[code](absent.md)\n~~~',
      "docs/a file.md": "# Café\n## Same\n## Same",
      "docs/a(b).md": "# Ok",
    },
    async (root) => {
      expect((await validateMarkdownLinks(root)).diagnostics).toEqual([]);
    },
  );
});

test("malformed encoding and repository escape remain failures; build artifacts are not scanned", async () => {
  await fixture(
    {
      "README.md": "[escape](../outside.md)\n[invalid](bad%zz.md)",
      "packages/a/dist/README.md": "[unused](missing.md)",
    },
    async (root) => {
      const result = await validateMarkdownLinks(root);
      expect(result.files).toBe(1);
      expect(result.diagnostics.map(({ message }) => message)).toEqual([
        "target escapes the repository",
        "invalid percent encoding",
      ]);
    },
  );
});
