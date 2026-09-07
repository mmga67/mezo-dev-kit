import { writeFile } from "node:fs/promises";
import { object, parseJson, text, type JsonObject } from "./lib/json.ts";

const [outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error("usage: node scripts/capture-bridge-contract-observations.ts <output-json>");
}

const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const assetsBridgeAddress = "0x7b7c000000000000000000000000000000000012";
const v13ActivationBlock = 11_358_000;
const getBridgeOutChainsSelector = "0x8210110d";
type ContractDefinition = readonly [
  contractId: string,
  address: string,
  implementation: string | null,
];

interface BlockObservation {
  number: number;
  hash: string;
  timestamp: string;
  method: string;
}

interface NetworkDefinition {
  id: string;
  chainId: number;
  rpcUrl: string;
  contracts: readonly ContractDefinition[];
  activationBlocks: readonly number[];
  transactionHashes: readonly string[];
  historicalBlockFallbacks?: Readonly<Record<number, BlockObservation>>;
}

const definitions: readonly NetworkDefinition[] = [
  {
    id: "ethereum-mainnet",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    contracts: [
      [
        "bridge.musd-ntt-manager",
        "0x5293158bf7a81ed05418da497a80f7e6dbf4477e",
        "0x075108f275ed81c9cfc01065e6e50ceea81d6363",
      ],
      [
        "bridge.musd-wormhole-transceiver",
        "0x147379a0174780570d07d70a14fb244ee5f2d786",
        "0x05bd601c3c381fd3d099dbb574cc39ea5d8b4a69",
      ],
      [
        "bridge.native-mezo-bridge",
        "0xf6680ea3b480ca2b72d96ea13ccaf2cfd8e6908c",
        "0x1f8ed8193b902185c2bd495fe9b1963dc343ba87",
      ],
    ],
    activationBlocks: [22884633, 24584317, 22376538, 22989590, 23331652, 23589330, 25435730],
    transactionHashes: [
      "0xf863849c0eb9c26bd1ae924aa80c0617db77dd1d1d2f99bca8de6f206546cd77",
      "0x183d15d9b6b1f9426e98a31678e887f736438b50b3b834ca09e111323f71e203",
      "0x0accb979b9191a61553e383d8c513ba9c1611bc4305498f4264c9a03c29b9ddb",
      "0xd5a9f659e43b170c9882a20a40812d75258e63f38d557757faa39de54a88adda",
      "0x4a659748aa9ec87e2782dfd0e8101d2e0676e1e465e1b57770dedc1a83f06e98",
      "0x81fc9f0dfea4c6d3b85f38164f481ffbbc199772a0623baed8e77f00f6da005f",
      "0xb2b367b706d88e052af124594a0045b80231a9bf2b0077fc812eb367f26d9961",
      "0x0ab4efd49476a20065abee9a971835d279316f5814521240ffbe424951f939ac",
    ],
  },
  {
    id: "base-mainnet",
    chainId: 8453,
    rpcUrl: "https://base-rpc.publicnode.com",
    contracts: [
      [
        "bridge.musd-ntt-manager",
        "0x3eb418bdbe95b4b9cf465ecfbd8424685acd1bc1",
        "0x7d61512edc44dba19ea9758e9f383547cec38366",
      ],
      [
        "bridge.musd-wormhole-transceiver",
        "0x15c465e7df34f8ca06fdcae0569206cedf3f4467",
        "0xae52c85f4483e4fb14f7d1dd8ad2aeb12d890cc0",
      ],
    ],
    activationBlocks: [42181281, 42920697],
    historicalBlockFallbacks: {
      42181281: {
        number: 42181281,
        hash: "0xce89a15bd401ebeffb06d6c71bd44c3f3ba945256920f0419a31ff655630e04c",
        timestamp: new Date(Number.parseInt("0x6991a225", 16) * 1000).toISOString(),
        method: "prior eth_getBlockByNumber observation retained after provider pruning",
      },
      42920697: {
        number: 42920697,
        hash: "0x2961993db9ce1268b8d87dab14f8f07c18bcb5203d48c3fb776ab7848cead8f7",
        timestamp: new Date(Number.parseInt("0x69a832d5", 16) * 1000).toISOString(),
        method: "prior eth_getBlockByNumber observation retained after provider pruning",
      },
    },
    transactionHashes: [
      "0xff365759a87db9fd9986403436d42cab91a4d39cd838ee080eeab261ceb60212",
      "0x88c949eb49084cb2522de0230a059213d4d271dc2c9977a3696514004d4cabeb",
    ],
  },
  {
    id: "mezo-mainnet",
    chainId: 31612,
    rpcUrl: "https://mezo-mainnet.boar.network",
    contracts: [
      [
        "bridge.musd-ntt-manager",
        "0x7efb386675d75280d39aae42964a6776de0ee0bd",
        "0xd0cbe9be1ab548eb93e5557649b236305874d4d0",
      ],
      [
        "bridge.musd-wormhole-transceiver",
        "0x62deeafee06c7442a21c93ededc79a0cb5791c83",
        "0x867cd4fd99ba3330afa65822c552c0d1247f6115",
      ],
      ["bridge.native-assets-precompile", assetsBridgeAddress, null],
    ],
    activationBlocks: [1579320, 7252117, 8194500, 11260863, 11260864, 11358000],
    transactionHashes: [
      "0x417756f53017044576f7d102630be4123bfcf67e363b14873144ae83b2b24269",
      "0x3e267901cbd981ba81a3ef53fe66d70689ce5a0991e3a5aab0ef310a8b49fb71",
      "0xe572e8711d95b19b0814272d779cb75150b2d48b9fde1ff90d13fd353792fb49",
    ],
  },
];

