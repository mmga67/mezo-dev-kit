import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

type JsonObject = Record<string, unknown>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(repositoryRoot, "knowledge", "workflows", "swaps");

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

function objects(value: unknown, label: string): JsonObject[] {
  expect(Array.isArray(value), `${label} must be an array`);
  return value as JsonObject[];
}

function values(value: unknown, label: string): unknown[] {
  expect(Array.isArray(value), `${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  expect(typeof value === "string", `${label} must be a string`);
  return value;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function byId(records: JsonObject[], id: string, label: string): JsonObject {
  const record = records.find((candidate) => candidate.id === id);
  expect(record, `${label} is missing ${id}`);
  return record;
}

function packSignedInt24(value: number): string {
  expect(Number.isInteger(value), "tick spacing must be an integer");
  expect(value >= -(1 << 23) && value < 1 << 23, "tick spacing is outside int24");
  const encoded = value < 0 ? (1 << 24) + value : value;
  return encoded.toString(16).padStart(6, "0");
}

function packExactInputPath(tokens: string[], tickSpacings: number[]): string {
  expect(tokens.length === tickSpacings.length + 1, "CL path arity mismatch");
  const addresses = tokens.map((token) => {
    expect(/^0x[a-f0-9]{40}$/.test(token), `invalid token address ${token}`);
    return token.slice(2);
  });
  const firstAddress = addresses[0];
  expect(firstAddress !== undefined, "CL path has no first token");
  let packed = firstAddress;
  for (let index = 0; index < tickSpacings.length; index += 1) {
    const spacing = tickSpacings[index];
    const address = addresses[index + 1];
    expect(spacing !== undefined && address !== undefined, "CL path segment is incomplete");
    packed += `${packSignedInt24(spacing)}${address}`;
  }
  return `0x${packed}`;
}

const index = await json(join(moduleDirectory, "index.json"));
const providers = await json(join(moduleDirectory, "records", "providers.json"));
const routes = await json(join(moduleDirectory, "records", "routes.json"));
const execution = await json(join(moduleDirectory, "records", "execution.json"));
const fixtures = await json(join(moduleDirectory, "fixtures", "routes.json"));
const sources = await json(join(moduleDirectory, "sources", "catalog.json"));
const evidencePath = join(moduleDirectory, "evidence", "mainnet-routing-2026-08-25.json");
const evidence = await json(evidencePath);

expect(index.moduleId === "workflows/swaps", "swap module ID drifted");
expect(index.status === "verified", "swap model must remain verified evidence");
expect(index.supportStatus === "none", "swap module must not expose runtime support");
expect(index.reviewStatus === "accepted", "swap module review acceptance drifted");
for (const [label, record] of [
  ["providers", providers],
  ["routes", routes],
  ["execution", execution],
  ["fixtures", fixtures],
  ["sources", sources],
  ["evidence", evidence],
] as const) {
  expect(record.owner === "workflows/swaps", `${label} owner drifted`);
  expect(record.supportStatus === "none", `${label} must not enable support`);
  expect(record.reviewStatus === "accepted", `${label} review acceptance drifted`);
}

const providerRecords = objects(providers.records, "providers.records");
expect(providerRecords.length === 2, "expected exactly two deployed swap providers");
const basicProvider = byId(providerRecords, "basic-router", "providers");
const clProvider = byId(providerRecords, "concentrated-liquidity-router", "providers");
for (const provider of providerRecords) {
  const providerId = text(provider.id, "provider ID");
  for (const field of ["contractReference", "abiReference"] as const) {
    const reference = object(provider[field], `${providerId}.${field}`);
    const resolved = await loadKnowledgeReference(repositoryRoot, reference);
    const resolvedValue = object(resolved.value, `${providerId}.${field} resolved value`);
    expect(resolvedValue.id === reference.recordId, `${providerId}.${field} drifted`);
    expect(resolvedValue.supportStatus === "supported", `${providerId}.${field} is unsupported`);
    expect(resolvedValue.reviewStatus === "accepted", `${providerId}.${field} is unaccepted`);
    if (field === "contractReference") {
      expect(resolvedValue.address === provider.address, `${providerId} address drifted`);
    }
  }
  expect(provider.approvalSpender === provider.address, `${providerId} spender drifted`);
}

const basicAbi = JSON.parse(
  await readFile(
    join(repositoryRoot, "knowledge", "contracts", "artifacts", "abis", "mezo-earn", "router.json"),
    "utf8",
  ),
) as JsonObject[];
const clAbi = JSON.parse(
  await readFile(
    join(
      repositoryRoot,
      "knowledge",
      "contracts",
      "artifacts",
      "abis",
      "mezo-earn",
      "cl-swap-router.json",
    ),
    "utf8",
  ),
) as JsonObject[];
const basicFunctions = new Set(
  basicAbi.filter(({ type }) => type === "function").map(({ name }) => name),
);
const clFunctions = new Set(
  clAbi.filter(({ type }) => type === "function").map(({ name }) => name),
);
for (const name of [
  "getAmountsOut",
  "swapExactTokensForTokens",
  "UNSAFE_swapExactTokensForTokens",
]) {
  expect(basicFunctions.has(name), `basic Router ABI is missing ${name}`);
}
for (const name of ["exactInputSingle", "exactInput", "exactOutput", "multicall", "refundBTC"]) {
  expect(clFunctions.has(name), `CL Router ABI is missing ${name}`);
}
expect(!clFunctions.has("quoteExactInput"), "CL Router unexpectedly gained a quote method");
expect(object(clProvider.quote, "CL quote").method === null, "CL Quoter must remain absent");
expect(
  values(
    object(basicProvider.execution, "basic execution").disabledEntrypoints,
    "basic disabled",
  ).includes("UNSAFE_swapExactTokensForTokens"),
  "unsafe basic entrypoint must remain disabled",
);

const routeRecords = objects(routes.records, "routes.records");
for (const id of [
  "basic-route",
  "concentrated-liquidity-route",
  "atomic-mixed-route",
  "universal-router-command-stream",
]) {
  byId(routeRecords, id, "routes");
}
expect(
  byId(routeRecords, "atomic-mixed-route", "routes").disposition ===
    "unsupported-no-deployed-composer",
  "atomic mixed routing must fail closed",
);
expect(
  byId(routeRecords, "universal-router-command-stream", "routes").disposition ===
    "rejected-not-deployed",
  "Universal Router candidate must remain rejected",
);

const fixtureRecords = objects(fixtures.records, "fixtures.records");
expect(fixtureRecords.length === 15, "swap fixture count drifted");
const expectedCases = new Set([
  "route-encoding",
  "amount-boundary",
  "unsupported-family",
  "pool-state",
  "freshness",
  "slippage",
  "approval",
  "partial-provider",
  "simulation",
  "reconciliation",
]);
for (const caseName of expectedCases) {
  expect(
    fixtureRecords.some((record) => record.case === caseName),
    `fixture case ${caseName} is missing`,
  );
}
for (const id of ["cl-direct-packed-path", "cl-multihop-packed-path"]) {
  const fixture = byId(fixtureRecords, id, "fixtures");
  const input = object(fixture.input, `${id}.input`);
  const expected = object(fixture.expected, `${id}.expected`);
  const packed = packExactInputPath(
    values(input.tokens, `${id}.tokens`).map((token) => text(token, `${id}.token`)),
    values(input.tickSpacings, `${id}.tickSpacings`).map((spacing) => Number(spacing)),
  );
  expect(packed === expected.path, `${id} packed path drifted`);
  expect((packed.length - 2) / 2 === expected.byteLength, `${id} byte length drifted`);
}
const amountFixture = byId(fixtureRecords, "minimum-output-floor", "fixtures");
const amountInput = object(amountFixture.input, "minimum-output-floor.input");
const amountExpected = object(amountFixture.expected, "minimum-output-floor.expected");
const calculatedMinimum =
  (BigInt(text(amountInput.quotedAmountOut, "quotedAmountOut")) *
    (10_000n - BigInt(Number(amountInput.slippageBps)))) /
  10_000n;
expect(
  calculatedMinimum.toString() === amountExpected.amountOutMinimum,
  "minimum output rounding drifted",
);

const sourceRecords = objects(sources.records, "sources.records");
for (const source of sourceRecords.filter((record) => record.reference)) {
  const sourceId = text(source.id, "source ID");
  const reference = object(source.reference, `${sourceId}.reference`);
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  expect(resolved.resource.id === reference.resourceId, `${sourceId} resource reference drifted`);
  if (reference.recordId !== undefined) {
    expect(
      object(resolved.value, `${sourceId}.resolvedValue`).id === reference.recordId,
      `${sourceId} record reference drifted`,
    );
  }
}
const localSource = byId(sourceRecords, "swap-mainnet-routing-evidence", "sources");
expect(
  sha256(await readFile(evidencePath)) === localSource.sha256,
  "swap mainnet evidence digest drifted",
);

const scope = object(evidence.scope, "evidence.scope");
expect(scope.chainId === 31612, "swap evidence chain ID drifted");
expect(scope.currentBlockNumber === 11376104, "swap evidence block drifted");
expect(
  /^0x[a-f0-9]{64}$/.test(text(scope.currentBlockHash, "block hash")),
  "block hash is invalid",
);
const rpcCapability = object(evidence.rpcCapability, "evidence.rpcCapability");
expect(
  values(rpcCapability.observedMethods, "observedMethods").includes("eth_call"),
  "eth_call capability is not evidenced",
);
expect(
  text(rpcCapability.historicalEthCall, "historicalEthCall").startsWith("verified"),
  "historical eth_call capability is not evidenced",
);

const roots = object(evidence.currentRoots, "evidence.currentRoots");
const basicRoot = object(roots.basicRouter, "basic root");
const clRoot = object(roots.concentratedLiquidityRouter, "CL root");
expect(basicRoot.address === basicProvider.address, "basic evidence/provider address mismatch");
expect(clRoot.address === clProvider.address, "CL evidence/provider address mismatch");
expect(
  basicRoot.codeSha256 === "ee6ee375e9bf6bbf9c28165a7c933fec7b8516d223f89e8406ed34cea2fd9112",
  "basic Router code hash drifted",
);
expect(
  clRoot.codeSha256 === "3cb4fa6e48fe0e6ac4e448e3991e5a66bb33cd1e93d3f2054bffef0de180598e",
  "CL Router code hash drifted",
);
expect(clRoot.quoter === null, "evidence must not invent a Quoter");

const replays = objects(evidence.historicalReplays, "historicalReplays");
expect(replays.length === 2, "historical replay count drifted");
const basicReplay = byId(replays, "basic-two-hop-exact-input", "historical replays");
const basicDecoded = object(basicReplay.decoded, "basic decoded");
const basicCall = object(basicReplay.previousBlockEthCall, "basic call");
const basicReceipt = object(basicReplay.receipt, "basic receipt");
const basicAmounts = values(basicCall.amounts, "basic call amounts");
expect(basicCall.status === "success", "basic previous-block call failed");
expect(basicReceipt.status === "success", "basic historical receipt failed");
expect(basicDecoded.hopCount === 2, "basic historical route is not multi-hop");
expect(
  basicAmounts.at(-1) === basicReceipt.recipientOutputTransferred,
  "basic replay/output mismatch",
);
expect(
  BigInt(text(basicReceipt.recipientOutputTransferred, "basic output")) >=
    BigInt(text(basicDecoded.amountOutMinimum, "basic minimum")),
  "basic historical output violated its minimum",
);

const clReplay = byId(replays, "cl-direct-exact-input", "historical replays");
const clDecoded = object(clReplay.decoded, "CL decoded");
const clCall = object(clReplay.previousBlockEthCall, "CL call");
const clReceipt = object(clReplay.receipt, "CL receipt");
const safety = object(clReplay.safetyDisposition, "CL safety disposition");
expect(clCall.status === "success", "CL previous-block call failed");
expect(clReceipt.status === "success", "CL historical receipt failed");
expect(clCall.amountOut === clReceipt.recipientOutputTransferred, "CL replay/output mismatch");
expect(clDecoded.amountOutMinimum === "0", "CL negative zero-minimum evidence drifted");
expect(safety.reusableCallTemplate === false, "unsafe CL transaction became a reusable template");

const phases = objects(execution.phases, "execution.phases");
const phaseIds = phases.map(({ id }) => id);
expect(
  phaseIds.join(",") === "discover,quote,rank,compile,approve,simulate,submit-track,reconcile",
  "swap lifecycle ordering drifted",
);
for (const reference of objects(execution.references, "execution.references")) {
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  const resourceId = text(reference.resourceId, "execution reference resource ID");
  expect(resolved.resource.id === resourceId, `execution reference ${resourceId} drifted`);
}

process.stdout.write(
  `Validated swap knowledge: ${providerRecords.length} providers, ${routeRecords.length} route dispositions, ${fixtureRecords.length} fixtures, and ${replays.length} exact historical replays; support remains none.\n`,
);
