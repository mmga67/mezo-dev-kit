interface CodeRange {
  readonly start: number;
  readonly end: number;
  readonly kind: "block" | "inline";
}

function codeRanges(markdown: string): readonly CodeRange[] {
  const blocks: CodeRange[] = [];
  let fence: { marker: string; start: number; indent: number; quoteDepth: number } | undefined;
  const listIndents: number[] = [];
  let offset = 0;
  for (const line of markdown.split(/(?<=\n)/)) {
    // Container prefixes belong to the document, not the literal fence contents.
    const quotePrefix = /^(?: {0,3}>[ \t]?)+/.exec(line)?.[0] ?? "";
    const quoteDepth = quotePrefix.split(">").length - 1;
    let content = line;
    for (let depth = 0; depth < (fence?.quoteDepth ?? quoteDepth); depth++)
      content = content.replace(/^ {0,3}>[ \t]?/, "");
    const indentation = /^ */.exec(content)?.[0].length ?? 0;
    if (
      fence &&
      (quoteDepth < fence.quoteDepth || (content.trim() && indentation < fence.indent))
    ) {
      blocks.push({ start: fence.start, end: offset, kind: "block" });
      fence = undefined;
    }
    if (!fence && content.trim()) {
      while (listIndents.length && indentation < (listIndents.at(-1) ?? 0)) listIndents.pop();
      const item = /^ *(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(content);
      if (item && indentation - (listIndents.at(-1) ?? 0) < 4) listIndents.push(item[0].length);
    }
    const listIndent = fence?.indent ?? listIndents.at(-1) ?? 0;
    if (indentation >= listIndent) content = content.slice(listIndent);
    else if (!fence) content = content.replace(/^ *(?:[-+*]|\d{1,9}[.)])[ \t]+/, "");
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(content);
    if (fence) {
      if (
        marker?.[1] &&
        marker[1].startsWith(fence.marker.charAt(0)) &&
        marker[1].length >= fence.marker.length &&
        marker[2]?.trim() === ""
      ) {
        blocks.push({ start: fence.start, end: offset + line.length, kind: "block" });
        fence = undefined;
      }
    } else if (marker?.[1] && !(marker[1].startsWith("`") && marker[2]?.includes("`"))) {
      fence = { marker: marker[1], start: offset, indent: listIndent, quoteDepth };
    } else if (/^(?: {4}|\t)/.test(content)) {
      blocks.push({ start: offset, end: offset + line.length, kind: "block" });
    }
    offset += line.length;
  }
  if (fence) blocks.push({ start: fence.start, end: markdown.length, kind: "block" });

  const ranges: CodeRange[] = [];
  let start = 0;
  const end: CodeRange = { start: markdown.length, end: markdown.length, kind: "block" };
  for (const block of [...blocks, end]) {
    const prose = markdown.slice(start, block.start);
    let paragraphStart = start;
    // Inline code can span lines within a paragraph, but never a blank-line boundary.
    for (const paragraph of prose.split(/(\r?\n[ \t]*\r?\n)/)) {
      const ticks = [...paragraph.matchAll(/`+/g)];
      for (let index = 0; index < ticks.length; index++) {
        const opening = ticks[index];
        if (!opening) continue;
        let backslashes = 0;
        for (let cursor = opening.index - 1; cursor >= 0 && paragraph[cursor] === "\\"; cursor--)
          backslashes++;
        if (backslashes % 2 !== 0) continue;
        const closingIndex = ticks.findIndex(
          (candidate, candidateIndex) => candidateIndex > index && candidate[0] === opening[0],
        );
        const closing = ticks[closingIndex];
        if (!closing) continue;
        ranges.push({
          start: paragraphStart + opening.index,
          end: paragraphStart + closing.index + closing[0].length,
          kind: "inline",
        });
        index = closingIndex;
      }
      paragraphStart += paragraph.length;
    }
    ranges.push(block);
    start = block.end;
  }
  return ranges;
}

/** Rewrite inline navigation links while leaving literal Markdown examples untouched. */
export function rewriteMarkdownLinks(
  markdown: string,
  rewrite: (whole: string, label: string, target: string) => string,
): string {
  const ranges = codeRanges(markdown);
  let rangeIndex = 0;
  let copied = 0;
  let output = "";
  for (let offset = 0; offset < markdown.length; offset++) {
    let range = ranges[rangeIndex];
    while (range && range.end <= offset) range = ranges[++rangeIndex];
    if (range && range.start <= offset) {
      offset = range.end - 1;
      continue;
    }
    if (markdown[offset] === "\\") {
      offset++;
      continue;
    }
    if (markdown[offset] !== "[") continue;
    let depth = 1;
    let closing = offset + 1;
    let labelRangeIndex = rangeIndex;
    for (; closing < markdown.length; closing++) {
      let labelRange = ranges[labelRangeIndex];
      while (labelRange && labelRange.end <= closing) labelRange = ranges[++labelRangeIndex];
      if (labelRange && labelRange.start <= closing) {
        if (labelRange.kind === "block") break;
        closing = labelRange.end - 1;
      } else if (markdown[closing] === "\\") closing++;
      else if (markdown[closing] === "[") depth++;
      else if (markdown[closing] === "]" && --depth === 0) break;
    }
    if (depth !== 0) continue;
    const destination = /^\(([^)\s]+)\)/.exec(markdown.slice(closing + 1));
    if (!destination?.[1]) continue;
    const end = closing + 1 + destination[0].length;
    output += markdown.slice(copied, offset);
    output += rewrite(
      markdown.slice(offset, end),
      markdown.slice(offset + 1, closing),
      destination[1],
    );
    copied = end;
    offset = end - 1;
  }
  return output + markdown.slice(copied);
}