const capturedAt = new Date().toISOString();
const networks: Record<string, unknown> = {};
for (const definition of definitions) {
  const client = createRpcClient(definition.rpcUrl);
  const chainId = numberFromHex(await client.call("eth_chainId", []));
  if (chainId !== definition.chainId) {
    throw new Error(`${definition.id} returned chain ID ${chainId}`);
  }
  const latest = normalizeBlock(await client.call("eth_getBlockByNumber", ["latest", false]));
  const blockTag = `0x${latest.number.toString(16)}`;
  const contracts: Record<string, unknown> = {};
  for (const [contractId, address, expectedImplementation] of definition.contracts) {
    const [code, implementationStorage, adminStorage, implementationCode] = await Promise.all([
      client.call("eth_getCode", [address, blockTag]),
      expectedImplementation
        ? client.call("eth_getStorageAt", [address, implementationSlot, blockTag])
        : null,
      expectedImplementation
        ? client.call("eth_getStorageAt", [address, adminSlot, blockTag])
        : null,
      expectedImplementation
        ? client.call("eth_getCode", [expectedImplementation, blockTag])
        : null,
    ]);
    const implementation = expectedImplementation
      ? normalizeStorageAddress(implementationStorage)
      : null;
    if (implementation !== expectedImplementation) {
      throw new Error(`${contractId}@${definition.id} implementation changed to ${implementation}`);
    }
    contracts[contractId] = {
      address,
      code,
      implementationSlot: implementationStorage,
      adminSlot: adminStorage,
      implementation,
      implementationCode,
    };
  }

  const blocks: Record<string, unknown> = {};
  for (const number of definition.activationBlocks) {
    const block = await client.tryCall("eth_getBlockByNumber", [`0x${number.toString(16)}`, false]);
    blocks[number] = isErrorResult(block)
      ? (definition.historicalBlockFallbacks?.[number] ?? block)
      : block === null
        ? null
        : normalizeBlock(block);
  }
  const transactions: Record<string, unknown> = {};
  for (const hash of definition.transactionHashes) {
    const [transaction, receipt] = await Promise.all([
      client.tryCall("eth_getTransactionByHash", [hash]),
      client.tryCall("eth_getTransactionReceipt", [hash]),
    ]);
    transactions[hash] = { transaction, receipt };
  }
  networks[definition.id] = {
    rpcUrl: definition.rpcUrl,
    chainId,
    clientVersion: await client.call("web3_clientVersion", []),
    snapshot: latest,
    contracts,
    blocks,
    transactions,
  };
}

