import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { buildContractsPackageFile } from "./lib/foundational-package-generation.ts";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check"))
  throw new Error("usage: generate-protocol-operations.ts [--check]");
const digest = createHash("sha256").update((await buildContractsPackageFile(root)).digest);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Record<string, unknown>;
}
function array(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("expected array");
  return value.map((entry: unknown) => object(entry));
}
async function resource(id: string) {
  const input = await loadKnowledgeReference(root, { moduleId: "contracts", resourceId: id });
  const bytes = await readFile(input.path);
  digest.update(bytes);
  return { value: input.document, bytes };
}
function curated(abi: Record<string, unknown>[], names: readonly string[]) {
  for (const name of names)
    if (!abi.some((entry) => entry.type === "function" && entry.name === name))
      throw new Error(`missing operation ${name}`);
  return abi.filter(
    (entry) =>
      entry.type === "event" ||
      (entry.type === "function" &&
        (entry.stateMutability === "view" ||
          entry.stateMutability === "pure" ||
          names.includes(String(entry.name)))),
  );
}
const operations: Record<string, unknown> = {};
for (const [id, names] of [
  ["musd.savings-rate", ["deposit", "withdraw", "claimYield", "approve"]],
  ["musd.token", ["approve"]],
  ["musd.trove-manager", ["redeemCollateral"]],
  [
    "incentives.ve-btc",
    [
      "createLock",
      "increaseAmount",
      "increaseUnlockTime",
      "withdraw",
      "lockPermanent",
      "unlockPermanent",
    ],
  ],
  [
    "incentives.ve-mezo",
    [
      "createLock",
      "increaseAmount",
      "increaseUnlockTime",
      "withdraw",
      "lockPermanent",
      "unlockPermanent",
    ],
  ],
  [
    "lending.morpho",
    ["supply", "withdraw", "supplyCollateral", "withdrawCollateral", "borrow", "repay"],
  ],
  ["vaults.usdc-lending-wrapper", ["depositAndStake", "withdraw", "approve"]],
  ["mezo-earn.router", ["addLiquidity", "removeLiquidity", "swapExactTokensForTokens"]],
] as const) {
  const source = await resource(`abi.${id}`);
  operations[id] = curated(array(source.value), names);
}
const profiles: Record<string, unknown> = {};
// Solidity library events are omitted from Morpho's explorer ABI. Keep their
// compiler-produced projection and source provenance under Contracts ownership.
const eventCatalog = object((await resource("protocol-operation-sources")).value);
const eventRecord = array(eventCatalog.records).find((entry) => entry.id === "morpho-events");
if (!eventRecord || eventCatalog.supportStatus !== "proposed")
  throw new Error("missing event source lifecycle");
for (const [reference, expected] of [
  [eventRecord.sourceReference, eventRecord.sourceSha256],
  [eventRecord.abiReference, eventRecord.abiSha256],
  [eventRecord.explorerReference, eventRecord.explorerSha256],
]) {
  const loaded = await loadKnowledgeReference(root, reference);
  const bytes = await readFile(loaded.path);
  digest.update(bytes);
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("event source digest mismatch");
}
const explorer = object((await resource("lending-morpho-explorer-source")).value);
const eventSource = array(explorer.additional_sources).find(
  (entry) => entry.file_path === "src/libraries/EventsLib.sol",
);
const canonicalSource = await loadKnowledgeReference(root, eventRecord.sourceReference);
if (eventSource?.source_code !== (await readFile(canonicalSource.path, "utf8")))
  throw new Error("library source differs from explorer archive");
const reproduction = object((await resource("morpho-operation-reproduction")).value);
if (
  object(reproduction.runtime).executableExact !== true ||
  object(reproduction.creation).fullExact !== true ||
  object(reproduction.runtime).explorerSha256 !== eventRecord.runtimeSha256
)
  throw new Error("event executable provenance mismatch");
