import { createHash } from "node:crypto";

const rpcUrl = "https://mezo-mainnet.boar.network";
const explorerUrl = "https://api.explorer.mezo.org";
const zeroAddress = "0x0000000000000000000000000000000000000000";

const roots = [
  ["basicRouter", "0x16a76d3cd3c1e3ce843c6680d6b37e9116b5c706"],
  ["basicFactory", "0x83fe469c636c4081b87ba5b3ae9991c6ed104248"],
  ["clFactory", "0xbb24af5c6fb88f1d191fa76055e30bf881beeb79"],
  ["clPoolImplementation", "0x819cfadd7f5bc0854fa3b7f5749ea0410a943e5f"],
  ["clSwapRouter", "0x37cdd11919ec3860ead9efb8673d7476e5326225"],
  ["positionManager", "0x509bc221df2b83927c695fa0bb0f5b21053c874c"],
  ["positionDescriptor", "0x818f6ccfbee90202b967567bcf2a5fb9b73cfeca"],
  ["clGaugeFactory", "0xfc41e1aae0e58e8bdc32e85d8c995a902fedeb13"],
  ["clGaugeImplementation", "0x8f11a90265f7a784b46fe326638ec37a5cc29c33"],
  ["poolsVoter", "0x48233ccc97b87ba93bca212cbee48e3210211f03"],
  ["factoryRegistry", "0x04b94f55780682478c8d8329368aaafd320f4d32"],
] as const;

const selectors = {
  allPoolsLength: "0xefde4e64",
  allPools: "0x41d1de97",
  poolImplementation: "0xcefa7799",
  factoryRegistry: "0x3bf0c9fb",
  voter: "0x46c96aac",
  factory: "0xc45a0155",
  tokenDescriptor: "0x5a9d7a68",
  implementation: "0x5c60da1b",
  nft: "0x47ccca02",
  rewardToken: "0xf7c618c1",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  tickSpacing: "0xd0c93a7c",
  gauge: "0xa6f19c84",
  liquidity: "0x1a686502",
  stakedLiquidity: "0x3ab04b20",
  slot0: "0x3850c7bd",
  defaultFactory: "0xd4b6846d",
  stable: "0x22be3de1",
  getReserves: "0x0902f1ac",
  totalSupply: "0x18160ddd",
  isGauge: "0xaa79979b",
} as const;

function fail(message: string): never {
  throw new Error(message);
}

function sha256Hex(hex: string): string {
  const normalized = hex.replace(/^0x/, "");
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail("invalid hexadecimal value");
  }
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function word(value: bigint): string {
  if (value < 0n) value = (1n << 256n) + value;
  return value.toString(16).padStart(64, "0");
}

function addressWord(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) fail(`invalid address ${value}`);
  return normalized.slice(2).padStart(64, "0");
}

function splitWords(raw: string): string[] {
  const normalized = raw.replace(/^0x/, "");
  if (normalized.length % 64 !== 0) fail(`result is not word aligned: ${raw}`);
  return normalized.match(/.{64}/g) ?? [];
}

function decodeAddress(raw: string): string {
  const words = splitWords(raw);
  if (words.length !== 1) fail(`expected one address word, received ${words.length}`);
  return `0x${words[0]!.slice(24)}`;
}

function decodeUint(raw: string): number | string {
  const words = splitWords(raw);
  if (words.length !== 1) fail(`expected one integer word, received ${words.length}`);
  const value = BigInt(`0x${words[0]}`);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

function decodeBool(raw: string): boolean {
  const value = decodeUint(raw);
  return value === 1;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
  return JSON.parse(raw) as unknown;
}

let rpcId = 0;
async function rpc(method: string, params: unknown[]): Promise<string | Record<string, unknown>> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json()) as {
    result?: string | Record<string, unknown>;
    error?: unknown;
  };
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

