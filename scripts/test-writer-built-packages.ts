import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const [directory, name, exports] of [
  [
    "packages/tokens",
    "tokens",
    [
      "TokenError",
      "createApprovalWriter",
      "createTokenReader",
      "decodeTokenTransfers",
      "planApproval",
    ],
  ],
  [
    "packages/protocols/incentives",
    "incentives",
    [
      "GaugeError",
      "IncentiveError",
      "allocateVotingPower",
      "calculateBoostFactor",
      "calculateLockEnd",
      "calculateLockVotingPower",
      "calculateVotingEpoch",
      "createGaugeReader",
      "createGaugeTargetResolver",
      "createGaugeWriter",
      "createLockReader",
      "createLockTargetResolver",
      "createLockWriter",
      "forecastLock",
    ],
  ],
  [
    "packages/prices",
    "prices",
    [
      "PriceError",
      "createSkipPriceReader",
      "evaluatePriceFreshness",
      "normalizePriceAmount",
      "normalizePriceConfidence",
    ],
  ],
  [
    "packages/protocols/pools",
    "pools",
    [
      "PoolError",
      "calculateBasicPoolFees",
      "calculateBasicSwapFee",
      "createBasicLiquidityWriter",
      "createBasicPoolFeeWriter",
      "createBasicPoolReader",
      "createBasicPoolTargetResolver",
      "forecastBasicLiquidity",
      "sortBasicPoolKey",
    ],
  ],
  [
    "packages/swaps",
    "swaps",
    [
      "SwapError",
      "createBasicSwapReader",
      "createBasicSwapWriter",
      "rankBasicSwapQuotes",
      "validateBasicSwapRoute",
    ],
  ],
  [
    "packages/protocols/musd-institutional-debt",
    "musd-institutional-debt",
    [
      "InstitutionalDebtError",
      "calculateInstitutionalAccrual",
      "calculateInstitutionalFee",
      "calculateInstitutionalHealth",
      "calculateInstitutionalOutstandingDebt",
      "calculateInstitutionalPositionDebt",
      "calculateInstitutionalRepayment",
      "createInstitutionalReader",
      "isInstitutionalRateWithinCap",
    ],
  ],
  [
    "packages/protocols/musd-redemptions",
    "musd-redemptions",
    [
      "RedemptionError",
      "calculateRedemptionCollateral",
      "calculateRedemptionFee",
      "calculateRedemptionLot",
      "calculateRedemptionPartialLimit",
      "createRedemptionReader",
      "createRedemptionTraceSimulator",
      "createRedemptionWriter",
      "decodeRedemptionAmounts",
    ],
  ],
] as const) {
  const path = resolve(root, directory);
  const files = await readdir(resolve(path, "dist"));
  assert(files.includes("index.js") && files.includes("index.d.ts"));
  for (const file of files.filter((file) => file.endsWith(".js")))
    assert(
      !/from\s+["'][^"']*knowledge\//.test(await readFile(resolve(path, "dist", file), "utf8")),
      "runtime knowledge import",
    );
  const source = `import assert from 'node:assert/strict'; const api = await import('@mezo-dev-kit/${name}'); assert.deepEqual(Object.keys(api).sort(), ${JSON.stringify(exports)}); await assert.rejects(import('@mezo-dev-kit/${name}/index'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: path,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
process.stdout.write(
  "Tokens, Incentives, Prices, Pools, Swaps and Institutional debt built entrypoints and deep-import boundaries passed.\n",
);