const libraryEvents = array((await resource("morpho-events-interface")).value);
const eventNames = [
  "Supply",
  "Withdraw",
  "Borrow",
  "Repay",
  "SupplyCollateral",
  "WithdrawCollateral",
  "AccrueInterest",
];
for (const name of eventNames)
  if (libraryEvents.filter((entry) => entry.type === "event" && entry.name === name).length !== 1)
    throw new Error(`missing library event ${name}`);
operations["lending.morpho"] = [
  ...array(operations["lending.morpho"]),
  ...libraryEvents.filter((entry) => eventNames.includes(String(entry.name))),
];
const identities: Record<string, unknown> = {};
for (const contractId of [
  "musd.savings-rate",
  "lending.morpho",
  "vaults.usdc-lending-wrapper",
  "incentives.pools-voter",
  "oracle.skip-btc-usd",
  "mezo-earn.router",
  "mezo-earn.pool-factory",
  "musd.enclave-debt-manager",
  "musd.enclave-v1",
  "musd.enclave-v2",
  "incentives.ve-btc",
  "incentives.ve-mezo",
  "incentives.boost-voter",
  "incentives.factory-registry",
]) {
  const deployment = await loadKnowledgeReference(root, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
    recordId: `${contractId}@mezo-mainnet`,
  });
  digest.update(await readFile(deployment.path));
  const record = object(deployment.value);
  const runtime = object(record.runtime);
  const proxy = record.proxy === null ? null : object(record.proxy);
  identities[contractId] = {
    addressCodeSha256: runtime.addressCodeSha256,
    implementationCodeSha256: runtime.implementationCodeSha256 ?? null,
    implementationSlot: proxy?.implementationSlot ?? null,
  };
}
for (const [catalogId, entries] of [
  [
    "savings-dynamic-read-interfaces",
    [["gauge", "savings-gauge", "musd.savings-rate", ["deposit", "withdraw", "getReward"]]],
  ],
  [
    "vault-dynamic-read-interfaces",
    [
      [
        "vault-v2",
        "vault-v2",
        "vaults.usdc-lending-wrapper",
        ["deposit", "mint", "withdraw", "redeem", "approve"],
      ],
      [
        "vault-gauge",
        "vault-gauge",
        "vaults.usdc-lending-wrapper",
        ["deposit", "withdraw", "getReward"],
      ],
    ],
  ],
] as const) {
  const catalog = object((await resource(catalogId)).value);
  if (
    catalog.status !== "verified" ||
    catalog.supportStatus !== "proposed" ||
    !["accepted", "pending-qualified-review"].includes(String(catalog.reviewStatus))
  )
    throw new Error("role lifecycle mismatch");
  for (const [id, role, anchorContractId, names] of entries) {
    const profile = array(catalog.records).find((entry) => entry.id === id);
    if (!profile) throw new Error("missing role");
    const loaded = await loadKnowledgeReference(root, profile.sourceReference);
    const bytes = await readFile(loaded.path);
    if (createHash("sha256").update(bytes).digest("hex") !== profile.sourceSha256)
      throw new Error("role source digest mismatch");
    digest.update(bytes);
    const source = object(loaded.document);
    if (
      source.is_verified !== true ||
      typeof source.deployed_bytecode !== "string" ||
      !/^0x(?:[a-fA-F0-9]{2})+$/.test(source.deployed_bytecode)
    )
      throw new Error("unverified role source");
    if (
      createHash("sha256")
        .update(Buffer.from(source.deployed_bytecode.slice(2), "hex"))
        .digest("hex") !== profile.runtimeSha256
    )
      throw new Error("role runtime digest mismatch");
    profiles[role] = {
      anchorContractId,
      runtimeSha256: profile.runtimeSha256,
      abi: curated(array(source.abi), names),
    };
  }
}
const erc20 = array((await resource("abi.musd.token")).value).filter(
  (entry) =>
    (entry.type === "function" &&
      ["balanceOf", "allowance", "decimals", "approve"].includes(String(entry.name))) ||
    (entry.type === "event" && ["Transfer", "Approval"].includes(String(entry.name))),
);
if (erc20.length !== 6) throw new Error("token interface mismatch");
const basicCatalog = object((await resource("basic-pool-interfaces")).value);
if (
  basicCatalog.status !== "verified" ||
  basicCatalog.supportStatus !== "proposed" ||
  basicCatalog.reviewStatus !== "pending-qualified-review"
)
  throw new Error("invalid basic pool interface lifecycle");
