import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const rpcUrl = process.env.MDK_MEZO_RPC_URL ?? "https://mezo-mainnet.boar.network";
const explorerUrl = process.env.MDK_MEZO_EXPLORER_API_URL ?? "https://api.explorer.mezo.org";
const outputPath = process.argv[2] ?? null;

const addresses = {
  originalEnclaveProxy: "0x4da9e77114ee66d64ca9457da1fca94d4b06fb99",
  originalEnclaveImplementation: "0xf74d1bddc4c37cbc1b1d8a74480ddff30af6273d",
  secondEnclaveProxy: "0x147379a0174780570d07d70a14fb244ee5f2d786",
  secondEnclaveImplementation: "0x05bd601c3c381fd3d099dbb574cc39ea5d8b4a69",
  debtManagerProxy: "0x2c5e9afbb670c4a61ac2dcad62c258ee2391389a",
  debtManagerImplementationV1: "0xb98a5fb78780a1523c193a13a3c59600a7f628e7",
  debtManagerImplementationV2: "0x3ea98a11d349b515e628c1cc74ca999230744c43",
} as const;

const eip1967 = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
} as const;

const selectors = {
  assetsBridge: "0xcfab0e08",
  bridgeManagerRole: "0xf75e8512",
  bridgeModuleRole: "0x20a25314",
  btcManagerRole: "0x9a918f30",
  defaultAdminRole: "0xa217fddf",
  executorRole: "0x07bd0265",
  getRoleMemberCount: "0xca15c873",
  getRoleMember: "0x9010d07c",
  getTargets: "0x63fe3b56",
  getTripartyUtxos: "0xe2ab68e1",
  btc: "0xa28d57d8",
  veBtc: "0xf2c992a4",
  enclaveRole: "0x3174df7e",
  governanceRole: "0xf36c8f5c",
  maxPledgedVeBtc: "0xef873c0a",
  minMinimumCr: "0x0f93be01",
  pauserRole: "0xe63ab1e9",
  combinedFees: "0x9c0b9208",
  getAccruedInterest: "0x564afa3a",
  getPosition: "0x1928b3cb",
  getPositionCr: "0xa2fdbcef",
  getPositionCollateral: "0x92878eb9",
  getPositionDebt: "0xeae3b917",
  getPositionHealthStatus: "0xe871a223",
  getTotalOutstandingDebt: "0xdb87b1ff",
  interest: "0xc392f766",
  maxRate: "0xece1d6e5",
  mintCap: "0x76c71ca1",
  musd: "0xcab666d0",
  paused: "0x5c975abb",
  pcv: "0x4597f6ed",
  priceFeed: "0x741bef1a",
  totalDebtBurned: "0x06d6da2e",
  totalFeeSettled: "0x6a23f0b4",
  totalFeesStored: "0x262ab1f8",
  totalInterestMinted: "0xc0c4a6d4",
  totalMintedDebt: "0xff76f310",
  totalOriginatorFeeMinted: "0xe5dd6c5c",
  totalPrincipal: "0x4b1533b2",
  originatorFees: "0xb89ad25f",
  originatorFeeMinted: "0xec6a0e5e",
} as const;

const targetSelectorNames: Record<string, string> = {
  "0xe487893f":
    "openPosition(bytes32,address,address,uint256,uint16,uint16,uint256[],uint256,uint256)",
  "0x1322e56e": "increaseDebt(bytes32,uint256)",
  "0x00f989ad": "repay(bytes32,uint256)",
  "0x4b68f8a1": "repayAll(bytes32)",
  "0x12bf2ba1": "addPledgedVeBtc(bytes32,uint256[])",
  "0x59d31fb3": "removePledgedVeBtc(bytes32,uint256[])",
  "0xec83fd03": "setPositionInterestRate(bytes32,uint16)",
  "0xfeee0d9d": "setPositionOriginatorFeeRate(bytes32,uint16)",
  "0x23c8521b": "setPositionCRThresholds(bytes32,uint256,uint256)",
  "0xa6afed95": "accrueInterest()",
  "0x095ea7b3": "approve(address,uint256)",
  "0xa9059cbb": "transfer(address,uint256)",
};

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function normalizeHex(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail(`invalid hexadecimal value: ${value}`);
  }
  return normalized;
}

