import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as Evm from "@mezo-dev-kit/evm";
import {
  object,
  objects,
  parseJson,
  requiredRecord,
  text,
  texts,
  type JsonObject,
} from "./json.ts";
import { loadKnowledgeReference } from "./knowledge-reference.ts";

type EvidenceEvm = Pick<
  typeof Evm,
  | "parseAddress"
  | "parseHexData"
  | "parseHash32"
  | "parseRpcQuantity"
  | "parseUnsignedInteger"
  | "parseUint"
  | "decodeFunctionResult"
>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`third-party incentives: ${message}`);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

/** Match the existing incentives reproduction algorithm; explorer labels are not source bytes. */
function sourceDigest(source: JsonObject): string {
  return sha256(
    JSON.stringify(
      canonicalize({
        filePath: text(source.file_path, "source path"),
        sourceCode: text(source.source_code, "source code"),
        additionalSources: [...objects(source.additional_sources, "additional sources")].sort(
          (a, b) =>
            text(a.file_path, "source path").localeCompare(text(b.file_path, "source path")),
        ),
      }),
    ),
  );
}

function abiDigest(value: unknown): string {
  return sha256(
    JSON.stringify(
      objects(value, "ABI")
        .map((entry) => JSON.stringify(canonicalize(entry)))
        .sort(),
    ),
  );
}

function sourceFile(source: JsonObject, path: string): string {
  if (source.file_path === path) return text(source.source_code, path);
  return text(
    requiredRecord(
      objects(source.additional_sources, "additional sources"),
      "file_path",
      path,
      "source file",
    ).source_code,
    path,
  );
}

