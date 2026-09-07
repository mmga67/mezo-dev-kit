import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const rpcUrl = process.env.MDK_MEZO_RPC_URL ?? "https://mezo-mainnet.boar.network";
const explorerUrl = process.env.MDK_MEZO_EXPLORER_API_URL ?? "https://api.explorer.mezo.org";
const fixedBlockNumber = Number.parseInt(
  process.env.MDK_VALIDATOR_EVIDENCE_BLOCK ?? "11366264",
  10,
);

const voter = "0xe99a9ad5ed26bd30e4db25397f378817e9b9515a";
const ve = "0x3d4b1b884a7a1e59fe8589a3296ec8f8cbb6f279";
const factoryRegistry = "0x04b94f55780682478c8d8329368aaafd320f4d32";
const gaugeFactory = "0x4150dce1c6d013fa7ebaf4ffcd879d08daa0ccad";
const rewardToken = "0x7b7c000000000000000000000000000000000001";
const scale = 10n ** 18n;
const week = 604800n;

const selectors = {
  claimable: "0x402914f5",
  earned: "0x008cc262",
  factoryRegistry: "0x3bf0c9fb",
  gaugeFactoryToVotingRewardsFactory: "0x19ff51ca",
  gauges: "0xb0539187",
  gaugeToBribe: "0x929c8dcd",
  governor: "0x0c340a24",
  isAlive: "0x1703e5f9",
  isGaugeFactoryApproved: "0x47173b6c",
  lastUpdateTime: "0xc8f33c91",
  lastVoted: "0xf3594be0",
  left: "0x16e64048",
  length: "0x1f7b6d32",
  locked: "0xb45a3c0e",
  maxVotingNum: "0xe8b3fd57",
  periodFinish: "0xebe2b12b",
  rewardRate: "0x7b0a47ee",
  rewards: "0x0700037d",
  rewardsBeneficiary: "0x1221a37b",
  rewardToken: "0xf7c618c1",
  splitter: "0x3cd8045e",
  totalSupply: "0x18160ddd",
  totalWeight: "0x96c82e57",
  unboostedVotingPowerOfNFT: "0xb73c900b",
  usedWeights: "0x79e93824",
  validatorPool: "0xd4c6d1de",
  validatorToGauge: "0x418792b3",
  ve: "0x1f850716",
  voter: "0x46c96aac",
  votes: "0xd23254b4",
  votingPowerOfNFT: "0x03709b10",
  weights: "0xa7cac846",
} as const;

const topics = {
  abstained: "0xadab630928b1d46214641293704a312ee7ad87e03ae14a7fd95e7308b93998df",
  claimRewards: "0x1f89f96333d3133000ee447473151fa9606543368f02271c9d95ae14f13bcc67",
  distributeReward: "0x4fa9693cae526341d334e2862ca2413b2e503f1266255f9e0869fb36e6d89b17",
  gaugeNotifyReward: "0x095667752957714306e1a6ad83495404412df6fdb932fca6dc849a7ee910d4c1",
  notifyReward: "0xf70d5c697de7ea828df48e5c4573cb2194c659f1901f70110c52b066dcf50826",
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  validatorGaugeCreated: "0x2ff99b32165f29d632e29e712b8adea9e8e9ec21a9531e6b7d6c63c63734ca6f",
  validatorLeft: "0xeca0dd1b499a6d210d171754419106079a732e38822d548a6a6b25a7ebe9d9b7",
  voted: "0x452d440efc30dfa14a0ef803ccb55936af860ec6a6960ed27f129bef913f296a",
} as const;

type JsonRecord = Record<string, unknown>;
type CallOutcome = { status: "available"; raw: string } | { status: "unavailable"; reason: string };

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} is not a string`);
  return value;
}

function normalizeAddress(value: unknown): string {
  const match = /[a-f0-9]{40}$/.exec(String(value).toLowerCase());
  if (!match) fail(`invalid address '${String(value)}'`);
  return `0x${match[0]}`;
}

function normalizeHash(value: unknown): string {
  const normalized = String(value).toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) fail(`invalid hash '${String(value)}'`);
  return normalized;
}

function blockTag(blockNumber: number): string {
  if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) fail("invalid block number");
  return `0x${blockNumber.toString(16)}`;
}

function words(raw: string): string[] {
  const normalized = raw.replace(/^0x/, "");
  if (normalized.length % 64 !== 0 || !/^[a-fA-F0-9]*$/.test(normalized)) {
    fail(`invalid word-aligned result '${raw.slice(0, 80)}'`);
  }
  return normalized.match(/.{64}/g) ?? [];
}

function uintWord(value: bigint): string {
  if (value < 0n) fail("negative uint argument");
  return value.toString(16).padStart(64, "0");
}

function addressWord(value: string): string {
  return normalizeAddress(value).slice(2).padStart(64, "0");
}

function decodeUint(raw: string): bigint {
  const output = words(raw);
  if (output.length !== 1) fail(`expected one uint word, received ${output.length}`);
  return BigInt(`0x${output[0]}`);
}

function decodeAddress(raw: string): string {
  const output = words(raw);
  if (output.length !== 1) fail(`expected one address word, received ${output.length}`);
  return normalizeAddress(output[0]);
}

function decodeBool(raw: string): boolean {
  return decodeUint(raw) !== 0n;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      if (!response.ok) fail(`${url} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
      return JSON.parse(raw) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  fail(`request failed after retries: ${String(lastError)}`);
}