function sha256Hex(value: string): string {
  const normalized = normalizeHex(value).slice(2);
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function word(value: bigint): string {
  if (value < 0n) fail("negative ABI word is unsupported");
  return value.toString(16).padStart(64, "0");
}

function splitWords(raw: string): string[] {
  const normalized = normalizeHex(raw).slice(2);
  if (normalized.length % 64 !== 0) fail(`ABI result is not word-aligned: ${raw}`);
  return normalized.match(/.{64}/g) ?? [];
}

function uintWord(value: string): string {
  return BigInt(`0x${value}`).toString();
}

function addressWord(value: string): string {
  return `0x${value.slice(-40)}`.toLowerCase();
}

function decodeUint(raw: string): string {
  const words = splitWords(raw);
  if (words.length !== 1) fail(`expected one uint word, received ${words.length}`);
  return uintWord(words[0]!);
}

function decodeAddress(raw: string): string {
  const words = splitWords(raw);
  if (words.length !== 1) fail(`expected one address word, received ${words.length}`);
  return addressWord(words[0]!);
}

function decodeBytes32(raw: string): string {
  const words = splitWords(raw);
  if (words.length !== 1) fail(`expected one bytes32 word, received ${words.length}`);
  return `0x${words[0]}`;
}

function decodeBool(raw: string): boolean {
  return decodeUint(raw) === "1";
}

function decodePair(raw: string): { numerator: string; lastUpdateTime: string } {
  const words = splitWords(raw);
  if (words.length !== 2) fail(`expected two words, received ${words.length}`);
  return { numerator: uintWord(words[0]!), lastUpdateTime: uintWord(words[1]!) };
}

function decodeFourUints(raw: string): string[] {
  const words = splitWords(raw);
  if (words.length !== 4) fail(`expected four words, received ${words.length}`);
  return words.map(uintWord);
}

function decodeHealth(raw: string): JsonObject {
  const words = splitWords(raw);
  if (words.length !== 5) fail(`expected five health words, received ${words.length}`);
  return {
    currentCr: uintWord(words[0]!),
    warningCr: uintWord(words[1]!),
    minimumCr: uintWord(words[2]!),
    isBelowWarning: uintWord(words[3]!) === "1",
    isBelowMinimum: uintWord(words[4]!) === "1",
  };
}

function dynamicArrayStart(words: string[]): number {
  if (words.length < 2) fail("dynamic ABI result is incomplete");
  const offsetBytes = Number(BigInt(`0x${words[0]}`));
  if (offsetBytes % 32 !== 0) fail("dynamic ABI offset is not word-aligned");
  return offsetBytes / 32;
}

function decodeTargets(raw: string): JsonObject[] {
  const words = splitWords(raw);
  const start = dynamicArrayStart(words);
  const length = Number(BigInt(`0x${words[start]}`));
  const targets = [];
  for (let index = 0; index < length; index += 1) {
    const addr = addressWord(words[start + 1 + index * 2]!);
    const selector = `0x${words[start + 2 + index * 2]!.slice(0, 8)}`;
    targets.push({ addr, selector, signature: targetSelectorNames[selector] ?? null });
  }
  return targets;
}

function decodeUtxos(raw: string): JsonObject[] {
  const words = splitWords(raw);
  const start = dynamicArrayStart(words);
  const length = Number(BigInt(`0x${words[start]}`));
  const utxos = [];
  for (let index = 0; index < length; index += 1) {
    const cursor = start + 1 + index * 3;
    utxos.push({
      txHash: `0x${words[cursor]}`,
      txOutputIndex: uintWord(words[cursor + 1]!),
      txOutputValueSats: uintWord(words[cursor + 2]!),
    });
  }
  return utxos;
}

function decodePosition(raw: string): JsonObject {
  const words = splitWords(raw);
  const tupleStart = dynamicArrayStart(words);
  if (words.length < tupleStart + 13) fail("position ABI result is incomplete");
  const pledgedOffsetWords = Number(BigInt(`0x${words[tupleStart + 12]}`)) / 32;
  const pledgedStart = tupleStart + pledgedOffsetWords;
  const pledgedLength = Number(BigInt(`0x${words[pledgedStart]}`));
  const pledgedVeBtc = [];
  for (let index = 0; index < pledgedLength; index += 1) {
    pledgedVeBtc.push(uintWord(words[pledgedStart + 1 + index]!));
  }
  const statusValue = Number(BigInt(`0x${words[tupleStart + 11]}`));
  const statusNames = ["nonExistent", "active", "closedByRepayment", "closedByLiquidation"];
  return {
    principal: uintWord(words[tupleStart]!),
    storedInterest: uintWord(words[tupleStart + 1]!),
    storedOriginatorFee: uintWord(words[tupleStart + 2]!),
    lastUpdateTimestamp: uintWord(words[tupleStart + 3]!),
    interestRateBps: uintWord(words[tupleStart + 4]!),
    originatorFeeRateBps: uintWord(words[tupleStart + 5]!),
    warningCr: uintWord(words[tupleStart + 6]!),
    minimumCr: uintWord(words[tupleStart + 7]!),
    enclave: addressWord(words[tupleStart + 8]!),
    borrower: addressWord(words[tupleStart + 9]!),
    originator: addressWord(words[tupleStart + 10]!),
    status: statusNames[statusValue] ?? `unknown-${statusValue}`,
    statusValue,
    pledgedVeBtc,
  };
}

async function fetchJson(url: string): Promise<JsonObject> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}: ${raw.slice(0, 240)}`);
  return JSON.parse(raw) as JsonObject;
}

let rpcId = 0;
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (!response.ok || body.error || body.result === undefined) {
    fail(`${method} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.result;
}