/** The selected functions contain no brace-bearing strings or comments. Fail if their boundaries change. */
function functionBody(source: string, name: string): string {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  assert(start !== -1 && !source.includes(signature, start + 1), `ambiguous or missing ${name}`);
  const opening = source.indexOf("{", start);
  assert(opening !== -1, `missing body for ${name}`);
  let depth = 0;
  for (let i = opening; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated source function ${name}`);
}

/** Resolve the declared public export, as the offline context ABI tool does. */
async function loadEvm(): Promise<EvidenceEvm> {
  const packageRoot = fileURLToPath(new URL("../../packages/evm/", import.meta.url));
  const manifest = object(
    parseJson(await readFile(resolve(packageRoot, "package.json"), "utf8"), "EVM manifest"),
    "EVM manifest",
  );
  assert(manifest.name === "@mezo-dev-kit/evm", "EVM package identity differs");
  const entry = text(
    object(object(manifest.exports, "exports")["."], "public export").import,
    "public ESM entry",
  );
  const loaded = object(
    await import(pathToFileURL(resolve(packageRoot, entry)).href),
    "EVM public exports",
  );
  for (const name of [
    "parseAddress",
    "parseHexData",
    "parseHash32",
    "parseRpcQuantity",
    "parseUnsignedInteger",
    "parseUint",
    "decodeFunctionResult",
  ]) {
    assert(typeof loaded[name] === "function", `EVM public ${name} build missing`);
  }
  // The checked manifest/public entry owns these signatures; no source deep import is used.
  return loaded as EvidenceEvm;
}

function lifecycle(record: JsonObject): void {
  assert(
    record.status === "verified" && record.supportStatus === "none",
    "knowledge must not enable operation support",
  );
  assert(
    ["pending-qualified-review", "accepted"].includes(text(record.reviewStatus, "review status")),
    "qualified review boundary missing",
  );
  assert(
    Number.isFinite(Date.parse(text(record.verifiedAt, "verifiedAt"))),
    "verification date missing",
  );
  assert(texts(record.limitations, "limitations").length > 0, "limitations missing");
}

export interface ThirdPartyEpoch {
  readonly week: bigint;
  readonly voteStartOffset: bigint;
  readonly voteEndOffset: bigint;
}

/** Source-level guard result only; it proves no owner, balance, target or transaction eligibility. */
export function thirdPartyVoteGuard(
  input: {
    readonly timestamp: bigint;
    readonly lastVoted: bigint;
    readonly action: "vote" | "reset";
    readonly whitelisted: boolean;
  },
  epoch: ThirdPartyEpoch,
): "eligible" | "AlreadyVotedOrDeposited" | "DistributeWindow" | "NotWhitelistedNFT" {
  assert(input.timestamp >= 0n && input.lastVoted >= 0n, "negative timestamp");
  assert(
    epoch.week > 0n &&
      epoch.voteStartOffset >= 0n &&
      epoch.voteEndOffset > epoch.voteStartOffset &&
      epoch.voteEndOffset < epoch.week,
    "invalid epoch bounds",
  );
  const start = input.timestamp - (input.timestamp % epoch.week);
  if (start <= input.lastVoted) return "AlreadyVotedOrDeposited";
  if (input.timestamp <= start + epoch.voteStartOffset) return "DistributeWindow";
  if (
    input.action === "vote" &&
    !input.whitelisted &&
    input.timestamp > start + epoch.voteEndOffset
  )
    return "NotWhitelistedNFT";
  return "eligible";
}

/** Validate accounting completeness without interpreting unknown settlement as zero or success. */
export function validateThirdPartySnapshot(value: unknown): void {
  const evidence = object(value, "third-party evidence");
  lifecycle(evidence);
  const snapshot = object(evidence.networkSnapshot, "network snapshot");
  assert(
    snapshot.networkId === "mezo-mainnet" && snapshot.chainId === "31612",
    "network identity differs",
  );
  const scope = object(evidence.scope, "scope");
  assert(scope.evidenceBlockNumber === snapshot.blockNumber, "scope and snapshot blocks differ");
  const state = object(evidence.state, "state");
  const gauges = objects(evidence.gauges, "gauges");
  assert(
    Number.isSafeInteger(state.gaugeCount) && state.gaugeCount === gauges.length,
    "incomplete gauge enumeration",
  );
  assert(
    gauges.every((gauge, index) => gauge.index === index),
    "gauge indices must be ordered and complete",
  );
  const addresses = gauges.map((gauge) => text(gauge.address, "gauge address"));
  assert(new Set(addresses).size === addresses.length, "duplicate gauge address");
  for (const gauge of gauges) {
    assert(typeof gauge.alive === "boolean", "gauge liveness missing");
    if (gauge.alive)
      assert(
        typeof gauge.beneficiary === "string" && typeof gauge.metadata === "string",
        "active gauge mapping missing",
      );
  }
  const settlement = object(evidence.settlement, "settlement");
  assert(
    settlement.status === "unverified" &&
      settlement.voterDistributionReceipt === null &&
      settlement.remoteDepositReceipt === null &&
      settlement.lpClaimReceipt === null,
    "unreconciled delivery must remain unverified",
  );
  assert(text(settlement.reason, "settlement reason").length > 0, "missing delivery gap reason");
}

export function validateThirdPartyModel(value: unknown): void {
  const model = object(value, "third-party model");
  lifecycle(model);
  const voting = object(model.voting, "voting");
  assert(voting.asset === "veMEZO" && voting.target === "gauge address", "wrong voting domain");
  assert(
    voting.functionSignature === "vote(uint256,address[],uint256[])" &&
      voting.resetSignature === "reset(uint256)",
    "vote ABI semantics differ",
  );
  const destinations = objects(model.destinations, "destinations");
  assert(
    destinations.length > 0 && new Set(destinations.map((d) => d.id)).size === destinations.length,
    "destination identities missing or duplicated",
  );
  for (const destination of destinations) {
    assert(
      destination.distributionStatus === "documented-not-reconciled",
      "documentation cannot establish settled delivery",
    );
    const mechanism = text(destination.mechanism, "mechanism");
    if (mechanism === "merkl-campaign") {
      assert(
        destination.directRecipient === "liquidity providers" &&
          destination.directReward === "veMEZO" &&
          destination.lpReward === "veMEZO",
        "Merkl recipient or reward branch differs",
      );
    } else {
      assert(mechanism === "aerodrome-voting-incentive", "unknown distribution mechanism");
      assert(
        destination.directRecipient === "veAERO voters" &&
          destination.directReward === "MEZO" &&
          destination.lpReward === "AERO",
        "Aerodrome voter and LP reward branches conflated",
      );
    }
  }
  assert(
    objects(model.conflicts, "conflicts").some(
      (c) =>
        c.id === "third-party-voting-window-and-frequency" &&
        c.status === "conflicting-documentation",
    ),
    "voting documentation conflict lost",
  );
  assert(
    objects(model.deliveryGaps, "delivery gaps").every((gap) => gap.status === "unverified"),
    "delivery gaps silently promoted",
  );
}

/** Offline validation of source identity, raw/decoded observations, domain bindings and retained docs. */
export async function validateThirdPartyIncentives(root: string): Promise<void> {
  const evm = await loadEvm();
  const uint = (value: unknown, field: string) =>
    evm.parseUint(evm.parseUnsignedInteger(value, field), 256, field);
  const codeHash = (value: unknown) => sha256(Buffer.from(evm.parseHexData(value).slice(2), "hex"));
  const load = async (reference: unknown) => (await loadKnowledgeReference(root, reference)).value;
  const ir = (resourceId: string) => ({ moduleId: "protocols/incentives", resourceId });
  const cr = (resourceId: string, recordId?: string) => ({
    moduleId: "contracts",
    resourceId,
    ...(recordId ? { recordId } : {}),
  });
  const model = object(await load(ir("incentives-third-party-voting-rewards")), "model");
  const evidence = object(await load(ir("incentives-third-party-mainnet")), "evidence");
  validateThirdPartyModel(model);
  validateThirdPartySnapshot(evidence);
  const catalog = object(await load(cr("third-party-voter-source")), "source record");
  lifecycle(catalog);
  const deployment = object(await load(catalog.contractReference), "deployment");
  const previous = object(await load(catalog.reproductionReference), "prior reproduction");
  const retained = await loadKnowledgeReference(root, catalog.artifactReference);
  const source = object(retained.value, "source");
  assert(
    sha256(await readFile(retained.path)) === catalog.artifactSha256,
    "retained explorer capture changed",
  );
  const reproduction = object(previous.reproduction, "reproduction");
  assert(
    sourceDigest(source) === reproduction.sourceBundleSha256,
    "source differs from accepted reproduction",
  );
  const abi = await load(catalog.abiReference);
  assert(abiDigest(abi) === abiDigest(source.abi), "ABI differs from canonical contract ABI");
  const priorExplorer = object(
    object(previous.explorer, "explorer").activeContract,
    "active contract",
  );
  assert(
    source.is_verified === priorExplorer.isVerified &&
      source.is_fully_verified === priorExplorer.isFullyVerified &&
      source.is_partially_verified === priorExplorer.isPartiallyVerified,
    "explorer verification labels drifted",
  );
  const inherited = sourceFile(source, "contracts/NonStakingVoter.sol");
  const timeSource = sourceFile(source, "contracts/libraries/ProtocolTimeLibrary.sol");
  assert(
    inherited.includes("external onlyNewEpoch(_tokenId) nonReentrant") &&
      inherited.includes("lastVoted[_tokenId] = _timestamp;"),
    "direct vote epoch restriction changed",
  );
  assert(
    inherited.includes("ProtocolTimeLibrary.epochStart(block.timestamp) <=") &&
      inherited.includes("block.timestamp <=") &&
      inherited.includes("!isWhitelistedNFT[_tokenId]"),
    "vote window guards changed",
  );
  assert(
    timeSource.includes("WEEK = 7 days") &&
      timeSource.includes("+ 1 hours") &&
      timeSource.includes("+ WEEK - 1 hours"),
    "shared epoch source changed",
  );
  const validatorSource = object(await load(cr("voting-validator-source")), "validator source");
  // The retained generations use different compiler pragmas. Compare only the
  // exact shared function bodies before referencing their existing arithmetic.
  const validatorInherited = sourceFile(validatorSource, "contracts/NonStakingVoter.sol");
  for (const method of ["_vote", "notifyRewardAmount", "_updateFor", "_distribute"]) {
    assert(
      functionBody(inherited, method) === functionBody(validatorInherited, method),
      `shared ${method} arithmetic diverged`,
    );
  }
  const topology = object(model.topology, "topology");
  const voterRole = object(await load(topology.voterReference), "voter role");
  assert(
    object(await load(voterRole.deploymentReference), "voter deployment").id === deployment.id,
    "voter role identity differs",
  );
  const escrowRole = object(await load(topology.escrowReference), "escrow role");
  const escrow = object(await load(escrowRole.deploymentReference), "escrow deployment");
  const state = object(evidence.state, "state");
  assert(
    evm.parseAddress(state.ve) === evm.parseAddress(escrow.address),
    "veMEZO escrow binding differs",
  );
  const splitter = object(
    await load(cr("contract-deployments", "incentives.mezo-ecosystem-splitter@mezo-mainnet")),
    "ecosystem splitter",
  );
  assert(
    evm.parseAddress(state.splitter) === evm.parseAddress(splitter.address),
    "wrong funding splitter",
  );
  const snapshot = object(evidence.networkSnapshot, "snapshot");
  evm.parseHash32(snapshot.blockHash);
  assert(Number.isSafeInteger(snapshot.blockNumber), "unsafe block number");
  const currentFrom = object(
    object(deployment.validity, "validity").currentCodeFrom,
    "current code activation",
  );
  assert(
    typeof currentFrom.blockNumber === "number" &&
      typeof snapshot.blockNumber === "number" &&
      snapshot.blockNumber >= currentFrom.blockNumber,
    "snapshot predates this implementation",
  );
  const until = object(deployment.validity, "validity").effectiveUntilExclusive;
  if (until !== null)
    assert(
      snapshot.blockNumber < Number(object(until, "validity end").blockNumber),
      "snapshot exceeds deployment validity",
    );
  const captured = new Map<string, JsonObject>();
  for (const artifact of objects(evidence.artifacts, "artifacts")) {
    const resource = await loadKnowledgeReference(root, artifact.reference);
    assert(
      sha256(await readFile(resource.path)) === artifact.sha256,
      `capture digest differs: ${text(artifact.id, "artifact id")}`,
    );
    captured.set(text(artifact.id, "artifact id"), object(resource.value, "capture"));
  }
  const capture = (id: string): JsonObject => {
    const value = captured.get(id);
    assert(value, `missing ${id}`);
    return value;
  };
  const rpc = capture("third-party-rpc-capture-2026-09-15");
  const rawBlock = object(rpc.block, "raw block");
  assert(
    evm.parseRpcQuantity(rpc.chainId) === BigInt(text(snapshot.chainId, "chain id")) &&
      evm.parseRpcQuantity(rawBlock.number) === BigInt(snapshot.blockNumber) &&
      rawBlock.hash === snapshot.blockHash,
    "raw RPC network coordinate differs",
  );
  assert(
    new Date(Number(evm.parseRpcQuantity(rawBlock.timestamp)) * 1000).toISOString() ===
      snapshot.blockTimestamp,
    "block timestamp differs",
  );
  const voter = object(evidence.voter, "voter");
  assert(
    evm.parseAddress(rpc.address) === evm.parseAddress(deployment.address) &&
      rpc.address === voter.address &&
      rpc.implementation === voter.implementation &&
      rpc.implementation === object(deployment.proxy, "proxy").currentImplementationAddress,
    "proxy implementation identity differs",
  );
  const rawResults = objects(rpc.results, "raw results");
  const result = (id: string): unknown => {
    const row = rawResults.find(
      (r) => r.status === "fulfilled" && object(r.value, "result").id === id,
    );
    assert(row, `RPC result missing: ${id}`);
    return object(row.value, "result").result;
  };
  const runtime = object(previous.runtime, "prior runtime");
  assert(
    codeHash(result("proxyCode")) === runtime.addressCodeSha256 &&
      codeHash(result("implementationCode")) === runtime.implementationCodeSha256 &&
      codeHash(source.deployed_bytecode) === runtime.implementationCodeSha256,
    "bytecode differs from accepted reproduction",
  );
  for (const [name, field] of [
    ["ve", "ve"],
    ["rewardToken", "rewardToken"],
    ["splitter", "splitter"],
    ["governor", "governor"],
    ["length", "gaugeCount"],
    ["totalWeight", "totalWeightRaw"],
    ["maxVotingNum", "maxVotingNum"],
  ] as const) {
    const entry = requiredRecord(
      objects(abi, "ABI").filter((e) => e.type === "function"),
      "name",
      name,
      "view ABI",
    );
    const [decoded] = evm.decodeFunctionResult(entry, result(`${name}()`));
    assert(String(decoded) === String(state[field]), `raw ${name} differs from recorded state`);
  }
  let total = 0n;
  const gauges = objects(evidence.gauges, "gauges");
  const rawGauges = objects(capture("third-party-gauge-capture-2026-09-15").rows, "raw gauges");
  assert(rawGauges.length === gauges.length, "raw gauge enumeration differs");
  const rawDestinations = objects(
    capture("third-party-destination-capture-2026-09-15").rows,
    "raw destinations",
  );
  const rawBeneficiaries = objects(
    capture("third-party-beneficiary-code-2026-09-15").rows,
    "raw beneficiaries",
  );
  const rawGaugeCode = objects(capture("third-party-gauge-code-2026-09-15").rows, "gauge code");
  const rawGaugeSources = objects(
    capture("third-party-gauge-explorer-2026-09-15").items,
    "gauge sources",
  );
  const activeGauges = gauges.filter((gauge) => gauge.alive === true);
  assert(
    rawGaugeCode.length === activeGauges.length && rawGaugeSources.length === activeGauges.length,
    "active gauge code/source coverage differs",
  );
  const comparison = object(evidence.gaugeSourceComparison, "gauge source comparison");
  assert(
    comparison.status === "matching-runtime-and-returned-source-template" &&
      text(comparison.limitation, "source limitation").includes(
        "No independent compiler reproduction",
      ),
    "gauge provenance overclaimed",
  );
  const gaugeRuntimes = new Set<string>();
  const gaugeTemplates = new Set<string>();
  for (const artifactId of [
    "third-party-gauge-capture-2026-09-15",
    "third-party-destination-capture-2026-09-15",
    "third-party-beneficiary-code-2026-09-15",
    "third-party-gauge-code-2026-09-15",
  ]) {
    assert(
      object(capture(artifactId).block, "capture block").hash === snapshot.blockHash,
      "mixed-block gauge evidence",
    );
  }
  for (const gauge of gauges) {
    evm.parseAddress(gauge.address);
    const weight = uint(gauge.weightRaw, "gauge weight");
    total = evm.parseUint(total + weight);
    const raw = rawGauges.find((g) => g.index === gauge.index);
    assert(
      raw &&
        raw.address === gauge.address &&
        raw.isAlive === gauge.alive &&
        raw.weight === gauge.weightRaw,
      "decoded gauge differs from retained capture",
    );
    if (!gauge.alive) continue;
    const codeCapture = rawGaugeCode.find((row) => row.gaugeIndex === gauge.index);
    const sourceCapture = rawGaugeSources.find((row) => row.gaugeIndex === gauge.index);
    assert(codeCapture && sourceCapture, "active gauge capture missing");
    const request = object(codeCapture.request, "code request");
    const response = object(codeCapture.response, "code response");
    const params = texts(request.params, "code request params");
    const gaugeSource = object(sourceCapture.response, "gauge explorer response");
    const gaugeCode = evm.parseHexData(response.result);
    assert(
      request.method === "eth_getCode" &&
        request.id === response.id &&
        params.length === 2 &&
        evm.parseAddress(params[0]) === gauge.address &&
        evm.parseRpcQuantity(params[1]) === BigInt(snapshot.blockNumber) &&
        sourceCapture.address === gauge.address &&
        gaugeCode.length > 2 &&
        gaugeCode === evm.parseHexData(gaugeSource.deployed_bytecode),
      "active gauge runtime or observation coordinate differs",
    );
    assert(
      gaugeSource.is_verified === gauge.explorerVerified &&
        gaugeSource.is_fully_verified === gauge.explorerFullyVerified &&
        gaugeSource.is_partially_verified === gauge.explorerPartiallyVerified &&
        gaugeSource.verified_twin_address_hash === gauge.verifiedTwin,
      "active gauge verification labels differ",
    );
    gaugeRuntimes.add(gaugeCode);
    gaugeTemplates.add(sourceDigest(gaugeSource));
    evm.parseAddress(gauge.beneficiary);
    const rawDestination = rawDestinations.find((g) => g.index === gauge.index);
    assert(
      rawDestination &&
        rawDestination.beneficiary === gauge.beneficiary &&
        rawDestination.address === gauge.address &&
        rawDestination.sourceVerified === gauge.explorerVerified,
      "beneficiary or explorer label differs",
    );
    // cast's retained tuple display is observation data, not a new ABI codec.
    const [addressLine, ...metadataLines] = text(
      rawDestination.metadata,
      "metadata observation",
    ).split("\n");
    assert(
      evm.parseAddress(addressLine) === gauge.address &&
        parseJson(metadataLines.join("\n"), "metadata string") === gauge.metadata,
      "third-party mapping differs",
    );
    const code = rawBeneficiaries.find((row) => row.index === gauge.index);
    if (code) {
      const observed = object(gauge.beneficiaryCode, "beneficiary code");
      const bytes = evm.parseHexData(code.code);
      assert(
        code.beneficiary === gauge.beneficiary &&
          observed.status === "observed" &&
          observed.bytes === (bytes.length - 2) / 2 &&
          observed.sha256 === codeHash(bytes),
        "beneficiary code observation differs",
      );
    }
  }
  assert(
    gaugeRuntimes.size === 1 && gaugeTemplates.size === 1,
    "active gauges no longer share the recorded runtime and source template",
  );
  assert(
    total === uint(state.totalWeightRaw, "total weight"),
    "gauge weights do not reconcile with totalWeight",
  );
  for (const destination of objects(model.destinations, "destinations")) {
    const gauge = object(await load(destination.gaugeObservationReference), "destination gauge");
    assert(
      gauge.alive === true && String(gauge.metadata).startsWith("remote-gauge-"),
      "remote destination must reference an observed active remote gauge",
    );
    // Bind human pool identity to the retained metadata, without duplicating addresses.
    const metadataStem =
      destination.id === "curve-usdt-usdc-musd"
        ? "curve-musd-2pool"
        : destination.id === "uniswap-usdc-musd"
          ? "uniswap-v4-usdc-musd"
          : text(destination.id, "destination id");
    assert(
      text(gauge.metadata, "metadata").startsWith(`remote-gauge-${metadataStem}-`),
      "destination metadata binding differs",
    );
    const network = object(await load(destination.networkReference), "destination network");
    assert(
      network.id ===
        (destination.mechanism === "merkl-campaign" ? "ethereum-mainnet" : "base-mainnet"),
      "destination network differs from documented mechanism",
    );
    for (const reference of objects(
      destination.documentationReferences,
      "documentation references",
    ))
      await load(reference);
  }
  const docs = capture("third-party-official-docs-2026-09-15");
  const sourceCatalog = object(await load(ir("incentives-third-party-sources")), "source catalog");
  lifecycle(sourceCatalog);
  for (const entry of objects(sourceCatalog.records, "sources")) {
    if (entry.classification !== "official-documentation") continue;
    const document = object(await load(entry.sourceReference), "official document");
    assert(
      entry.commit === docs.commit &&
        entry.path === document.path &&
        entry.url === document.url &&
        entry.sha256 === sha256(text(document.content, "document contents")) &&
        document.sha256 === entry.sha256,
      "documentation source identity differs",
    );
  }
  const howTo = requiredRecord(
    objects(docs.docs, "documents"),
    "file",
    "how-to-vote.mdx",
    "voting guide",
  );
  assert(
    text(howTo.content, "guide").includes("as often as you like within an epoch") &&
      text(howTo.content, "guide").includes("Voting is open throughout the epoch"),
    "reassess the recorded documentation conflict",
  );
  for (const reference of objects(
    object(model.accounting, "accounting").sharedMathReferences,
    "math references",
  ))
    await load(reference);
  const boundaryFixtures = object(
    await load(ir("incentives-third-party-voting-fixtures")),
    "voting fixtures",
  );
  lifecycle(boundaryFixtures);
  assert(
    boundaryFixtures.protocolStatus === "verified-versioned",
    "fixture protocol scope missing",
  );
  const sharedEpoch = object(
    await load(boundaryFixtures.epochFixtureReference),
    "shared epoch fixture",
  );
  const expectedEpoch = object(sharedEpoch.expected, "epoch expected");
  const epoch: ThirdPartyEpoch = {
    week: uint(expectedEpoch.next, "week"),
    voteStartOffset: uint(expectedEpoch.voteStart, "vote start"),
    voteEndOffset: uint(expectedEpoch.voteEnd, "vote end"),
  };
  for (const fixture of objects(boundaryFixtures.records, "boundary fixtures")) {
    assert(
      fixture.formulaId === "third-party-direct-vote-guards",
      "fixture formula identity differs",
    );
    const input = object(fixture.inputs, "fixture inputs");
    assert(input.action === "vote" || input.action === "reset", "invalid fixture action");
    assert(typeof input.whitelisted === "boolean", "invalid whitelist input");
    const actual = thirdPartyVoteGuard(
      {
        timestamp: uint(input.timestamp, "timestamp"),
        lastVoted: uint(input.lastVoted, "last vote"),
        action: input.action,
        whitelisted: input.whitelisted,
      },
      epoch,
    );
    assert(
      actual === fixture.expected,
      `vote boundary fixture failed: ${text(fixture.id, "fixture id")}`,
    );
  }
}
