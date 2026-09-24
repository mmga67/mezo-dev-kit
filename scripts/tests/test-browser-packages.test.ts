import { execFile } from "node:child_process";
import { globSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium, firefox, webkit } from "playwright";
import { build, createLogger } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
let consumer: string;
let bundle: string;
const entrypoints: string[] = [];

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected package object");
  return value as Record<string, unknown>;
}

async function bundleSource(name: string, source: string, format: "iife" | "es"): Promise<string> {
  const entry = join(consumer, `${name}.ts`);
  await writeFile(entry, source);
  const logger = createLogger("silent");
  logger.warn = (message) => {
    throw new Error(`Browser bundle warning: ${message}`);
  };
  const result = await build({
    configFile: false,
    root: consumer,
    logLevel: "silent",
    customLogger: logger,
    build: {
      target: "es2022",
      minify: true,
      write: false,
      lib: { entry, formats: [format], name: "MDKBrowser" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap((output) => {
      if (!("output" in output)) throw new Error("Unexpected browser build watcher");
      return output.output.flatMap((item) => {
        if (item.type !== "chunk") return [];
        expect(item.imports).toEqual([]);
        return [item.code];
      });
    })
    .join("\n");
}

beforeAll(async () => {
  consumer = await mkdtemp(join(tmpdir(), "mdk-browser-consumer-"));
  const packed = join(consumer, "packed");
  await mkdir(packed);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  for (const file of globSync("packages/**/package.json", { cwd: root }).filter(
    (file) => !file.includes("node_modules") && !file.includes("dist"),
  )) {
    const manifest = record(JSON.parse(await readFile(join(root, file), "utf8")));
    const name = manifest.name;
    if (
      typeof name !== "string" ||
      !name.startsWith("@mezo-dev-kit/") ||
      name === "@mezo-dev-kit/cli"
    )
      continue;
    const before = new Set(await readdir(packed));
    await run("pnpm", ["pack", "--pack-destination", packed], {
      cwd: dirname(join(root, file)),
      timeout: 60000,
    });
    const artifacts = (await readdir(packed)).filter((file) => !before.has(file));
    if (artifacts.length !== 1 || !artifacts[0]?.endsWith(".tgz"))
      throw new Error(`Unexpected artifact for ${name}`);
    const target = join(consumer, "node_modules", name);
    await mkdir(target, { recursive: true });
    await run("tar", ["-xzf", join(packed, artifacts[0]), "--strip-components=1", "-C", target]);
    const packedManifest = record(JSON.parse(await readFile(join(target, "package.json"), "utf8")));
    expect(packedManifest.name).toBe(name);
    expect(packedManifest.sideEffects).toBe(false);
    expect(await readdir(target)).not.toContain("src");
    for (const key of Object.keys(record(packedManifest.exports))) {
      entrypoints.push(name + (key === "." ? "" : key.slice(1)));
    }
  }
  // Ox is the sole external runtime dependency. Use its installed package with its own
  // dependency graph; every MDK package above is consumed from an extracted tarball.
  await symlink(
    resolve(root, "packages/evm/node_modules/ox"),
    join(consumer, "node_modules/ox"),
    "dir",
  );
  await copyFile(join(root, "examples/test/browser/fixture.ts"), join(consumer, "fixture.ts"));
  await copyFile(join(root, "examples/browser/main.ts"), join(consumer, "frontend-example.ts"));
  bundle = await bundleSource(
    "all-sdk",
    [
      ...entrypoints.map((name, index) => `export * as sdk${index} from ${JSON.stringify(name)};`),
      'export { runBrowserVerification } from "./fixture.ts";',
    ].join("\n"),
    "iife",
  );
});

afterAll(async () => {
  if (consumer) await rm(consumer, { force: true, recursive: true });
});

test("packed public entrypoints import in Node without a DOM", async () => {
  const result = await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `if (typeof window !== 'undefined') throw new Error('Unexpected DOM'); await Promise.all(${JSON.stringify(entrypoints)}.map(name => import(name)));`,
    ],
    { cwd: consumer },
  );
  expect(result.stderr).toBe("");
});

test("packed declarations typecheck for a browser consumer without Node ambient types", async () => {
  await writeFile(
    join(consumer, "declarations.ts"),
    entrypoints
      .map(
        (name, index) =>
          `import * as sdk${index} from ${JSON.stringify(name)}; export type Surface${index} = typeof sdk${index};`,
      )
      .join("\n"),
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      extends: join(root, "tsconfig.base.json"),
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        types: [],
        noEmit: true,
      },
      include: ["declarations.ts", "fixture.ts", "frontend-example.ts"],
    }),
  );
  await run(process.execPath, [
    join(root, "node_modules/typescript/bin/tsc"),
    "--project",
    join(consumer, "tsconfig.json"),
  ]);
});

test.each([
  { name: "Chromium", engine: chromium },
  { name: "Firefox", engine: firefox },
  { name: "WebKit", engine: webkit },
])("packed SDK behavior in $name", async ({ engine }) => {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(async () => {
      // The generated bundle owns this export; the returned values are asserted below.
      const sdk = Reflect.get(globalThis, "MDKBrowser") as {
        runBrowserVerification: () => Promise<unknown>;
      };
      return sdk.runBrowserVerification();
    });
    expect(result).toEqual({
      noNodeGlobals: true,
      byteDigest: "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      utf8Digest: "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      amount: "1250000",
      chain: "31612",
      abiRoundTrip: "7",
      savings: "7",
      queryId: "01a2c8f9da8f59fdf7c310e7faf4f67a855c65f580412f0f6d809a5347eb614b",
      resumedThrough: "11703360",
      scanStatus: "complete",
      wrongRuntimeRejected: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test.each([
  {
    name: "savings-calculation",
    code: 'export { calculateSavingsYield } from "@mezo-dev-kit/musd-savings";',
    maxBytes: 4096,
    maxGzip: 1536,
  },
  {
    name: "rpc-adapter",
    code: 'export { createRpcTransport } from "@mezo-dev-kit/core";',
    maxBytes: 32768,
    maxGzip: 10240,
  },
])("$name does not retain the contract registry", async ({ name, code, maxBytes, maxGzip }) => {
  const result = await bundleSource(name, code, "es");
  expect(Buffer.byteLength(result)).toBeLessThan(maxBytes);
  expect(gzipSync(result).byteLength).toBeLessThan(maxGzip);
});

test("frontend form validates exact amounts using packed EVM exports", async () => {
  const code = await bundleSource(
    "frontend-example",
    await readFile(join(root, "examples/browser/main.ts"), "utf8"),
    "iife",
  );
  const html = (await readFile(join(root, "examples/browser/index.html"), "utf8")).replace(
    '<script type="module" src="./main.ts"></script>',
    "",
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html);
    await page.addScriptTag({ content: code });
    await page.getByRole("button", { name: "Convert amount" }).click();
    expect(await page.locator("output").textContent()).toContain("1.25 = 1250000 base units");
    await page.getByLabel("Amount", { exact: true }).fill("0.0000001");
    await page.getByRole("button", { name: "Convert amount" }).click();
    expect(await page.locator("output").textContent()).toContain("ExcessPrecision");
  } finally {
    await browser.close();
  }
});