async function call(address: string, data: string, blockTag: string): Promise<string> {
  const result = await rpc("eth_call", [{ to: address, data }, blockTag]);
  if (typeof result !== "string") fail("eth_call returned a non-string result");
  return result;
}

async function fetchAllLogs(address: string): Promise<JsonObject[]> {
  const output: JsonObject[] = [];
  let url = new URL(`${explorerUrl}/api/v2/addresses/${address}/logs`);
  for (let page = 0; page < 20; page += 1) {
    const response = await fetchJson(url.toString());
    const items = response.items;
    if (!Array.isArray(items)) fail(`log response for ${address} has no items array`);
    output.push(...(items as JsonObject[]));
    const cursor = response.next_page_params;
    if (!cursor || typeof cursor !== "object") return output;
    url = new URL(`${explorerUrl}/api/v2/addresses/${address}/logs`);
    for (const [key, value] of Object.entries(cursor as JsonObject)) {
      url.searchParams.set(key, String(value));
    }
  }
  fail(`log pagination exceeded the 20-page safety bound for ${address}`);
}

function eventName(log: JsonObject): string | null {
  const decoded = log.decoded;
  if (!decoded || typeof decoded !== "object") return null;
  const methodCall = (decoded as JsonObject).method_call;
  return typeof methodCall === "string" ? methodCall.split("(")[0]! : null;
}

function summarizeEvents(logs: JsonObject[], includedNames: Set<string>): JsonObject {
  const counts: Record<string, number> = {};
  const selected = [];
  for (const log of logs) {
    const name = eventName(log) ?? "undecoded";
    counts[name] = (counts[name] ?? 0) + 1;
    if (!includedNames.has(name)) continue;
    const topics = Array.isArray(log.topics) ? log.topics.map(String) : [];
    const data = typeof log.data === "string" ? log.data : "0x";
    selected.push({
      event: name,
      blockNumber: Number(log.block_number),
      transactionHash: String(log.transaction_hash).toLowerCase(),
      logIndex: Number(log.index),
      topics: topics.map((topic) => topic.toLowerCase()),
      dataSha256: sha256Hex(data),
    });
  }
  selected.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  return { counts, selected };
}

