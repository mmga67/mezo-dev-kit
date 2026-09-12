import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const [directory, name, exports] of [
  [
    "packages/bridges",
    "bridges",
    [
      "NativeObserverError",
      "NttObserverError",
      "createNativeDeliveryObserver",
      "createNttDeliveryObserver",
    ],
  ],
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
      "calculateCLGaugeEarned",
      "calculateLockEnd",
      "calculateLockVotingPower",
      "calculateRebaseClaim",
      "calculateVotingEpoch",
      "createCLGaugeReader",
      "createCLGaugeTargetResolver",
      "createCLGaugeWriter",
      "createGaugeReader",
      "createGaugeTargetResolver",
      "createGaugeWriter",
      "createLockReader",
      "createLockTargetResolver",
      "createLockWriter",
      "createRebaseReader",
      "createRebaseWriter",
      "createVotingReader",
      "createVotingRewardReader",
      "createVotingRewardWriter",
      "createVotingWriter",
      "forecastCLGauge",
      "forecastLock",
      "forecastRebaseClaim",
      "forecastVoting",
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
      "calculateCLAmounts",
      "calculateCLFees",
      "calculateCLLiquidity",
      "calculateCLSwapFeeSplit",
      "calculateCLSwapStep",
      "createBasicLiquidityWriter",
      "createBasicPoolFeeWriter",
      "createBasicPoolReader",
      "createBasicPoolTargetResolver",
      "createCLPoolReader",
      "createCLPositionTargetResolver",
      "createCLPositionWriter",
      "findCLBitmapTick",
      "forecastBasicLiquidity",
      "forecastCLPosition",
      "getCLBitmapLocation",
      "getCLTickAtSqrtRatio",
      "getCLTickSqrtRatio",
      "getCLUsableTicks",
      "sortBasicPoolKey",
      "sortCLPoolKey",
    ],
  ],
  [
    "packages/swaps",
    "swaps",
    [
      "SwapError",
      "createBasicSwapReader",
      "createBasicSwapWriter",
      "createCLSwapReader",
      "createCLSwapTargetResolver",
      "createCLSwapWriter",
      "encodeCLSwapPath",
      "rankBasicSwapQuotes",
      "validateBasicSwapRoute",
      "validateCLSwapRoute",
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
process.stdout.write("Private SDK runtime entrypoints and deep-import boundaries passed.\n");
const quoteSource = `import assert from 'node:assert/strict';
const api = await import('@mezo-dev-kit/swaps/quotes');
assert.deepEqual(Object.keys(api).sort(), ['SwapError', 'createBasicSwapReader', 'createCLSwapReader', 'createSwapQuoteReader', 'encodeCLSwapPath', 'rankBasicSwapQuotes', 'validateBasicSwapRoute', 'validateCLSwapRoute']);
await assert.rejects(import('@mezo-dev-kit/swaps/quote-reader'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
`;
const quoteCheck = spawnSync(process.execPath, ["--input-type=module", "--eval", quoteSource], {
  cwd: resolve(root, "packages/swaps"),
  encoding: "utf8",
});
assert.equal(quoteCheck.status, 0, quoteCheck.stderr);
process.stdout.write("Read-only Swaps subpath exports and deep-import boundary passed.\n");
