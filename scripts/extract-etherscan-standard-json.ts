import { readFile, writeFile } from "node:fs/promises";

const [htmlPath, outputPath] = process.argv.slice(2);
if (!htmlPath || !outputPath) {
  throw new Error(
    "usage: node scripts/extract-etherscan-standard-json.ts <etherscan-html> <output-json>",
  );
}

const html = await readFile(htmlPath, "utf8");
const prefix = "var editor_contractJsonData = '";
const start = html.indexOf(prefix);
if (start < 0) throw new Error("Etherscan standard JSON input marker is missing");
const activeFileMarker = html.indexOf("var editor_activeFile", start + prefix.length);
const end = html.lastIndexOf("'", activeFileMarker);
if (end < 0) throw new Error("Etherscan standard JSON input terminator is missing");

const javascriptStringContents = html.slice(start + prefix.length, end);
const decoded = decodeJavascriptString(javascriptStringContents);
const parsedInput = JSON.parse(decoded) as unknown;
if (!isRecord(parsedInput)) throw new Error("Etherscan standard JSON input must be an object");
const standardInput = parsedInput;
const sources = isRecord(standardInput.sources) ? standardInput.sources : undefined;
const settingsSource = sources === undefined ? undefined : sources["settings.json"];
if (
  !standardInput.settings &&
  sources !== undefined &&
  isRecord(settingsSource) &&
  typeof settingsSource.content === "string"
) {
  standardInput.settings = JSON.parse(settingsSource.content) as unknown;
  delete sources["settings.json"];
}
if (
  standardInput.language !== "Solidity" ||
  !isRecord(standardInput.sources) ||
  !standardInput.settings
) {
  throw new Error(
    `Etherscan standard JSON input is incomplete; keys: ${Object.keys(standardInput).join(", ")}`,
  );
}

await writeFile(outputPath, `${JSON.stringify(standardInput, null, 2)}\n`, "utf8");
process.stdout.write(
  `Extracted ${Object.keys(standardInput.sources).length} Solidity sources to ${outputPath}.\n`,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeJavascriptString(value: string): string {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    index += 1;
    if (index >= value.length) throw new Error("unterminated JavaScript escape sequence");
    const escape = value.charAt(index);

    if (["'", '"', "`", "\\", "/"].includes(escape)) {
      decoded += escape;
      continue;
    }

    const simpleEscapes = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
    };
    if (escape in simpleEscapes) {
      decoded += simpleEscapes[escape as keyof typeof simpleEscapes];
      continue;
    }

    if (escape === "\n") continue;
    if (escape === "\r") {
      if (value[index + 1] === "\n") index += 1;
      continue;
    }

    if (escape === "x") {
      const hexadecimal = value.slice(index + 1, index + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hexadecimal)) {
        throw new Error(`invalid JavaScript hexadecimal escape at offset ${index - 1}`);
      }
      decoded += String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      index += 2;
      continue;
    }

    if (escape === "u") {
      let hexadecimal;
      if (value[index + 1] === "{") {
        const closingBrace = value.indexOf("}", index + 2);
        if (closingBrace < 0) throw new Error("unterminated JavaScript Unicode escape");
        hexadecimal = value.slice(index + 2, closingBrace);
        index = closingBrace;
      } else {
        hexadecimal = value.slice(index + 1, index + 5);
        index += 4;
      }
      if (!/^[0-9a-fA-F]{1,6}$/.test(hexadecimal)) {
        throw new Error(`invalid JavaScript Unicode escape at offset ${index}`);
      }
      decoded += String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      continue;
    }

    if (escape === "0" && !/[0-9]/.test(value[index + 1] ?? "")) {
      decoded += "\0";
      continue;
    }

    throw new Error(`unsupported JavaScript escape \\${escape} at offset ${index - 1}`);
  }

  return decoded;
}