async function readRoles(
  address: string,
  blockTag: string,
  definitions: readonly (readonly [string, string])[],
): Promise<JsonObject[]> {
  const output = [];
  for (const [name, selector] of definitions) {
    const role = decodeBytes32(await call(address, selector, blockTag));
    const count = Number(
      BigInt(
        decodeUint(
          await call(address, `${selectors.getRoleMemberCount}${role.slice(2)}`, blockTag),
        ),
      ),
    );
    const members = [];
    for (let index = 0; index < count; index += 1) {
      members.push(
        decodeAddress(
          await call(
            address,
            `${selectors.getRoleMember}${role.slice(2)}${word(BigInt(index))}`,
            blockTag,
          ),
        ),
      );
    }
    output.push({ name, role, members });
  }
  return output;
}

async function readEnclave(
  address: string,
  generation: "original" | "second",
  blockTag: string,
): Promise<JsonObject> {
  const roleDefinitions: (readonly [string, string])[] = [
    ["DEFAULT_ADMIN_ROLE", selectors.defaultAdminRole],
    ["BRIDGE_MODULE_ROLE", selectors.bridgeModuleRole],
    ["BTC_MANAGER_ROLE", selectors.btcManagerRole],
    ["EXECUTOR_ROLE", selectors.executorRole],
  ];
  if (generation === "second") {
    roleDefinitions.splice(2, 0, ["BRIDGE_MANAGER_ROLE", selectors.bridgeManagerRole]);
  }
  const [targetsRaw, utxosRaw] = await Promise.all([
    call(address, selectors.getTargets, blockTag),
    call(address, selectors.getTripartyUtxos, blockTag),
  ]);
  return {
    address,
    generation,
    veBtc: decodeAddress(await call(address, selectors.veBtc, blockTag)),
    btc: decodeAddress(await call(address, selectors.btc, blockTag)),
    assetsBridge: decodeAddress(await call(address, selectors.assetsBridge, blockTag)),
    roles: await readRoles(address, blockTag, roleDefinitions),
    targets: decodeTargets(targetsRaw),
    tripartyUtxos: decodeUtxos(utxosRaw),
  };
}

async function readPosition(positionId: string, blockTag: string): Promise<JsonObject> {
  const argument = positionId.slice(2);
  const position = decodePosition(
    await call(addresses.debtManagerProxy, `${selectors.getPosition}${argument}`, blockTag),
  );
  const debt = decodeFourUints(
    await call(addresses.debtManagerProxy, `${selectors.getPositionDebt}${argument}`, blockTag),
  );
  return {
    positionId,
    ...position,
    current: {
      collateral: decodeUint(
        await call(
          addresses.debtManagerProxy,
          `${selectors.getPositionCollateral}${argument}`,
          blockTag,
        ),
      ),
      collateralRatio: decodeUint(
        await call(addresses.debtManagerProxy, `${selectors.getPositionCr}${argument}`, blockTag),
      ),
      debt: {
        principal: debt[0],
        accruedInterest: debt[1],
        accruedOriginatorFee: debt[2],
        totalDebt: debt[3],
      },
      health: decodeHealth(
        await call(
          addresses.debtManagerProxy,
          `${selectors.getPositionHealthStatus}${argument}`,
          blockTag,
        ),
      ),
    },
  };
}

