import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseJson, values } from "./lib/json.ts";

interface PriceCapture {
  officialClient: { tag: string };
  explorer: Record<
    string,
    {
      pythImplementation: { abi: unknown };
      providerUpgradedPythImplementation: { abi: unknown };
      skip: { abi: unknown };
    }
  >;
}

const [capturePath, clientRepository] = process.argv.slice(2);
if (!capturePath || !clientRepository) {
  throw new Error(
    "usage: node scripts/import-price-contract-abis.ts <capture-json> <official-mezod-repository>",
  );
}

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(
  repositoryRoot,
  "knowledge",
  "contracts",
  "artifacts",
  "abis",
  "oracle",
);
const capture = parseJson(await readFile(capturePath, "utf8"), capturePath) as PriceCapture;

const { stdout: skipRaw } = await execFileAsync("git", [
  "-C",
  clientRepository,
  "show",
  `${capture.officialClient.tag}:precompile/priceoracle/abi.json`,
]);
const skipAbi = values(parseJson(skipRaw, "official Skip ABI"), "official Skip ABI");
const mezoMainnet =
  capture.explorer["mezo-mainnet"] ?? fail("Mezo Mainnet explorer capture is missing");
const mezoTestnet =
  capture.explorer["mezo-testnet"] ?? fail("Mezo Testnet explorer capture is missing");
const pythAbi = values(
  mezoMainnet.providerUpgradedPythImplementation.abi,
  "verified mainnet provider-upgraded Pyth implementation ABI",
);
const testnetPythAbi = values(
  mezoTestnet.providerUpgradedPythImplementation.abi,
  "verified testnet provider-upgraded Pyth implementation ABI",
);

assert(
  Array.isArray(skipAbi) && skipAbi.length === 2,
  "official Skip ABI must contain two entries",
);
assert(Array.isArray(pythAbi) && pythAbi.length > 1, "verified Pyth implementation ABI is missing");
assert(
  JSON.stringify(pythAbi) === JSON.stringify(testnetPythAbi),
  "verified provider-upgraded Pyth ABIs differ across Mezo networks",
);
assert(
  mezoMainnet.pythImplementation.abi === null && mezoTestnet.pythImplementation.abi === null,
  "legacy in-place Pyth implementations unexpectedly acquired explorer ABIs",
);
assert(
  JSON.stringify(skipAbi) === JSON.stringify(values(mezoMainnet.skip.abi, "mainnet Skip ABI")) &&
    JSON.stringify(skipAbi) === JSON.stringify(values(mezoTestnet.skip.abi, "testnet Skip ABI")),
  "official Skip ABI and explorer wrapper ABIs differ",
);

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeJson(join(outputDirectory, "skip-btc-usd.json"), skipAbi),
  writeJson(join(outputDirectory, "pyth-price-feed.json"), pythAbi),
]);

process.stdout.write(`Imported ${skipAbi.length} Skip and ${pythAbi.length} Pyth ABI entries.\n`);

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fail(message: string): never {
  throw new Error(message);
}
