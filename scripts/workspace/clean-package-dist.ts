import { rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageDirectories = new Map([
  ["cli", resolve(repositoryRoot, "packages/cli")],
  ["examples", resolve(repositoryRoot, "examples")],
  ["bridges", resolve(repositoryRoot, "packages/bridges")],
  ["musd-redemptions", resolve(repositoryRoot, "packages/protocols/musd-redemptions")],
  [
    "musd-institutional-debt",
    resolve(repositoryRoot, "packages/protocols/musd-institutional-debt"),
  ],
  ["swaps", resolve(repositoryRoot, "packages/swaps")],
  ["pools", resolve(repositoryRoot, "packages/protocols/pools")],
  ["prices", resolve(repositoryRoot, "packages/prices")],
  ["incentives", resolve(repositoryRoot, "packages/protocols/incentives")],
  ["tokens", resolve(repositoryRoot, "packages/tokens")],
  ["musd-borrowing", resolve(repositoryRoot, "packages/protocols/musd-borrowing")],
  ["evm", resolve(repositoryRoot, "packages/evm")],
  ["usdc-lending-vault", resolve(repositoryRoot, "packages/protocols/usdc-lending-vault")],
  ["musdc-lending", resolve(repositoryRoot, "packages/protocols/musdc-lending")],
  ["musd-savings", resolve(repositoryRoot, "packages/protocols/musd-savings")],
  ["chains", resolve(repositoryRoot, "packages/chains")],
  ["contracts", resolve(repositoryRoot, "packages/contracts")],
  ["core", resolve(repositoryRoot, "packages/core")],
]);

const [packageName, ...unexpected] = process.argv.slice(2);
if (!packageName || unexpected.length > 0) {
  throw new Error("usage: clean-package-dist.ts <approved-package-name>");
}
const packageRoot = packageDirectories.get(packageName);
if (!packageRoot) throw new Error(`package '${packageName}' is not approved for dist cleanup`);
const outputPath = resolve(packageRoot, "dist");
const relation = relative(packageRoot, outputPath);
if (relation !== "dist" || relation.startsWith(`..${sep}`)) {
  throw new Error(`refusing to clean unexpected output path '${outputPath}'`);
}
await rm(outputPath, { recursive: true, force: true });