let rpcId = 0;
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const body = record(
    await fetchJson(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
    `${method} response`,
  );
  if (body.error !== undefined || body.result === undefined) {
    fail(`${method} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.result;
}

async function call(address: string, data: string, atBlock: number): Promise<string> {
  const result = await rpc("eth_call", [{ to: address, data }, blockTag(atBlock)]);
  return string(result, "eth_call result");
}

async function safeCall(address: string, data: string, atBlock: number): Promise<CallOutcome> {
  try {
    return { status: "available", raw: await call(address, data, atBlock) };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mustUint(address: string, data: string, atBlock: number): Promise<bigint> {
  return decodeUint(await call(address, data, atBlock));
}

async function mustAddress(address: string, data: string, atBlock: number): Promise<string> {
  return decodeAddress(await call(address, data, atBlock));
}

function decodedCall(outcome: CallOutcome, decode: (raw: string) => unknown): JsonRecord {
  if (outcome.status === "unavailable") return outcome;
  return { status: "available", raw: outcome.raw, value: decode(outcome.raw) };
}

async function block(number: number): Promise<JsonRecord> {
  const result = record(
    await rpc("eth_getBlockByNumber", [blockTag(number), false]),
    `block ${number}`,
  );
  return {
    number,
    hash: normalizeHash(result.hash),
    timestamp: new Date(
      Number.parseInt(string(result.timestamp, "block timestamp"), 16) * 1000,
    ).toISOString(),
    timestampRaw: String(Number.parseInt(string(result.timestamp, "block timestamp"), 16)),
  };
}

async function legacyLogs(topic: string, address?: string): Promise<JsonRecord[]> {
  const query = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: "0",
    toBlock: String(fixedBlockNumber),
    topic0: topic,
  });
  if (address) query.set("address", normalizeAddress(address));
  const response = record(
    await fetchJson(`${explorerUrl}/api?${query.toString()}`),
    "legacy log response",
  );
  if (response.message === "No records found") return [];
  if (response.message !== "OK") fail(`legacy log query failed: ${JSON.stringify(response)}`);
  return array(response.result, "legacy log result").map((entry) => record(entry, "legacy log"));
}

function eventCoordinate(log: JsonRecord, event: string, parameters: JsonRecord): JsonRecord {
  return {
    event,
    blockNumber: Number.parseInt(string(log.blockNumber, "event block number"), 16),
    blockHash: typeof log.blockHash === "string" ? normalizeHash(log.blockHash) : null,
    transactionHash: normalizeHash(log.transactionHash),
    logIndex: Number.parseInt(string(log.logIndex, "event log index"), 16),
    parameters,
  };
}

function rawTopic(log: JsonRecord, index: number): string {
  return string(array(log.topics, "event topics")[index], `event topic ${index}`);
}

function rawDataWords(log: JsonRecord): string[] {
  return words(string(log.data, "event data"));
}

function decodeLegacyEvent(log: JsonRecord, event: string): JsonRecord {
  const data = rawDataWords(log);
  if (event === "ValidatorGaugeCreated") {
    return eventCoordinate(log, event, {
      operator: normalizeAddress(rawTopic(log, 1)),
      gauge: normalizeAddress(rawTopic(log, 2)),
      beneficiary: normalizeAddress(rawTopic(log, 3)),
    });
  }
  if (event === "ValidatorLeft") {
    return eventCoordinate(log, event, {
      operator: normalizeAddress(rawTopic(log, 1)),
      gauge: normalizeAddress(rawTopic(log, 2)),
    });
  }
  if (event === "Voted" || event === "Abstained") {
    if (data.length !== 3) fail(`${event} data is malformed`);
    return eventCoordinate(log, event, {
      voter: normalizeAddress(rawTopic(log, 1)),
      gauge: normalizeAddress(rawTopic(log, 2)),
      tokenId: BigInt(rawTopic(log, 3)).toString(),
      weight: BigInt(`0x${data[0]}`).toString(),
      totalWeight: BigInt(`0x${data[1]}`).toString(),
      timestamp: BigInt(`0x${data[2]}`).toString(),
    });
  }
  if (event === "NotifyReward") {
    if (data.length !== 1) fail("NotifyReward data is malformed");
    return eventCoordinate(log, event, {
      sender: normalizeAddress(rawTopic(log, 1)),
      reward: normalizeAddress(rawTopic(log, 2)),
      amount: BigInt(`0x${data[0]}`).toString(),
    });
  }
  if (event === "DistributeReward") {
    if (data.length !== 1) fail("DistributeReward data is malformed");
    return eventCoordinate(log, event, {
      sender: normalizeAddress(rawTopic(log, 1)),
      gauge: normalizeAddress(rawTopic(log, 2)),
      amount: BigInt(`0x${data[0]}`).toString(),
    });
  }
  if (event === "ClaimRewards") {
    if (data.length !== 1) fail("ClaimRewards data is malformed");
    return eventCoordinate(log, event, {
      from: normalizeAddress(rawTopic(log, 1)),
      amount: BigInt(`0x${data[0]}`).toString(),
    });
  }
  fail(`unsupported legacy event ${event}`);
}

function functionData(selector: string, ...arguments_: string[]): string {
  return `${selector}${arguments_.join("")}`;
}

function decodeVoteInput(input: string): {
  tokenId: bigint;
  gauges: string[];
  weights: bigint[];
} {
  const normalized = input.toLowerCase().replace(/^0x/, "");
  if (!normalized.startsWith("7ac09bf7"))
    fail("transaction is not vote(uint256,address[],uint256[])");
  const argumentsHex = normalized.slice(8);
  const read = (byteOffset: number): bigint =>
    BigInt(`0x${argumentsHex.slice(byteOffset * 2, byteOffset * 2 + 64)}`);
  const tokenId = read(0);
  const gaugesOffset = Number(read(32));
  const weightsOffset = Number(read(64));
  const gaugesLength = Number(read(gaugesOffset));
  const weightsLength = Number(read(weightsOffset));
  if (gaugesLength !== weightsLength || gaugesLength > 100) fail("vote arrays are invalid");
  const gauges = Array.from({ length: gaugesLength }, (_, index) =>
    normalizeAddress(
      argumentsHex.slice(
        (gaugesOffset + 32 + index * 32) * 2,
        (gaugesOffset + 64 + index * 32) * 2,
      ),
    ),
  );
  const weights = Array.from({ length: weightsLength }, (_, index) =>
    read(weightsOffset + 32 + index * 32),
  );
  return { tokenId, gauges, weights };
}

function rawReceiptEvents(receipt: JsonRecord, topic: string): JsonRecord[] {
  return array(receipt.logs, "receipt logs")
    .map((entry) => record(entry, "receipt log"))
    .filter((entry) => {
      const logTopics = array(entry.topics, "receipt topics");
      return String(logTopics[0]).toLowerCase() === topic;
    });
}

async function transaction(hash: string): Promise<JsonRecord> {
  return record(await rpc("eth_getTransactionByHash", [hash]), `transaction ${hash}`);
}

async function receipt(hash: string): Promise<JsonRecord> {
  return record(await rpc("eth_getTransactionReceipt", [hash]), `receipt ${hash}`);
}

async function gaugeState(address: string, atBlock: number): Promise<JsonRecord> {
  const definitions: readonly (readonly [string, string, (raw: string) => unknown])[] = [
    [
      "weightRaw",
      functionData(selectors.weights, addressWord(address)),
      (raw) => decodeUint(raw).toString(),
    ],
    [
      "claimableRaw",
      functionData(selectors.claimable, addressWord(address)),
      (raw) => decodeUint(raw).toString(),
    ],
    ["alive", functionData(selectors.isAlive, addressWord(address)), decodeBool],
    ["bribe", functionData(selectors.gaugeToBribe, addressWord(address)), decodeAddress],
  ];
  const gaugeDefinitions: readonly (readonly [string, string, (raw: string) => unknown])[] = [
    ["rewardsBeneficiary", selectors.rewardsBeneficiary, decodeAddress],
    ["voter", selectors.voter, decodeAddress],
    ["rewardToken", selectors.rewardToken, decodeAddress],
    ["totalSupplyRaw", selectors.totalSupply, (raw) => decodeUint(raw).toString()],
    ["leftRaw", selectors.left, (raw) => decodeUint(raw).toString()],
    ["rewardRateRaw", selectors.rewardRate, (raw) => decodeUint(raw).toString()],
    ["periodFinish", selectors.periodFinish, (raw) => decodeUint(raw).toString()],
    ["lastUpdateTime", selectors.lastUpdateTime, (raw) => decodeUint(raw).toString()],
  ];
  const result: JsonRecord = { address };
  const voterResults = await Promise.all(
    definitions.map(
      async ([name, data, decode]) =>
        [name, decodedCall(await safeCall(voter, data, atBlock), decode)] as const,
    ),
  );
  const gaugeResults = await Promise.all(
    gaugeDefinitions.map(
      async ([name, data, decode]) =>
        [name, decodedCall(await safeCall(address, data, atBlock), decode)] as const,
    ),
  );
  for (const [name, value] of [...voterResults, ...gaugeResults]) {
    result[name] = value;
  }
  return result;
}

if (!Number.isSafeInteger(fixedBlockNumber) || fixedBlockNumber <= 0) {
  fail("MDK_VALIDATOR_EVIDENCE_BLOCK must be a positive safe integer");
}

const chainId = Number(BigInt(string(await rpc("eth_chainId", []), "chain ID")));
if (chainId !== 31612) fail(`RPC returned chain ${chainId}`);
const snapshot = await block(fixedBlockNumber);

const length = Number(await mustUint(voter, selectors.length, fixedBlockNumber));
if (!Number.isSafeInteger(length) || length > 100) fail(`unsafe validator gauge count ${length}`);
const gaugeAddresses = await Promise.all(
  Array.from({ length }, (_, index) =>
    mustAddress(voter, functionData(selectors.gauges, uintWord(BigInt(index))), fixedBlockNumber),
  ),
);

const currentGauges: JsonRecord[] = [];
for (let start = 0; start < gaugeAddresses.length; start += 4) {
  const chunk = gaugeAddresses.slice(start, start + 4);
  currentGauges.push(
    ...(await Promise.all(
      chunk.map(async (address, offset) => ({
        index: start + offset,
        ...(await gaugeState(address, fixedBlockNumber)),
      })),
    )),
  );
}
const currentWeightSum = currentGauges.reduce((sum, gauge) => {
  const outcome = record(gauge.weightRaw, "gauge weight outcome");
  return outcome.status === "available" ? sum + BigInt(String(outcome.value)) : sum;
}, 0n);
const currentTotalWeight = await mustUint(voter, selectors.totalWeight, fixedBlockNumber);

const eventDefinitions = [
  ["ValidatorGaugeCreated", topics.validatorGaugeCreated],
  ["ValidatorLeft", topics.validatorLeft],
  ["Voted", topics.voted],
  ["Abstained", topics.abstained],
  ["NotifyReward", topics.notifyReward],
  ["DistributeReward", topics.distributeReward],
] as const;
const eventGroups = await Promise.all(
  eventDefinitions.map(async ([event, topic]) => ({
    event,
    records: (await legacyLogs(topic, voter)).map((log) => decodeLegacyEvent(log, event)),
  })),
);
const allVoterEvents = eventGroups.flatMap((group) => group.records);
const eventCounts = eventGroups
  .map((group) => ({ event: group.event, count: group.records.length }))
  .sort((left, right) => left.event.localeCompare(right.event));

const creationCandidates = allVoterEvents
  .filter((event) => event.event === "ValidatorGaugeCreated")
  .sort((left, right) => Number(left.blockNumber) - Number(right.blockNumber));
const departureCandidates = allVoterEvents
  .filter((event) => event.event === "ValidatorLeft")
  .sort((left, right) => Number(left.blockNumber) - Number(right.blockNumber));
const creations: JsonRecord[] = await Promise.all(
  creationCandidates.map(async (event): Promise<JsonRecord> => ({
    ...event,
    blockHash: (await block(Number(event.blockNumber))).hash,
  })),
);
const validatorDepartures: JsonRecord[] = await Promise.all(
  departureCandidates.map(async (event): Promise<JsonRecord> => ({
    ...event,
    blockHash: (await block(Number(event.blockNumber))).hash,
  })),
);

let voteTransaction: JsonRecord | null = null;
let voteLog: JsonRecord | null = null;
const historicalVotes = allVoterEvents
  .filter((event) => event.event === "Voted")
  .sort((left, right) => Number(right.blockNumber) - Number(left.blockNumber));
for (const candidate of historicalVotes) {
  const candidateTransaction = await transaction(normalizeHash(candidate.transactionHash));
  const input = string(
    candidateTransaction.input ?? candidateTransaction.raw_input ?? "",
    "candidate vote input",
  ).toLowerCase();
  if (input.startsWith("0x7ac09bf7")) {
    voteTransaction = candidateTransaction;
    voteLog = candidate;
    break;
  }
}
if (!voteTransaction || !voteLog) fail("no direct vote transaction was found in explorer history");

const voteHash = normalizeHash(voteLog.transactionHash);
const voteBlock = Number(voteLog.blockNumber);
const voteBlockData = await block(voteBlock);
const voteInput = decodeVoteInput(
  string(voteTransaction.input ?? voteTransaction.raw_input, "vote input"),
);
const voteReceipt = await receipt(voteHash);
const transactionVoterEvents = allVoterEvents.filter(
  (event) => normalizeHash(event.transactionHash) === voteHash,
);
const voteEvents: JsonRecord[] = transactionVoterEvents
  .filter((event) => event.event === "Voted")
  .map((event): JsonRecord => ({ ...event, blockHash: voteBlockData.hash }));
const abstainEvents: JsonRecord[] = transactionVoterEvents
  .filter((event) => event.event === "Abstained")
  .map((event): JsonRecord => ({ ...event, blockHash: voteBlockData.hash }));
const lockedWords = words(
  await call(ve, functionData(selectors.locked, uintWord(voteInput.tokenId)), voteBlock),
);
if (lockedWords.length !== 4) fail("locked result does not contain four fields");
const boostedVotingPower = await mustUint(
  ve,
  functionData(selectors.votingPowerOfNFT, uintWord(voteInput.tokenId)),
  voteBlock,
);
const unboostedVotingPower = await mustUint(
  ve,
  functionData(selectors.unboostedVotingPowerOfNFT, uintWord(voteInput.tokenId)),
  voteBlock,
);
const rawWeightTotal = voteInput.weights.reduce((sum, value) => sum + value, 0n);
const expectedAllocations = voteInput.gauges.map((address, index) => ({
  gauge: address,
  externalWeight: voteInput.weights[index]!.toString(),
  expectedGaugeVoteRaw: (
    (voteInput.weights[index]! * boostedVotingPower) /
    rawWeightTotal
  ).toString(),
}));
const expectedUsedWeight = expectedAllocations.reduce(
  (sum, allocation) => sum + BigInt(allocation.expectedGaugeVoteRaw),
  0n,
);
const voteGaugeReconciliation: JsonRecord[] = [];
for (const allocation of expectedAllocations) {
  const data = functionData(
    selectors.votes,
    uintWord(voteInput.tokenId),
    addressWord(allocation.gauge),
  );
  voteGaugeReconciliation.push({
    ...allocation,
    preVoteRaw: (await mustUint(voter, data, voteBlock - 1)).toString(),
    postVoteRaw: (await mustUint(voter, data, voteBlock)).toString(),
  });
}
const abstainedSum = abstainEvents.reduce(
  (sum, event) => sum + BigInt(String(record(event.parameters, "abstain parameters").weight)),
  0n,
);
const votedSum = voteEvents.reduce(
  (sum, event) => sum + BigInt(String(record(event.parameters, "vote parameters").weight)),
  0n,
);
const voteTotalWeightPre = await mustUint(voter, selectors.totalWeight, voteBlock - 1);
const voteTotalWeightPost = await mustUint(voter, selectors.totalWeight, voteBlock);
const voteUsedWeightPost = await mustUint(
  voter,
  functionData(selectors.usedWeights, uintWord(voteInput.tokenId)),
  voteBlock,
);

const notifyCandidate = allVoterEvents
  .filter((event) => event.event === "NotifyReward")
  .sort((left, right) => Number(right.blockNumber) - Number(left.blockNumber))[0];
if (!notifyCandidate) fail("no NotifyReward event was found");
const notifyEvent: JsonRecord = {
  ...notifyCandidate,
  blockHash: (await block(Number(notifyCandidate.blockNumber))).hash,
};
const notifyBlock = Number(notifyEvent.blockNumber);
const notifyParameters = record(notifyEvent.parameters, "notify parameters");
const notifiedAmount = BigInt(String(notifyParameters.amount));
const notifyTotalWeight = await mustUint(voter, selectors.totalWeight, notifyBlock - 1);
const notifyGaugeCount = Number(await mustUint(voter, selectors.length, notifyBlock - 1));
const notifyIndexDelta =
  (notifiedAmount * scale) / (notifyTotalWeight > 0n ? notifyTotalWeight : 1n);
const notifyGaugeAddresses = await Promise.all(
  Array.from({ length: notifyGaugeCount }, (_, index) =>
    mustAddress(voter, functionData(selectors.gauges, uintWord(BigInt(index))), notifyBlock - 1),
  ),
);
const notifyWeights = await Promise.all(
  notifyGaugeAddresses.map(async (gauge) => {
    const weight = await mustUint(
      voter,
      functionData(selectors.weights, addressWord(gauge)),
      notifyBlock - 1,
    );
    return {
      gauge,
      weightRaw: weight.toString(),
      indexShareRaw: ((weight * notifyIndexDelta) / scale).toString(),
    };
  }),
);
const notifyWeightSum = notifyWeights.reduce((sum, entry) => sum + BigInt(entry.weightRaw), 0n);
const notifyShareSum = notifyWeights.reduce((sum, entry) => sum + BigInt(entry.indexShareRaw), 0n);

const distributeCandidate = allVoterEvents
  .filter((event) => event.event === "DistributeReward")
  .sort((left, right) => Number(right.blockNumber) - Number(left.blockNumber))[0];
if (!distributeCandidate) fail("no DistributeReward event was found");
const distributeEvent: JsonRecord = {
  ...distributeCandidate,
  blockHash: (await block(Number(distributeCandidate.blockNumber))).hash,
};
const distributeBlock = Number(distributeEvent.blockNumber);
const distributeBlockData = await block(distributeBlock);
const distributeTimestamp = BigInt(String(distributeBlockData.timestampRaw));
const distributeParameters = record(distributeEvent.parameters, "distribution parameters");
const distributeGauge = normalizeAddress(distributeParameters.gauge);
const distributeAmount = BigInt(String(distributeParameters.amount));
const distributeClaimablePre = await safeCall(
  voter,
  functionData(selectors.claimable, addressWord(distributeGauge)),
  distributeBlock - 1,
);
const distributeClaimablePost = await safeCall(
  voter,
  functionData(selectors.claimable, addressWord(distributeGauge)),
  distributeBlock,
);
const preRewardRate = await safeCall(distributeGauge, selectors.rewardRate, distributeBlock - 1);
const prePeriodFinish = await safeCall(
  distributeGauge,
  selectors.periodFinish,
  distributeBlock - 1,
);
const postRewardRate = await safeCall(distributeGauge, selectors.rewardRate, distributeBlock);
const postPeriodFinish = await safeCall(distributeGauge, selectors.periodFinish, distributeBlock);
let expectedPostRewardRate: string | null = null;
let expectedPostPeriodFinish: string | null = null;
let rolloverLeftover: string | null = null;
if (
  preRewardRate.status === "available" &&
  prePeriodFinish.status === "available" &&
  postRewardRate.status === "available"
) {
  const rate = decodeUint(preRewardRate.raw);
  const finish = decodeUint(prePeriodFinish.raw);
  const leftover = distributeTimestamp < finish ? (finish - distributeTimestamp) * rate : 0n;
  const nextEpoch = distributeTimestamp - (distributeTimestamp % week) + week;
  expectedPostRewardRate = (
    (distributeAmount + leftover) /
    (nextEpoch - distributeTimestamp)
  ).toString();
  expectedPostPeriodFinish = nextEpoch.toString();
  rolloverLeftover = leftover.toString();
}
const distributeReceipt = await receipt(normalizeHash(distributeEvent.transactionHash));
const downstreamNotifyEvents = rawReceiptEvents(distributeReceipt, topics.gaugeNotifyReward).map(
  (entry) => ({
    address: normalizeAddress(entry.address),
    from: normalizeAddress(array(entry.topics, "gauge notify topics")[1]),
    amountRaw: decodeUint(string(entry.data, "gauge notify data")).toString(),
    logIndex: Number.parseInt(String(entry.logIndex), 16),
  }),
);
const distributionTransfers = rawReceiptEvents(distributeReceipt, topics.transfer)
  .filter((entry) => normalizeAddress(entry.address) === rewardToken)
  .map((entry) => ({
    token: normalizeAddress(entry.address),
    from: normalizeAddress(array(entry.topics, "transfer topics")[1]),
    to: normalizeAddress(array(entry.topics, "transfer topics")[2]),
    amountRaw: decodeUint(string(entry.data, "transfer data")).toString(),
    logIndex: Number.parseInt(String(entry.logIndex), 16),
  }));

let claimEvidence: JsonRecord = {
  status: "unavailable",
  reason: "No ClaimRewards event was found for a current validator gauge in the bounded history.",
};
const gaugeAddressSet = new Set(gaugeAddresses);
const historicalClaims: JsonRecord[] = (await legacyLogs(topics.claimRewards))
  .filter((log) => gaugeAddressSet.has(normalizeAddress(log.address)))
  .map((log): JsonRecord => ({
    ...decodeLegacyEvent(log, "ClaimRewards"),
    gauge: normalizeAddress(log.address),
  }))
  .sort((left, right) => Number(right.blockNumber) - Number(left.blockNumber));
for (const claim of historicalClaims) {
  const claimWithHash: JsonRecord = {
    ...claim,
    blockHash: (await block(Number(claim.blockNumber))).hash,
  };
  const claimParameters = record(claimWithHash.parameters, "claim parameters");
  const account = normalizeAddress(claimParameters.from);
  const claimAmount = String(claimParameters.amount);
  const claimBlock = Number(claimWithHash.blockNumber);
  const address = normalizeAddress(claimWithHash.gauge);
  const claimReceipt = await receipt(normalizeHash(claimWithHash.transactionHash));
  const rewardTransfers = rawReceiptEvents(claimReceipt, topics.transfer)
    .filter((entry) => normalizeAddress(entry.address) === rewardToken)
    .map((entry) => ({
      token: normalizeAddress(entry.address),
      from: normalizeAddress(array(entry.topics, "claim transfer topics")[1]),
      to: normalizeAddress(array(entry.topics, "claim transfer topics")[2]),
      amountRaw: decodeUint(string(entry.data, "claim transfer data")).toString(),
      logIndex: Number.parseInt(String(entry.logIndex), 16),
    }));
  claimEvidence = {
    status: "available",
    event: claimWithHash,
    gauge: address,
    account,
    amountRaw: claimAmount,
    rewardsStoragePre: decodedCall(
      await safeCall(
        address,
        functionData(selectors.rewards, addressWord(account)),
        claimBlock - 1,
      ),
      (raw) => decodeUint(raw).toString(),
    ),
    rewardsStoragePost: decodedCall(
      await safeCall(address, functionData(selectors.rewards, addressWord(account)), claimBlock),
      (raw) => decodeUint(raw).toString(),
    ),
    rewardTransfers,
  };
  break;
}

const output = {
  schemaVersion: 1,
  kind: "incentives-validator-allocation-observation",
  id: "incentives-validator-allocation-mainnet",
  owner: "protocols/incentives",
  status: "verified",
  evidenceStatus: "verified-point-in-time",
  supportStatus: "none",
  reviewStatus: "pending-qualified-review",
  verifiedAt: new Date().toISOString(),
  reviewAfter: "2026-09-22T00:00:00Z",
  scope: { networkIds: ["mezo-mainnet"], blockNumber: fixedBlockNumber, blockHash: snapshot.hash },
  limitations: [
    "Current weights and claimable amounts are point-in-time state; settled events remain historical facts and are not replaced by later reads.",
    "Explorer event-topic queries and historical RPC reads establish the bounded observations only; archive failures are retained as typed unavailable outcomes.",
    "Dynamic validator gauges and voting-reward contracts are factory-created instances, not static Contract registry identities.",
    "This evidence creates no vote, distribution, claim, validator-operation, analytics, reader, or writer support.",
  ],
  networkSnapshot: {
    networkId: "mezo-mainnet",
    evmChainId: chainId,
    blockNumber: fixedBlockNumber,
    blockHash: snapshot.hash,
    blockTimestamp: snapshot.timestamp,
    rpcUrl,
    explorerApiUrl: explorerUrl,
  },
  methods: [
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_call at fixed, pre-event, and post-event blocks",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "official explorer paginated decoded logs",
  ],
  topology: {
    voter: {
      contractReference: {
        moduleId: "contracts",
        resourceId: "contract-deployments",
        recordId: "incentives.validators-voter@mezo-mainnet",
      },
      address: voter,
      ve: await mustAddress(voter, selectors.ve, fixedBlockNumber),
      splitter: await mustAddress(voter, selectors.splitter, fixedBlockNumber),
      rewardToken: await mustAddress(voter, selectors.rewardToken, fixedBlockNumber),
      factoryRegistry: await mustAddress(voter, selectors.factoryRegistry, fixedBlockNumber),
      validatorPool: await mustAddress(voter, selectors.validatorPool, fixedBlockNumber),
      governor: await mustAddress(voter, selectors.governor, fixedBlockNumber),
      maxVotingNum: (await mustUint(voter, selectors.maxVotingNum, fixedBlockNumber)).toString(),
    },
    gaugeFactory: {
      address: gaugeFactory,
      approved: decodeBool(
        await call(
          factoryRegistry,
          functionData(selectors.isGaugeFactoryApproved, addressWord(gaugeFactory)),
          fixedBlockNumber,
        ),
      ),
      votingRewardsFactory: await mustAddress(
        factoryRegistry,
        functionData(selectors.gaugeFactoryToVotingRewardsFactory, addressWord(gaugeFactory)),
        fixedBlockNumber,
      ),
    },
  },
  currentBoundaryState: {
    gaugeCount: length,
    totalWeightRaw: currentTotalWeight.toString(),
    sumGaugeWeightsRaw: currentWeightSum.toString(),
    weightSumMatches: currentWeightSum === currentTotalWeight,
    gauges: currentGauges,
  },
  lifecycleHistory: {
    voterLogCount: allVoterEvents.length,
    voterLogDigest: sha256(JSON.stringify(allVoterEvents)),
    eventCounts,
    validatorGaugeCreations: creations,
    validatorDepartures,
    currentGaugeListMatchesCreationHistory: gaugeAddresses.every((address) =>
      creations.some(
        (creation) =>
          normalizeAddress(record(creation.parameters, "creation parameters").gauge) === address,
      ),
    ),
  },
  representativeVote: {
    transactionHash: voteHash,
    blockNumber: voteBlock,
    tokenId: voteInput.tokenId.toString(),
    rawLockedBTC: {
      amountRaw: BigInt(`0x${lockedWords[0]}`).toString(),
      unlockTimestamp: BigInt(`0x${lockedWords[1]}`).toString(),
      permanent: BigInt(`0x${lockedWords[2]}`) !== 0n,
      storedBoostRaw: BigInt(`0x${lockedWords[3]}`).toString(),
    },
    unboostedVotingPowerRaw: unboostedVotingPower.toString(),
    boostedVotingPowerRaw: boostedVotingPower.toString(),
    externalVoteWeightTotal: rawWeightTotal.toString(),
    allocations: voteGaugeReconciliation,
    expectedUsedWeightRaw: expectedUsedWeight.toString(),
    postUsedWeightRaw: voteUsedWeightPost.toString(),
    allocationFloorDustRaw: (boostedVotingPower - expectedUsedWeight).toString(),
    abstainedEvents: abstainEvents,
    votedEvents: voteEvents,
    abstainedWeightSumRaw: abstainedSum.toString(),
    votedWeightSumRaw: votedSum.toString(),
    totalWeightPreRaw: voteTotalWeightPre.toString(),
    totalWeightPostRaw: voteTotalWeightPost.toString(),
    totalWeightTransitionMatches:
      voteTotalWeightPre - abstainedSum + votedSum === voteTotalWeightPost,
    receiptStatus: String(voteReceipt.status),
  },
  representativeRewardNotification: {
    event: notifyEvent,
    preState: {
      totalWeightRaw: notifyTotalWeight.toString(),
      gaugeCount: notifyGaugeCount,
      sumGaugeWeightsRaw: notifyWeightSum.toString(),
      weightSumMatches: notifyWeightSum === notifyTotalWeight,
    },
    indexDeltaRaw: notifyIndexDelta.toString(),
    perGaugeIndexShares: notifyWeights,
    shareSumRaw: notifyShareSum.toString(),
    floorDustRaw: (notifiedAmount - notifyShareSum).toString(),
  },
  representativeDistribution: {
    event: distributeEvent,
    blockTimestamp: distributeBlockData.timestamp,
    timestampRaw: distributeBlockData.timestampRaw,
    gauge: distributeGauge,
    preClaimable: decodedCall(distributeClaimablePre, (raw) => decodeUint(raw).toString()),
    postClaimable: decodedCall(distributeClaimablePost, (raw) => decodeUint(raw).toString()),
    preRewardRate: decodedCall(preRewardRate, (raw) => decodeUint(raw).toString()),
    prePeriodFinish: decodedCall(prePeriodFinish, (raw) => decodeUint(raw).toString()),
    rolloverLeftoverRaw: rolloverLeftover,
    expectedPostRewardRateRaw: expectedPostRewardRate,
    observedPostRewardRate: decodedCall(postRewardRate, (raw) => decodeUint(raw).toString()),
    expectedPostPeriodFinish,
    observedPostPeriodFinish: decodedCall(postPeriodFinish, (raw) => decodeUint(raw).toString()),
    downstreamNotifyEvents,
    rewardTokenTransfers: distributionTransfers,
  },
  representativeClaim: claimEvidence,
  sourceEvidenceReferences: [
    {
      moduleId: "contracts",
      resourceId: "contract-incentives-probes-2026-08-21",
      recordId: "observe-incentives-validators-voter-mezo-mainnet",
    },
    {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: "incentives-explorer-executable-reproductions",
    },
  ],
};

const rendered = `${JSON.stringify(output, null, 2)}\n`;
const outputPath = process.argv[2];
if (outputPath !== undefined) {
  if (!outputPath.startsWith("/tmp/") || !outputPath.endsWith(".json")) {
    fail("capture output path must be an absolute JSON path under /tmp");
  }
  await writeFile(outputPath, rendered, "utf8");
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(rendered);
}
