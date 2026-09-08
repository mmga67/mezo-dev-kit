import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/protocols/musdc-lending");
const example = resolve(root, "examples/musdc-lending-readonly");
const files = await readdir(resolve(packageRoot, "dist"));
if (!files.includes("index.js") || !files.includes("index.d.ts"))
  throw new Error("missing Lending built boundary");
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const source = await readFile(resolve(packageRoot, "dist", file), "utf8");
  if (
    /from\s+["'][^"']*knowledge\//.test(source) ||
    /"stateMutability": "(?:nonpayable|payable)"/.test(source)
  )
    throw new Error("Lending runtime leaked knowledge imports or writer ABI");
}
run(
  example,
  `const api = await import('@mezo-dev-kit/musdc-lending');
const names = Object.keys(api).sort();
if (JSON.stringify(names) !== JSON.stringify(["LendingReadError","LendingWriteError","accrueLendingMarket","calculateLendingHealth","calculateLendingInterest","createLendingReader","createLendingRpcConfig","createLendingRpcReader","createLendingTargetResolver","createLendingWriter","forecastLending","lendingToAssets","lendingToShares"])) throw new Error('unexpected export surface');
if (api.calculateLendingInterest(1000000000000n,3600n,1000000n).interest !== 3606n) throw new Error('built accounting failed');
await import('./dist/index.js');`,
  0,
);
run(
  example,
  "await import('@mezo-dev-kit/musdc-lending/reader');",
  1,
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
const temporary = await mkdtemp(join(tmpdir(), "mdk-lending-missing-artifact-"));
try {
  const target = resolve(temporary, "node_modules/@mezo-dev-kit/musdc-lending");
  await mkdir(target, { recursive: true });
  await writeFile(
    resolve(target, "package.json"),
    await readFile(resolve(packageRoot, "package.json")),
  );
  run(temporary, "await import('@mezo-dev-kit/musdc-lending');", 1, "ERR_MODULE_NOT_FOUND");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
process.stdout.write(
  "Lending built entrypoint, accounting example, and negative boundaries passed.\n",
);
function run(cwd: string, source: string, expected: number, error?: string): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== expected || (error && !result.stderr.includes(error)))
    throw new Error(`Lending built test failed: ${String(result.error)} ${result.stderr}`);
}
