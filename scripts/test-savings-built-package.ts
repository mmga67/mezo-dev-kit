import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/protocols/musd-savings");
const example = resolve(root, "examples/musd-savings-readonly");
const files = await readdir(resolve(packageRoot, "dist"));
if (!files.includes("index.js") || !files.includes("index.d.ts"))
  throw new Error("missing Savings built boundary");
for (const file of files.filter((name) => name.endsWith(".js"))) {
  const source = await readFile(resolve(packageRoot, "dist", file), "utf8");
  if (
    /from\s+["'][^"']*knowledge\//.test(source) ||
    /"stateMutability": "(?:nonpayable|payable)"/.test(source)
  )
    throw new Error("Savings runtime leaked knowledge imports or writer ABI");
}
run(
  example,
  `const api = await import('@mezo-dev-kit/musd-savings');
const names = Object.keys(api).sort();
if (JSON.stringify(names) !== JSON.stringify(['SavingsReadError', 'calculateSavingsDistribution', 'calculateSavingsYield', 'createSavingsReader'])) throw new Error('unexpected export surface');
if (api.calculateSavingsYield({balance:333n,yieldIndex:100000000000000000n,supplyYieldIndex:0n,storedClaimableYield:2n}).claimable.baseUnits !== 35n) throw new Error('built accounting failed');
await import('./dist/index.js');`,
  0,
);
run(
  example,
  "await import('@mezo-dev-kit/musd-savings/reader');",
  1,
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
const temporary = await mkdtemp(join(tmpdir(), "mdk-savings-missing-artifact-"));
try {
  const target = resolve(temporary, "node_modules/@mezo-dev-kit/musd-savings");
  await mkdir(target, { recursive: true });
  await writeFile(
    resolve(target, "package.json"),
    await readFile(resolve(packageRoot, "package.json")),
  );
  run(temporary, "await import('@mezo-dev-kit/musd-savings');", 1, "ERR_MODULE_NOT_FOUND");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
process.stdout.write(
  "Savings built entrypoint, accounting example, and negative boundaries passed.\n",
);
function run(cwd: string, source: string, expected: number, error?: string): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== expected || (error && !result.stderr.includes(error)))
    throw new Error(`Savings built test failed: ${String(result.error)} ${result.stderr}`);
}