async function addressEvidence(address: string, blockTag: string): Promise<JsonObject> {
  const addressRecord = await fetchJson(`${explorerUrl}/api/v2/addresses/${address}`);
  const transactionHash = String(
    addressRecord.creation_transaction_hash ?? addressRecord.creation_tx_hash,
  ).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) fail(`${address} has no creation hash`);
  const transaction = await fetchJson(`${explorerUrl}/api/v2/transactions/${transactionHash}`);
  const creationBlockNumber = Number(transaction.block_number ?? transaction.block);
  const creationBlock = (await rpc("eth_getBlockByNumber", [
    `0x${creationBlockNumber.toString(16)}`,
    false,
  ])) as JsonObject;
  const code = await rpc("eth_getCode", [address, blockTag]);
  if (typeof code !== "string" || code === "0x") fail(`${address} has no code at evidence block`);
  return {
    address,
    explorerName: addressRecord.name ?? null,
    explorerVerified: addressRecord.is_verified ?? null,
    proxyType: addressRecord.proxy_type ?? null,
    implementations: addressRecord.implementations ?? [],
    creation: {
      transactionHash,
      blockNumber: creationBlockNumber,
      blockHash: String(creationBlock.hash).toLowerCase(),
      blockTimestamp: new Date(
        Number.parseInt(String(creationBlock.timestamp), 16) * 1000,
      ).toISOString(),
      transactionStatus: transaction.status ?? null,
    },
    runtime: { codeSha256: sha256Hex(code) },
  };
}

async function readProxy(
  address: string,
  logs: JsonObject[],
  blockTag: string,
): Promise<JsonObject> {
  const [implementationSlotRaw, adminSlotRaw] = await Promise.all([
    rpc("eth_getStorageAt", [address, eip1967.implementation, blockTag]),
    rpc("eth_getStorageAt", [address, eip1967.admin, blockTag]),
  ]);
  if (typeof implementationSlotRaw !== "string" || typeof adminSlotRaw !== "string") {
    fail(`${address} proxy slot reads returned malformed values`);
  }
  const implementationHistory = [];
  for (const log of logs.filter((entry) => eventName(entry) === "Upgraded")) {
    const topics = Array.isArray(log.topics) ? log.topics.map(String) : [];
    if (!topics[1]) fail(`${address} Upgraded event is missing implementation topic`);
    const number = Number(log.block_number);
    const block = (await rpc("eth_getBlockByNumber", [
      `0x${number.toString(16)}`,
      false,
    ])) as JsonObject;
    implementationHistory.push({
      implementationAddress: addressWord(normalizeHex(topics[1]).slice(2).padStart(64, "0")),
      effectiveFrom: {
        blockNumber: number,
        blockHash: String(block.hash).toLowerCase(),
        blockTimestamp: new Date(Number.parseInt(String(block.timestamp), 16) * 1000).toISOString(),
        blockEvidenceMethod: "official explorer decoded Upgraded event and eth_getBlockByNumber",
        transactionHash: String(log.transaction_hash).toLowerCase(),
      },
    });
  }
  implementationHistory.sort(
    (left, right) =>
      (left.effectiveFrom as { blockNumber: number }).blockNumber -
      (right.effectiveFrom as { blockNumber: number }).blockNumber,
  );
  return {
    address,
    implementationSlot: eip1967.implementation,
    rawImplementationSlotValue: normalizeHex(implementationSlotRaw),
    currentImplementationAddress: addressWord(
      normalizeHex(implementationSlotRaw).slice(2).padStart(64, "0"),
    ),
    adminSlot: eip1967.admin,
    rawAdminSlotValue: normalizeHex(adminSlotRaw),
    adminAddress: addressWord(normalizeHex(adminSlotRaw).slice(2).padStart(64, "0")),
    implementationHistory,
  };
}

const latest = (await rpc("eth_getBlockByNumber", ["latest", false])) as JsonObject;
const blockNumberHex = String(latest.number);
const blockNumber = Number.parseInt(blockNumberHex, 16);
const blockHash = String(latest.hash).toLowerCase();
const blockTimestamp = new Date(Number.parseInt(String(latest.timestamp), 16) * 1000).toISOString();
const capturedAt = new Date().toISOString();

