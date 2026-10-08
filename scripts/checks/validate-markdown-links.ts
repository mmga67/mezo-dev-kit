import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMarkdownLinks } from "../lib/markdown-links.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const result = await validateMarkdownLinks(root);
if (result.diagnostics.length > 0) {
  throw new Error(
    `Markdown link validation failed:\n${result.diagnostics
      .map(({ file, line, target, message }) => `${file}:${line} ${message}: ${target}`)
      .join("\n")}`,
  );
}
process.stdout.write(
  `Validated local Markdown files and heading targets in ${result.files} maintained files.\n`,
);