const basicInterfaces: Record<string, unknown> = {};
const basicRuntime = object((await resource("basic-pool-runtime-probe")).value);
for (const [id, names] of [
  ["pool", ["claimFees", "approve"]],
  ["factory-registry", []],
] as const) {
  const profile = array(basicCatalog.records).find((entry) => entry.id === id);
  if (!profile) throw new Error("missing basic pool interface");
  const sourceRef = await loadKnowledgeReference(root, profile.sourceReference),
    reproductionRef = await loadKnowledgeReference(root, profile.reproductionReference);
  for (const [loaded, expected] of [
    [sourceRef, profile.sourceSha256],
    [reproductionRef, profile.reproductionSha256],
  ] as const) {
    const bytes = await readFile(loaded.path);
    digest.update(bytes);
    if (createHash("sha256").update(bytes).digest("hex") !== expected)
      throw new Error("basic interface artifact digest mismatch");
  }
  const source = object(sourceRef.document),
    reproduction = object(reproductionRef.document);
  if (
    source.is_fully_verified !== true ||
    typeof source.deployed_bytecode !== "string" ||
    typeof source.source_code !== "string" ||
    !/^0x(?:[a-fA-F0-9]{2})+$/.test(source.deployed_bytecode)
  )
    throw new Error("basic interface source is unverified");
  const runtime = createHash("sha256")
    .update(Buffer.from(source.deployed_bytecode.slice(2), "hex"))
    .digest("hex");
  if (
    runtime !== profile.runtimeSha256 ||
    object(reproduction.runtime).explorerSha256 !== runtime ||
    object(reproduction.runtime).executableExact !== true ||
    object(reproduction.creation).fullExact !== true ||
    createHash("sha256").update(source.source_code).digest("hex") !== profile.sourceCodeSha256 ||
    !array(basicRuntime.records).some(
      (entry) => entry.runtimeSha256 === runtime && entry.name === source.name,
    )
  )
    throw new Error("basic interface reproduction mismatch");
  basicInterfaces[id] = {
    anchorContractId: profile.anchorContractId,
    getter: profile.getter,
    runtimeSha256: runtime,
    sourceSha256: profile.sourceSha256,
    abi: curated(array(source.abi), names),
  };
}
const contents = `// Generated by scripts/generate-protocol-operations.ts. Do not edit.\n// sha256:${digest.digest("hex")}\nimport type { ContractAbiEntry } from './registry.ts';\nexport const PROTOCOL_OPERATION_ABIS: Readonly<Record<string, readonly ContractAbiEntry[]>> = ${JSON.stringify(operations)};\nexport const PROTOCOL_ROLE_INTERFACES = ${JSON.stringify(profiles)} as const;\nexport const TOKEN_ABI: readonly ContractAbiEntry[] = ${JSON.stringify(erc20)};\n`;
const output = await format(
  contents +
    `export const BASIC_POOL_INTERFACES = ${JSON.stringify(basicInterfaces)} as const;\n` +
    `import type { ContractRuntimeIdentity } from './operations.ts';\nexport const PROTOCOL_RUNTIME_IDENTITIES: Readonly<Record<string, ContractRuntimeIdentity>> = ${JSON.stringify(identities)};\n`,
  {
    parser: "typescript",
    ...object(JSON.parse(await readFile(resolve(root, ".prettierrc.json"), "utf8"))),
  },
);
const target = resolve(root, "packages/contracts/src/protocol-operations.generated.ts");
if (args.includes("--check")) {
  if ((await readFile(target, "utf8")) !== output)
    throw new Error("protocol operation projection drift");
} else await writeFile(target, output);
