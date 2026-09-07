import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const poolsDirectory = join(repositoryRoot, "knowledge", "protocols", "pools");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const Q96 = 1n << 96n;
const Q192 = 1n << 192n;
const minTick = -887272;
const maxTick = 887272;

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

async function json(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

function object(value: unknown, label: string): JsonObject {
  expect(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonObject;
}

function records(value: unknown, label: string): JsonObject[] {
  expect(Array.isArray(value), `${label} must be an array`);
  return value as JsonObject[];
}

function string(value: unknown, label: string): string {
  expect(typeof value === "string", `${label} must be a string`);
  return value;
}

function decoded(entry: unknown, label: string): unknown {
  return object(entry, label).decoded;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function tickToSqrtPriceX96(tick: number): bigint {
  expect(
    Number.isInteger(tick) && tick >= minTick && tick <= maxTick,
    `tick ${tick} is out of range`,
  );
  const absolute = Math.abs(tick);
  let ratio =
    (absolute & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  const multipliers: readonly (readonly [number, bigint])[] = [
    [0x2, 0xfff97272373d413259a46990580e213an],
    [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask, multiplier] of multipliers) {
    if ((absolute & mask) !== 0) ratio = (ratio * multiplier) >> 128n;
  }
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function amount0ForLiquidity(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return ((liquidity << 96n) * (sqrtB - sqrtA)) / sqrtB / sqrtA;
}

function amount1ForLiquidity(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (liquidity * (sqrtB - sqrtA)) / Q96;
}

function liquidity0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const intermediate = (sqrtA * sqrtB) / Q96;
  return (amount0 * intermediate) / (sqrtB - sqrtA);
}

function liquidity1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return (amount1 * Q96) / (sqrtB - sqrtA);
}

const index = await json(join(poolsDirectory, "index.json"));
const architectures = await json(join(poolsDirectory, "records", "architectures.json"));
const positions = await json(join(poolsDirectory, "records", "positions-gauges.json"));
const operations = await json(join(poolsDirectory, "records", "operations.json"));
const fixtures = await json(join(poolsDirectory, "fixtures", "math.json"));
const sources = await json(join(poolsDirectory, "sources", "catalog.json"));
const topology = await json(join(poolsDirectory, "evidence", "mainnet-topology-2026-08-23.json"));
const reproduction = await json(
  join(poolsDirectory, "evidence", "source-reproduction-2026-08-23.json"),
);
const deployments = await json(join(contractsDirectory, "records", "deployments.json"));
const abis = await json(join(contractsDirectory, "records", "abis.json"));

expect(index.moduleId === "protocols/pools", "pool module ID drifted");
expect(index.supportStatus === "supported", "pool knowledge support must be accepted");
expect(index.reviewStatus === "accepted", "pool review must be accepted");
const indexScope = object(index.scope, "index.scope");
const topologyScope = object(topology.scope, "topology.scope");
expect(
  indexScope.blockNumber === topologyScope.blockNumber,
  "index/topology block number mismatch",
);
expect(indexScope.blockHash === topologyScope.blockHash, "index/topology block hash mismatch");
expect(architectures.supportStatus === "supported", "architectures must be supported");
expect(positions.supportStatus === "supported", "position model must be supported");
expect(operations.supportStatus === "none", "operation requirements must not enable writers");
expect(operations.reviewStatus === "accepted", "operation requirements review must be accepted");

for (const architecture of records(architectures.architectures, "architectures.architectures")) {
  const architectureId = string(architecture.id, "architecture ID");
  for (const root of records(architecture.roots, `${architectureId}.roots`)) {
    const rootRole = string(root.role, "architecture root role");
    const reference = object(
      root.contractReference,
      `${architectureId}.${rootRole}.contractReference`,
    );
    const resolved = await loadKnowledgeReference(repositoryRoot, reference);
    const resolvedValue = object(resolved.value, "resolved Contract reference");
    expect(
      resolvedValue.id === reference.recordId,
      `${architectureId}.${rootRole} Contract reference drifted`,
    );
  }
}
for (const reference of records(operations.workflowReferences, "operations.workflowReferences")) {
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  const resourceId = string(reference.resourceId, "workflow resource ID");
  expect(resolved.resource.id === resourceId, `workflow reference ${resourceId} drifted`);
  if (reference.recordId) {
    const recordId = string(reference.recordId, "workflow record ID");
    expect(
      object(resolved.value, "resolved workflow reference").id === recordId,
      `workflow record ${recordId} drifted`,
    );
  }
}

const sourceRecords = records(sources.records, "sources.records");
for (const source of sourceRecords.filter((record) => record.reference)) {
  const sourceId = string(source.id, "source ID");
  const reference = object(source.reference, `${sourceId}.reference`);
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  expect(resolved.resource.id === reference.resourceId, `source reference ${sourceId} drifted`);
  if (reference.recordId)
    expect(
      object(resolved.value, "resolved source reference").id === reference.recordId,
      `source record ${sourceId} drifted`,
    );
}
for (const id of ["pools-mainnet-topology", "pools-source-reproduction"]) {
  const source = sourceRecords.find((record) => record.id === id);
  expect(source, `missing ${id} source record`);
  const path = join(poolsDirectory, string(source.path, `${id}.path`));
  expect(sha256(await readFile(path)) === source.sha256, `${id} evidence digest drifted`);
}

const expectedContracts = [
  "mezo-earn.cl-factory",
  "mezo-earn.cl-pool-implementation",
  "mezo-earn.cl-swap-router",
  "mezo-earn.cl-position-manager",
  "mezo-earn.cl-position-descriptor",
  "incentives.cl-gauge-factory",
  "incentives.cl-gauge-implementation",
];
const deploymentRecords = records(deployments.records, "deployments.records");
const abiRecords = records(abis.records, "abis.records");
for (const contractId of expectedContracts) {
  const deployment = deploymentRecords.find((record) => record.contractId === contractId);
  const abi = abiRecords.find((record) => record.contractId === contractId);
  expect(deployment, `missing accepted deployment ${contractId}`);
  expect(abi, `missing accepted ABI ${contractId}`);
  expect(deployment.supportStatus === "supported", `${contractId} deployment support drifted`);
  expect(abi.supportStatus === "supported", `${contractId} ABI support drifted`);
  expect(deployment.reviewStatus === "accepted", `${contractId} deployment review drifted`);
  expect(abi.reviewStatus === "accepted", `${contractId} ABI review drifted`);
  const artifactReference = object(abi.artifactReference, `${contractId}.artifactReference`);
  const artifactResourceId = string(
    artifactReference.resourceId,
    `${contractId}.artifactReference.resourceId`,
  );
  expect(artifactResourceId === `abi.${contractId}`, `${contractId} artifact resource drifted`);
  const artifactPath =
    join(contractsDirectory, "artifacts", "abis", ...contractId.split(".")) + ".json";
  expect(
    sha256(await readFile(artifactPath)) === abi.fileSha256,
    `${contractId} ABI file digest drifted`,
  );
}

const roots = object(topology.roots, "topology.roots");
expect(Object.keys(roots).length === 11, "topology root count drifted");
for (const [role, rootValue] of Object.entries(roots)) {
  const root = object(rootValue, `root ${role}`);
  const creation = object(root.creation, `${role}.creation`);
  expect(
    /^0x[a-f0-9]{64}$/.test(String(creation.blockHash)),
    `${role} creation block hash is not pinned`,
  );
  expect(creation.transactionStatus === "ok", `${role} creation transaction did not pass`);
}
const relationships = object(topology.relationships, "topology.relationships");
const relationshipExpected: readonly (readonly [string, string, string])[] = [
  ["basicRouter", "defaultFactory", "0x83fe469c636c4081b87ba5b3ae9991c6ed104248"],
  ["clFactory", "poolImplementation", "0x819cfadd7f5bc0854fa3b7f5749ea0410a943e5f"],
  ["clFactory", "factoryRegistry", "0x04b94f55780682478c8d8329368aaafd320f4d32"],
  ["clFactory", "voter", "0x48233ccc97b87ba93bca212cbee48e3210211f03"],
  ["clSwapRouter", "factory", "0xbb24af5c6fb88f1d191fa76055e30bf881beeb79"],
  ["positionManager", "factory", "0xbb24af5c6fb88f1d191fa76055e30bf881beeb79"],
  ["positionManager", "tokenDescriptor", "0x818f6ccfbee90202b967567bcf2a5fb9b73cfeca"],
  ["clGaugeFactory", "implementation", "0x8f11a90265f7a784b46fe326638ec37a5cc29c33"],
  ["clGaugeFactory", "nft", "0x509bc221df2b83927c695fa0bb0f5b21053c874c"],
  ["clGaugeFactory", "voter", "0x48233ccc97b87ba93bca212cbee48e3210211f03"],
];
for (const [role, field, expected] of relationshipExpected) {
  expect(
    decoded(object(relationships[role], role)[field], `${role}.${field}`) === expected,
    `${role}.${field} relationship drifted`,
  );
}

const discovery = object(topology.dynamicDiscovery, "topology.dynamicDiscovery");
const basic = object(discovery.basic, "dynamicDiscovery.basic");
const basicPools = records(basic.pools, "basic pools");
expect(
  basic.allPoolsLength === basicPools.length && basicPools.length > 0,
  "basic factory enumeration is incomplete",
);
expect(
  new Set(basicPools.map(({ address }) => address)).size === basicPools.length,
  "basic pool addresses repeat",
);
expect(
  basicPools.some(({ totalSupply }) => decoded(totalSupply, "basic totalSupply") === 0),
  "zero-supply basic state is untested",
);
for (const pool of basicPools) {
  const poolAddress = string(pool.address, "basic pool address");
  expect(
    String(decoded(pool.token0, "basic token0")) < String(decoded(pool.token1, "basic token1")),
    `basic pool ${poolAddress} token ordering drifted`,
  );
}

const concentrated = object(discovery.concentrated, "dynamicDiscovery.concentrated");
const clPools = records(concentrated.pools, "CL pools");
expect(
  concentrated.allPoolsLength === clPools.length && clPools.length > 0,
  "CL factory enumeration is incomplete",
);
expect(
  clPools.some(({ liquidity }) => decoded(liquidity, "CL liquidity") === 0),
  "zero active-liquidity CL state is untested",
);
expect(
  clPools.some(({ gauge }) => gauge === null),
  "optional missing CL gauge state is untested",
);
expect(
  clPools.some(
    ({ liquidity, stakedLiquidity }) =>
      decoded(liquidity, "liquidity") !== decoded(stakedLiquidity, "stakedLiquidity"),
  ),
  "active and staked liquidity were not distinguished",
);
for (const pool of clPools) {
  const poolAddress = string(pool.address, "CL pool address");
  expect(
    String(decoded(pool.token0, "CL token0")) < String(decoded(pool.token1, "CL token1")),
    `CL pool ${poolAddress} token ordering drifted`,
  );
  if (pool.gauge === null) continue;
  const gauge = object(pool.gauge, "CL gauge");
  const gaugeAddress = string(gauge.address, "CL gauge address");
  const recognized = object(
    object(gauge.factoryRecognizesGauge, "factoryRecognizesGauge").isGauge,
    "isGauge",
  );
  expect(recognized.decoded === true, `gauge ${gaugeAddress} is not recognized by its factory`);
  const state = object(gauge.state, "gauge.state");
  expect(decoded(state.pool, "gauge.pool") === pool.address, `gauge ${gaugeAddress} pool mismatch`);
  expect(
    decoded(state.nft, "gauge.nft") === "0x509bc221df2b83927c695fa0bb0f5b21053c874c",
    `gauge ${gaugeAddress} NFT mismatch`,
  );
  expect(
    decoded(state.tickSpacing, "gauge.tickSpacing") ===
      decoded(pool.tickSpacing, "pool.tickSpacing"),
    `gauge ${gaugeAddress} spacing mismatch`,
  );
}

const reproductionRecords = records(reproduction.records, "reproduction.records");
expect(
  reproductionRecords.length === expectedContracts.length,
  "source reproduction count drifted",
);
for (const record of reproductionRecords) {
  const contractId = string(record.contractId, "reproduction contract ID");
  const exact = object(record.reproduction, `${contractId}.reproduction`);
  expect(exact.creationExecutableExact === true, `${contractId} creation reproduction failed`);
  expect(
    exact.runtimeExecutableExactAfterImmutableSubstitution === true,
    `${contractId} runtime reproduction failed`,
  );
}
const descriptor = reproductionRecords.find(
  ({ contractId }) => contractId === "mezo-earn.cl-position-descriptor",
);
expect(descriptor, "descriptor reproduction is missing");
const descriptorVerification = object(descriptor.explorerVerification, "descriptor verification");
expect(
  descriptorVerification.isPartiallyVerified === true &&
    descriptorVerification.isFullyVerified === false,
  "descriptor partial verification label was not preserved",
);

const requirementText = JSON.stringify(operations);
for (const phrase of [
  "Zero amountOutMinimum",
  "implicit unlimited approval is prohibited",
  "current nonzero factory mapping",
  "Simulate the exact call",
]) {
  expect(requirementText.includes(phrase), `operation boundary '${phrase}' is missing`);
}
const ownershipText = JSON.stringify(positions);
for (const phrase of [
  "ownerOf(tokenId) is the CLGauge contract",
  "beneficialDepositor as null/unknown",
  "not the beneficial/depositor identity",
]) {
  expect(ownershipText.includes(phrase), `ownership boundary '${phrase}' is missing`);
}

const fixtureRecords = records(fixtures.records, "fixtures.records");
expect(
  new Set(fixtureRecords.map(({ id }) => id)).size === fixtureRecords.length,
  "fixture IDs repeat",
);
for (const fixture of fixtureRecords) {
  const fixtureId = string(fixture.id, "fixture ID");
  const input = object(fixture.input, `${fixtureId}.input`);
  const expected = object(fixture.expected, `${fixtureId}.expected`);
  switch (fixture.operation) {
    case "sqrt-ratio-at-tick":
      expect(
        tickToSqrtPriceX96(Number(input.tick)).toString() === expected.sqrtPriceX96,
        `${fixtureId} sqrt ratio drifted`,
      );
      break;
    case "usable-tick-bounds": {
      const spacing = Number(input.tickSpacing);
      expect(
        Math.ceil(minTick / spacing) * spacing === expected.minUsableTick,
        `${fixtureId} min usable tick drifted`,
      );
      expect(
        Math.floor(maxTick / spacing) * spacing === expected.maxUsableTick,
        `${fixtureId} max usable tick drifted`,
      );
      break;
    }
    case "tick-boundary-classification": {
      const tick = Number(input.tick);
      const spacing = Number(input.tickSpacing);
      expect(
        (tick >= minTick && tick <= maxTick) === expected.representableRead,
        `${fixtureId} read classification drifted`,
      );
      expect(
        (tick >= minTick && tick <= maxTick && tick % spacing === 0) ===
          expected.validPositionBoundary,
        `${fixtureId} write classification drifted`,
      );
      break;
    }
    case "raw-price-rational": {
      const sqrtPrice = BigInt(string(input.sqrtPriceX96, `${fixtureId}.sqrtPriceX96`));
      expect(
        (sqrtPrice * sqrtPrice).toString() === expected.numerator,
        `${fixtureId} numerator drifted`,
      );
      expect(Q192.toString() === expected.denominator, `${fixtureId} denominator drifted`);
      break;
    }
    case "amounts-for-liquidity": {
      const current = BigInt(string(input.sqrtCurrentX96, `${fixtureId}.current`));
      const lower = BigInt(string(input.sqrtLowerX96, `${fixtureId}.lower`));
      const upper = BigInt(string(input.sqrtUpperX96, `${fixtureId}.upper`));
      const liquidity = BigInt(string(input.liquidity, `${fixtureId}.liquidity`));
      const amount0 =
        current <= lower
          ? amount0ForLiquidity(lower, upper, liquidity)
          : current < upper
            ? amount0ForLiquidity(current, upper, liquidity)
            : 0n;
      const amount1 =
        current <= lower
          ? 0n
          : current < upper
            ? amount1ForLiquidity(lower, current, liquidity)
            : amount1ForLiquidity(lower, upper, liquidity);
      expect(amount0.toString() === expected.amount0, `${fixtureId} amount0 drifted`);
      expect(amount1.toString() === expected.amount1, `${fixtureId} amount1 drifted`);
      break;
    }
    case "liquidity-for-amounts": {
      const current = BigInt(string(input.sqrtCurrentX96, `${fixtureId}.current`));
      const lower = BigInt(string(input.sqrtLowerX96, `${fixtureId}.lower`));
      const upper = BigInt(string(input.sqrtUpperX96, `${fixtureId}.upper`));
      const l0 = liquidity0(current, upper, BigInt(string(input.amount0, `${fixtureId}.amount0`)));
      const l1 = liquidity1(lower, current, BigInt(string(input.amount1, `${fixtureId}.amount1`)));
      expect(l0.toString() === expected.liquidity0, `${fixtureId} liquidity0 drifted`);
      expect(l1.toString() === expected.liquidity1, `${fixtureId} liquidity1 drifted`);
      expect(
        (l0 < l1 ? l0 : l1).toString() === expected.liquidity,
        `${fixtureId} liquidity drifted`,
      );
      break;
    }
    case "dynamic-row-classification": {
      const usable =
        input.networkMatches === true &&
        input.blockMatches === true &&
        input.factoryMappingValidated === true &&
        input.bytecodePresent === true &&
        input.identityFieldsComplete === true;
      expect(
        usable === expected.usableForExecution,
        `${fixtureId} execution classification drifted`,
      );
      expect(
        !usable === expected.preserveAsPartialObservation,
        `${fixtureId} observation classification drifted`,
      );
      break;
    }
    case "basic-volatile-invariant":
      expect(
        (
          BigInt(string(input.reserve0, "reserve0")) * BigInt(string(input.reserve1, "reserve1"))
        ).toString() === expected.k,
        `${fixtureId} invariant drifted`,
      );
      break;
    case "basic-stable-invariant": {
      const x =
        BigInt(string(input.reserve0, "reserve0")) * 10n ** BigInt(18 - Number(input.decimals0));
      const y =
        BigInt(string(input.reserve1, "reserve1")) * 10n ** BigInt(18 - Number(input.decimals1));
      const a = (x * y) / 10n ** 18n;
      const b = (x * x) / 10n ** 18n + (y * y) / 10n ** 18n;
      expect(
        ((a * b) / 10n ** 18n).toString() === expected.k,
        `${fixtureId} stable invariant drifted`,
      );
      break;
    }
    default:
      fail(`unsupported fixture operation '${string(fixture.operation, "fixture operation")}'`);
  }
}

process.stdout.write(
  `validated ${fixtureRecords.length} pool math fixtures, ${basicPools.length} basic observations, ${clPools.length} CL observations, and ${expectedContracts.length} accepted CL roots\n`,
);