const [debtLogs, originalEnclaveLogs, secondEnclaveLogs] = await Promise.all([
  fetchAllLogs(addresses.debtManagerProxy),
  fetchAllLogs(addresses.originalEnclaveProxy),
  fetchAllLogs(addresses.secondEnclaveProxy),
]);

const positionIds = [
  ...new Set(
    debtLogs
      .filter((log) => eventName(log) === "PositionOpened")
      .map((log) => (Array.isArray(log.topics) ? String(log.topics[1]).toLowerCase() : ""))
      .filter((value) => /^0x[0-9a-f]{64}$/.test(value)),
  ),
].sort();

const positions = [];
for (const positionId of positionIds)
  positions.push(await readPosition(positionId, blockNumberHex));

const originators = [
  ...new Set(
    positions
      .map((position) => String(position.originator).toLowerCase())
      .filter((address) => /^0x[0-9a-f]{40}$/.test(address)),
  ),
].sort();
const originatorState = [];
for (const originator of originators) {
  const argument = originator.slice(2).padStart(64, "0");
  originatorState.push({
    address: originator,
    accumulator: decodePair(
      await call(
        addresses.debtManagerProxy,
        `${selectors.originatorFees}${argument}`,
        blockNumberHex,
      ),
    ),
    totalMinted: decodeUint(
      await call(
        addresses.debtManagerProxy,
        `${selectors.originatorFeeMinted}${argument}`,
        blockNumberHex,
      ),
    ),
  });
}

const contractEvidence: Record<string, unknown> = {};
await Promise.all(
  Object.entries(addresses).map(async ([name, address]) => {
    contractEvidence[name] = await addressEvidence(address, blockNumberHex);
  }),
);

const debtEventNames = new Set([
  "Upgraded",
  "Initialized",
  "RoleAdminChanged",
  "RoleGranted",
  "RoleRevoked",
  "PositionOpened",
  "DebtIncreased",
  "DebtRepaid",
  "PositionClosed",
  "PledgedVeBtcAdded",
  "PledgedVeBtcRemoved",
  "PositionCRThresholdsSet",
  "PositionInterestRateSet",
  "PositionOriginatorFeeRateSet",
  "MaxRateSet",
  "MintCapSet",
  "Paused",
  "Unpaused",
  "OriginatorFeeAccrued",
]);
const enclaveEventNames = new Set([
  "Upgraded",
  "Initialized",
  "RoleAdminChanged",
  "RoleGranted",
  "RoleRevoked",
  "TargetAdded",
  "TargetRemoved",
  "TripartyBridgeRequested",
  "TripartyBridgeCompleted",
  "VeBTCLocked",
  "VeBTCIncreased",
  "VeBTCMerged",
  "VeBTCWithdrawn",
]);

