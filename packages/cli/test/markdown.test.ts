import { expect, test, vi } from "vitest";
import { rewriteMarkdownLinks } from "../src/markdown.ts";

const literal = "[Example](./example.md#details)";

test.for([
  ["backtick fence", `\`\`\`ts\nconst help = "${literal}";\n\`\`\`\n`],
  ["tilde fence", `~~~sh\nprintf '%s' '${literal}'\n~~~\n`],
  [
    "long fence with nested short fence",
    `\`\`\`\`markdown\n\`\`\`\n${literal}\n\`\`\`\n\`\`\`\`\n`,
  ],
  ["longer closing fence", `~~~markdown\n${literal}\n~~~~\n`],
  ["different fence inside example", `~~~markdown\n\`\`\`\n${literal}\n~~~\n`],
  ["quoted fence", `> \`\`\`markdown\n> ${literal}\n> \`\`\`\n`],
  ["list fence", `- \`\`\`markdown\n  ${literal}\n  \`\`\`\n`],
  ["indented example", `    ${literal}\n\t${literal}\n`],
  ["indented fence text", `    \`\`\`markdown\n    ${literal}\n`],
  ["indented list syntax", `    - ${literal}\n`],
  ["quoted marker inside unquoted code", `~~~markdown\n> ~~~\n${literal}\n~~~\n`],
  ["quoted fence ends with its container", `> ~~~markdown\n> ${literal}\n`],
  ["list fence ends with its container", `- ~~~markdown\n  ${literal}\n`],
  ["inline code", `Literal: \`${literal}\`.\n`],
  ["inline code with backticks", `Literal: \`\`${literal} \`x\` \`\`.\n`],
  ["multiline inline code", `Literal: \`line one\n${literal}\`.\n`],
  ["CRLF", `~~~ts\r\n${literal}\r\n~~~\r\n`],
])("%s keeps literal bytes and still rewrites the following navigation", ([, example]) => {
  const rewrite = vi.fn(() => "[Guide](bundled.md#details)");
  const navigation = "[Guide](./guide.md#details)";
  const markdown = `${example}\n${navigation}\n`;
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(`${example}\n[Guide](bundled.md#details)\n`);
  expect(rewrite).toHaveBeenCalledExactlyOnceWith(navigation, "Guide", "./guide.md#details");
});

test("an unclosed fence preserves the remainder, including apparent links", () => {
  const markdown = `\`\`\`markdown\n${literal}\n`;
  const rewrite = vi.fn();
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(markdown);
  expect(rewrite).not.toHaveBeenCalled();
});

test("unmatched or escaped backticks do not hide navigation and code in labels stays intact", () => {
  const rewrite = vi.fn((whole: string) => whole.replace("./", "bundle/"));
  const markdown = `Unmatched \` ${literal}\n\nEscaped \\\` ${literal}\n\n[Use \`read()\`](./api.md)\n`;
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(markdown.replaceAll("(./", "(bundle/"));
  expect(rewrite).toHaveBeenCalledTimes(3);
});

test("literal links in a code-formatted label remain intact while the real destination changes", () => {
  const markdown = `[Use \`${literal}\`](./api.md)`;
  const rewrite = vi.fn((_whole: string, label: string) => `[${label}](bundle/api.md)`);
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(`[Use \`${literal}\`](bundle/api.md)`);
  expect(rewrite).toHaveBeenCalledExactlyOnceWith(markdown, `Use \`${literal}\``, "./api.md");
});

test("a stray bracket before a fenced example cannot turn its contents into navigation", () => {
  const markdown = `Unclosed bracket [\n\n\`\`\`markdown\n${literal}\n\`\`\`\n`;
  const rewrite = vi.fn();
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(markdown);
  expect(rewrite).not.toHaveBeenCalled();
});

test("list continuation links are navigation while further-indented examples remain literal", () => {
  const markdown = `1. Start here.\n\n    [Guide](./guide.md)\n\n       ${literal}\n`;
  const rewrite = vi.fn(() => "[Guide](bundle/guide.md)");
  expect(rewriteMarkdownLinks(markdown, rewrite)).toBe(
    markdown.replace("(./guide.md)", "(bundle/guide.md)"),
  );
  expect(rewrite).toHaveBeenCalledOnce();
});