const mezoDefinition = definitions.find((item) => item.id === "mezo-mainnet");
if (mezoDefinition === undefined) throw new Error("Mezo network definition is missing");
const mezoClient = createRpcClient(mezoDefinition.rpcUrl);
const precompileUpdateTrace = await mezoClient.tryCall("debug_traceTransaction", [
  "0xe572e8711d95b19b0814272d779cb75150b2d48b9fde1ff90d13fd353792fb49",
  { tracer: "callTracer" },
]);
const assetsBridgeV13Calls = {
  selector: getBridgeOutChainsSelector,
  immediatelyBeforeActivation: await mezoClient.tryCall("eth_call", [
    { to: assetsBridgeAddress, data: getBridgeOutChainsSelector },
    `0x${(v13ActivationBlock - 1).toString(16)}`,
  ]),
  activationBlock: await mezoClient.tryCall("eth_call", [
    { to: assetsBridgeAddress, data: getBridgeOutChainsSelector },
    `0x${v13ActivationBlock.toString(16)}`,
  ]),
  latest: await mezoClient.tryCall("eth_call", [
    { to: assetsBridgeAddress, data: getBridgeOutChainsSelector },
    "latest",
  ]),
};

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      capturedAt,
      networks,
      precompileUpdateTrace,
      assetsBridgeV13Calls,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`Captured bridge contract observations at ${capturedAt} in ${outputPath}.\n`);

interface RpcClient {
  call: (method: string, params: unknown[]) => Promise<unknown>;
  tryCall: (method: string, params: unknown[]) => Promise<unknown>;
}

function createRpcClient(url: string): RpcClient {
  let requestId = 0;
  async function request(
    method: string,
    params: unknown[],
    tolerateError: boolean,
  ): Promise<unknown> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
        });
        const raw = await response.text();
        if (!response.ok) {
          if (attempt < maxAttempts && response.status >= 500) {
            await wait(attempt * 250);
            continue;
          }
          if (tolerateError) {
            return { error: { httpStatus: response.status, body: raw.slice(0, 500) } };
          }
          throw new Error(
            `${url} ${method} returned HTTP ${response.status}: ${raw.slice(0, 200)}`,
          );
        }
        const value = object(
          parseJson(raw, `${url} ${method} response`),
          `${url} ${method} response`,
        );
        if (value.error) {
          if (tolerateError) return { error: value.error };
          throw new Error(`${url} ${method} failed: ${JSON.stringify(value.error)}`);
        }
        return value.result;
      } catch (error) {
        if (attempt < maxAttempts && isTransientNetworkError(error)) {
          await wait(attempt * 250);
          continue;
        }
        if (tolerateError) return { error: { network: String(error) } };
        throw error;
      }
    }
    throw new Error(`${url} ${method} exhausted its retry policy`);
  }
  return {
    call: (method, params) => request(method, params, false),
    tryCall: (method, params) => request(method, params, true),
  };
}

function isTransientNetworkError(error: unknown): boolean {
  const message = String(error);
  return message.includes("fetch failed") || message.includes("HTTP 5");
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeBlock(blockValue: unknown): Omit<BlockObservation, "method"> {
  const block = object(blockValue, "RPC block");
  return {
    number: numberFromHex(block.number),
    hash: text(block.hash, "block hash").toLowerCase(),
    timestamp: new Date(numberFromHex(block.timestamp) * 1000).toISOString(),
  };
}

function numberFromHex(value: unknown): number {
  const encoded = text(value, "hexadecimal number");
  const number = Number.parseInt(encoded, 16);
  if (!Number.isSafeInteger(number)) throw new Error(`unsafe hexadecimal number '${encoded}'`);
  return number;
}

function normalizeStorageAddress(value: unknown): string {
  const normalized = text(value, "storage word").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(normalized)) throw new Error(`invalid storage word '${normalized}'`);
  return `0x${normalized.slice(-40)}`;
}

function isErrorResult(value: unknown): value is JsonObject & { error: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "error" in value;
}