const output = {
  schemaVersion: 1,
  kind: "institutional-musd-debt-fixed-block-observation",
  id: "institutional-musd-debt-mainnet-state",
  owner: "protocols/musd/institutional-debt",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt: capturedAt,
  reviewAfter: "2026-09-23T00:00:00Z",
  scope: {
    networkId: "mezo-mainnet",
    blockNumber,
    blockHash,
    blockTimestamp,
  },
  limitations: [
    "Role members, targets, positions, collateral, rates, totals, UTXOs, and governed parameters are point-in-time observations at the pinned block.",
    "Event enumeration discovers known position IDs but does not make an event sufficient proof of current position or collateral state.",
    "The observation does not combine institutional debt with classic trove debt/TCR, Savings, bridges, pools, or strategy allocations.",
    "No transaction writer or support promise is created by this evidence.",
  ],
  provider: {
    networkReference: {
      moduleId: "networks",
      resourceId: "rpc-endpoints",
      recordId: "mezo-mainnet-boar-https",
    },
    explorerApi: explorerUrl,
  },
  contracts: contractEvidence,
  proxies: {
    originalEnclave: await readProxy(
      addresses.originalEnclaveProxy,
      originalEnclaveLogs,
      blockNumberHex,
    ),
    secondEnclave: await readProxy(addresses.secondEnclaveProxy, secondEnclaveLogs, blockNumberHex),
    debtManager: await readProxy(addresses.debtManagerProxy, debtLogs, blockNumberHex),
  },
  enclaves: [
    await readEnclave(addresses.originalEnclaveProxy, "original", blockNumberHex),
    await readEnclave(addresses.secondEnclaveProxy, "second", blockNumberHex),
  ],
  debtManager: {
    address: addresses.debtManagerProxy,
    dependencies: {
      musd: decodeAddress(await call(addresses.debtManagerProxy, selectors.musd, blockNumberHex)),
      veBtc: decodeAddress(await call(addresses.debtManagerProxy, selectors.veBtc, blockNumberHex)),
      priceFeed: decodeAddress(
        await call(addresses.debtManagerProxy, selectors.priceFeed, blockNumberHex),
      ),
      pcv: decodeAddress(await call(addresses.debtManagerProxy, selectors.pcv, blockNumberHex)),
    },
    roles: await readRoles(addresses.debtManagerProxy, blockNumberHex, [
      ["DEFAULT_ADMIN_ROLE", selectors.defaultAdminRole],
      ["GOVERNANCE_ROLE", selectors.governanceRole],
      ["ENCLAVE_ROLE", selectors.enclaveRole],
      ["PAUSER_ROLE", selectors.pauserRole],
    ]),
    parameters: {
      maxPledgedVeBtc: decodeUint(
        await call(addresses.debtManagerProxy, selectors.maxPledgedVeBtc, blockNumberHex),
      ),
      minimumMinimumCr: decodeUint(
        await call(addresses.debtManagerProxy, selectors.minMinimumCr, blockNumberHex),
      ),
      maxCombinedRateBps: decodeUint(
        await call(addresses.debtManagerProxy, selectors.maxRate, blockNumberHex),
      ),
      mintCap: decodeUint(
        await call(addresses.debtManagerProxy, selectors.mintCap, blockNumberHex),
      ),
      paused: decodeBool(await call(addresses.debtManagerProxy, selectors.paused, blockNumberHex)),
    },
    totals: {
      totalPrincipal: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalPrincipal, blockNumberHex),
      ),
      totalMintedDebt: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalMintedDebt, blockNumberHex),
      ),
      totalInterestMinted: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalInterestMinted, blockNumberHex),
      ),
      totalOriginatorFeeMinted: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalOriginatorFeeMinted, blockNumberHex),
      ),
      totalDebtBurned: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalDebtBurned, blockNumberHex),
      ),
      totalFeesStored: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalFeesStored, blockNumberHex),
      ),
      totalFeeSettled: decodeUint(
        await call(addresses.debtManagerProxy, selectors.totalFeeSettled, blockNumberHex),
      ),
      accruedInterestSinceAccumulatorUpdate: decodeUint(
        await call(addresses.debtManagerProxy, selectors.getAccruedInterest, blockNumberHex),
      ),
      totalOutstandingDebt: decodeUint(
        await call(addresses.debtManagerProxy, selectors.getTotalOutstandingDebt, blockNumberHex),
      ),
      interestAccumulator: decodePair(
        await call(addresses.debtManagerProxy, selectors.interest, blockNumberHex),
      ),
      combinedFeeAccumulator: decodePair(
        await call(addresses.debtManagerProxy, selectors.combinedFees, blockNumberHex),
      ),
    },
    positions,
    originators: originatorState,
  },
  events: {
    debtManager: summarizeEvents(debtLogs, debtEventNames),
    originalEnclave: summarizeEvents(originalEnclaveLogs, enclaveEventNames),
    secondEnclave: summarizeEvents(secondEnclaveLogs, enclaveEventNames),
  },
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (outputPath) {
  await writeFile(outputPath, serialized);
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
