import { createHash } from "node:crypto";

const [rpcUrl, address, lowerBlockArgument, upperBlockArgument] = process.argv.slice(2);
if (!rpcUrl || !address || !lowerBlockArgument || !upperBlockArgument) {
  throw new Error(
    "usage: node scripts/find-code-change-boundary.ts <rpc-url> <address> <known-old-block> <known-new-block>",
  );
}
const endpoint = rpcUrl;

let lowerBlock = parseBlock(lowerBlockArgument);
let upperBlock = parseBlock(upperBlockArgument);
if (lowerBlock >= upperBlock) throw new Error("known-old-block must precede known-new-block");
let requestId = 0;

const oldDigest = digestCode(await codeAt(lowerBlock));
const newDigest = digestCode(await codeAt(upperBlock));
if (oldDigest === newDigest) throw new Error("the endpoint blocks have identical code");

while (upperBlock - lowerBlock > 1) {
  const middleBlock = Math.floor((lowerBlock + upperBlock) / 2);
  const middleDigest = digestCode(await codeAt(middleBlock));
  if (middleDigest === oldDigest) lowerBlock = middleBlock;
  else if (middleDigest === newDigest) upperBlock = middleBlock;
  else {
    throw new Error(`a third code generation ${middleDigest} was observed at block ${middleBlock}`);
  }
}

const [lastOldBlock, firstNewBlock] = await Promise.all([blockAt(lowerBlock), blockAt(upperBlock)]);
process.stdout.write(
  JSON.stringify(
    {
      address: address.toLowerCase(),
      oldCodeSha256: oldDigest,
      newCodeSha256: newDigest,
      lastOldBlock,
      firstNewBlock,
    },
    null,
    2,
  ) + "\n",
);

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  });
  const raw = await response.text();
  if (!response.ok)
    throw new Error(`${method} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value)) throw new Error(`${method} returned a non-object JSON-RPC response`);
  if (value.error) throw new Error(`${method} failed: ${JSON.stringify(value.error)}`);
  return value.result;
}

async function codeAt(blockNumber: number): Promise<unknown> {
  return rpc("eth_getCode", [address, `0x${blockNumber.toString(16)}`]);
}

async function blockAt(blockNumber: number): Promise<BlockSummary> {
  const blockValue = await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
  if (!blockValue) throw new Error(`block ${blockNumber} is unavailable`);
  if (!isRecord(blockValue)) throw new Error(`block ${blockNumber} is invalid`);
  const block = blockValue;
  const encodedNumber = hex(block.number, `block ${blockNumber} number`);
  const hash = hex(block.hash, `block ${blockNumber} hash`);
  const timestamp = hex(block.timestamp, `block ${blockNumber} timestamp`);
  return {
    number: Number.parseInt(encodedNumber, 16),
    hash: hash.toLowerCase(),
    timestamp: new Date(Number.parseInt(timestamp, 16) * 1000).toISOString(),
  };
}

function digestCode(code: unknown): string {
  const normalized = hex(code, "RPC bytecode").replace(/^0x/, "");
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("RPC returned invalid bytecode");
  }
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function parseBlock(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid block '${value}'`);
  return parsed;
}

interface BlockSummary {
  number: number;
  hash: string;
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hex(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]*$/.test(value)) {
    throw new Error(`${label} is not hexadecimal`);
  }
  return value;
}
