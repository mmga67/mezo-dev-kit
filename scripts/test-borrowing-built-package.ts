import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    `
import assert from 'node:assert/strict';
import { calculateSimpleInterest, normalizeBorrowingPosition, createBorrowingReader, createBorrowingWriter } from '@mezo-dev-kit/musd-borrowing';
import { resolveOperation } from '@mezo-dev-kit/contracts';
import { encodeFunctionData } from '@mezo-dev-kit/evm';
import { createExecutionClient, createRpcTransport, createRpcSigner } from '@mezo-dev-kit/core';
assert.equal(calculateSimpleInterest(10000n, 500n, 31556952n), 500n);
const position = normalizeBorrowingPosition({stored:[100n,1000n,10n,0n,1n,500n,0n,2000n,0n],entire:[105n,1020n,63n,5n,20n,3n],timestamp:31556952n,gasCompensation:200n});
assert.equal(position.debt,1083n);
const operation = resolveOperation({contractId:'musd.borrower-operations',networkId:'mezo-mainnet',blockNumber:11703359n,functionName:'closeTrove'});
assert.equal(encodeFunctionData(operation.functionAbi),'0x0e704d50');
for (const fn of [createBorrowingReader,createBorrowingWriter,createExecutionClient,createRpcTransport,createRpcSigner]) assert.equal(typeof fn,'function');
await assert.rejects(import('@mezo-dev-kit/musd-borrowing/src/writer.ts'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
`,
  ],
  { cwd: resolve(root, "packages/protocols/musd-borrowing"), encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Borrowing built entrypoint failed: ${result.stderr}`);
process.stdout.write("Borrowing built public entrypoints passed.\n");