async function namedCalls(
  address: string,
  blockTag: string,
  definitions: readonly (readonly [string, string, (raw: string) => unknown])[],
): Promise<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [name, data, decode] of definitions) {
    try {
      const rawResult = await call(address, data, blockTag);
      output[name] = { callData: data, rawResult, decoded: decode(rawResult) };
    } catch (error) {
      output[name] = {
        callData: data,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return output;
}

const latest = await rpc("eth_getBlockByNumber", ["latest", false]);
if (typeof latest === "string") fail("latest block response is malformed");
const blockNumberHex = String(latest.number);
const blockNumber = Number.parseInt(blockNumberHex, 16);
const blockHash = String(latest.hash).toLowerCase();
const blockTimestamp = new Date(Number.parseInt(String(latest.timestamp), 16) * 1000).toISOString();
const capturedAt = new Date().toISOString();

const rootEvidence: Record<string, unknown> = {};
await Promise.all(
  roots.map(async ([role, address]) => {
    const code = await rpc("eth_getCode", [address, blockNumberHex]);
    if (typeof code !== "string" || code === "0x") fail(`${role} has no code at evidence block`);
    const addressRecord = (await fetchJson(`${explorerUrl}/api/v2/addresses/${address}`)) as {
      creation_tx_hash?: string;
      creation_transaction_hash?: string;
      name?: string;
      is_verified?: boolean;
      proxy_type?: string | null;
    };
    const creationTransactionHash =
      addressRecord.creation_tx_hash ?? addressRecord.creation_transaction_hash;
    if (!creationTransactionHash) fail(`${role} explorer record has no creation transaction`);
    const transaction = (await fetchJson(
      `${explorerUrl}/api/v2/transactions/${creationTransactionHash}`,
    )) as {
      block?: number;
      block_number?: number;
      block_hash?: string;
      status?: string;
      timestamp?: string;
    };
    const creationBlockNumber = transaction.block_number ?? transaction.block;
    if (typeof creationBlockNumber !== "number" || !Number.isSafeInteger(creationBlockNumber)) {
      fail(`${role} creation transaction has no safe block number`);
    }
    const creationBlockResult = await rpc("eth_getBlockByNumber", [
      `0x${creationBlockNumber.toString(16)}`,
      false,
    ]);
    if (typeof creationBlockResult === "string") fail(`${role} creation block is malformed`);
    rootEvidence[role] = {
      address,
      explorerName: addressRecord.name ?? null,
      explorerVerified: addressRecord.is_verified ?? null,
      explorerProxyType: addressRecord.proxy_type ?? null,
      creation: {
        transactionHash: creationTransactionHash.toLowerCase(),
        blockNumber: creationBlockNumber,
        blockHash: String(creationBlockResult.hash).toLowerCase(),
        blockTimestamp: new Date(
          Number.parseInt(String(creationBlockResult.timestamp), 16) * 1000,
        ).toISOString(),
        transactionStatus: transaction.status ?? null,
      },
      runtime: {
        blockNumber,
        blockHash,
        codeSha256: sha256Hex(code),
      },
    };
  }),
);

const byRole = Object.fromEntries(roots) as Record<(typeof roots)[number][0], string>;
const relationships = {
  basicRouter: await namedCalls(byRole.basicRouter, blockNumberHex, [
    ["defaultFactory", selectors.defaultFactory, decodeAddress],
    ["factoryRegistry", selectors.factoryRegistry, decodeAddress],
    ["voter", selectors.voter, decodeAddress],
  ]),
  basicFactory: await namedCalls(byRole.basicFactory, blockNumberHex, [
    ["implementation", selectors.implementation, decodeAddress],
    ["voter", selectors.voter, decodeAddress],
    ["allPoolsLength", selectors.allPoolsLength, decodeUint],
  ]),
  clFactory: await namedCalls(byRole.clFactory, blockNumberHex, [
    ["poolImplementation", selectors.poolImplementation, decodeAddress],
    ["factoryRegistry", selectors.factoryRegistry, decodeAddress],
    ["voter", selectors.voter, decodeAddress],
    ["allPoolsLength", selectors.allPoolsLength, decodeUint],
  ]),
  clSwapRouter: await namedCalls(byRole.clSwapRouter, blockNumberHex, [
    ["factory", selectors.factory, decodeAddress],
  ]),
  positionManager: await namedCalls(byRole.positionManager, blockNumberHex, [
    ["factory", selectors.factory, decodeAddress],
    ["tokenDescriptor", selectors.tokenDescriptor, decodeAddress],
  ]),
  clGaugeFactory: await namedCalls(byRole.clGaugeFactory, blockNumberHex, [
    ["implementation", selectors.implementation, decodeAddress],
    ["nft", selectors.nft, decodeAddress],
    ["voter", selectors.voter, decodeAddress],
    ["rewardToken", selectors.rewardToken, decodeAddress],
  ]),
};

async function discoverPools(kind: "basic" | "cl", factory: string): Promise<unknown> {
  const lengthRaw = await call(factory, selectors.allPoolsLength, blockNumberHex);
  const decodedLength = decodeUint(lengthRaw);
  if (typeof decodedLength !== "number" || decodedLength > 100) {
    return { allPoolsLength: decodedLength, discoveryStopped: "bounded-capture-limit-100" };
  }
  const pools = [];
  for (let index = 0; index < decodedLength; index += 1) {
    const address = decodeAddress(
      await call(factory, `${selectors.allPools}${word(BigInt(index))}`, blockNumberHex),
    );
    const common = await namedCalls(address, blockNumberHex, [
      ["token0", selectors.token0, decodeAddress],
      ["token1", selectors.token1, decodeAddress],
    ]);
    if (kind === "basic") {
      pools.push({
        index,
        address,
        ...common,
        ...(await namedCalls(address, blockNumberHex, [
          ["stable", selectors.stable, decodeBool],
          ["reserves", selectors.getReserves, splitWords],
          ["totalSupply", selectors.totalSupply, decodeUint],
        ])),
      });
      continue;
    }
    const clState = await namedCalls(address, blockNumberHex, [
      ["factory", selectors.factory, decodeAddress],
      ["tickSpacing", selectors.tickSpacing, decodeUint],
      ["gauge", selectors.gauge, decodeAddress],
      ["liquidity", selectors.liquidity, decodeUint],
      ["stakedLiquidity", selectors.stakedLiquidity, decodeUint],
      ["slot0", selectors.slot0, splitWords],
    ]);
    const gaugeAddress = (clState.gauge as { decoded?: string } | undefined)?.decoded;
    let gauge = null;
    if (gaugeAddress && gaugeAddress !== zeroAddress) {
      gauge = {
        address: gaugeAddress,
        factoryRecognizesGauge: await namedCalls(byRole.clGaugeFactory, blockNumberHex, [
          ["isGauge", `${selectors.isGauge}${addressWord(gaugeAddress)}`, decodeBool],
        ]),
        state: await namedCalls(gaugeAddress, blockNumberHex, [
          ["pool", "0x16f0115b", decodeAddress],
          ["nft", selectors.nft, decodeAddress],
          ["voter", selectors.voter, decodeAddress],
          ["rewardToken", selectors.rewardToken, decodeAddress],
          ["tickSpacing", selectors.tickSpacing, decodeUint],
        ]),
      };
    }
    pools.push({ index, address, ...common, ...clState, gauge });
  }
  return { allPoolsLength: decodedLength, pools };
}

const output = {
  schemaVersion: 1,
  kind: "mezo-pool-topology-observation",
  id: "pools-mainnet-topology",
  owner: "protocols/pools",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt: capturedAt,
  reviewAfter: "2026-09-23T00:00:00Z",
  scope: { networkIds: ["mezo-mainnet"], blockNumber, blockHash },
  providerReference: { moduleId: "networks", resourceId: "mezo-mainnet-boar-https" },
  block: { blockNumber, blockHash, blockTimestamp },
  roots: rootEvidence,
  relationships,
  dynamicDiscovery: {
    basic: await discoverPools("basic", byRole.basicFactory),
    concentrated: await discoverPools("cl", byRole.clFactory),
  },
  limitations: [
    "This is a point-in-time read-only capture, not a static registry of dynamic pools or gauges.",
    "Explorer verification labels and executable hashes do not establish source authorship or support.",
    "Dynamic instances and their balances, reserves, liquidity, ownership, and gauge associations must be refreshed for current use.",
  ],
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
