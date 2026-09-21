import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHash32, parseUnsignedInteger } from "@mezo-dev-kit/evm";
import type { NttObserveInput, NttReceiptAnchor } from "@mezo-dev-kit/bridges";
import { invariant, object } from "../runtime/validation.ts";

/** Select the repository's dated transfer evidence without copying its hashes into example source. */
export async function historicalInput(repositoryRoot: string, native: boolean): Promise<unknown> {
  const path = native ? "native-mainnet-2026-08-18.json" : "musd-ntt-mainnet-2026-08-18.json";
  const catalog = object(
    JSON.parse(
      await readFile(resolve(repositoryRoot, "knowledge/workflows/bridges/evidence", path), "utf8"),
    ) as unknown,
  );
  invariant(Array.isArray(catalog.completedTransfers), "Historical transfer catalog unavailable");
  const transfer = object(
    catalog.completedTransfers.find(
      (row: unknown) =>
        object(row).id ===
        (native ? "native-btc-mezo-to-ethereum-completed" : "musd-mezo-to-ethereum-completed"),
    ),
  );
  return {
    sourceTransactionHash: object(transfer.source).transactionHash,
    destinationTransactionHashes: [object(transfer.destination).transactionHash],
    ...(native ? {} : { expectedDigest: transfer.transferDigest }),
  };
}

function anchor(value: unknown): NttReceiptAnchor {
  const row = object(value);
  return {
    transactionHash: parseHash32(row.transactionHash),
    blockHash: parseHash32(row.blockHash),
    blockNumber: parseUnsignedInteger(row.blockNumber),
  };
}

/** Accept a fresh request or the observer's saved output, preserving its canonical anchors on restart. */
export function parseObservationInput(value: unknown): NttObserveInput {
  const row = object(value);
  if (row.source !== undefined) {
    const source = object(row.source);
    invariant(
      Array.isArray(row.destinations) && row.destinations.length <= 32,
      "Invalid saved destination observations",
    );
    const destinations = row.destinations.map((item: unknown) => object(item));
    return {
      sourceTransactionHash: parseHash32(source.transactionHash),
      destinationTransactionHashes: destinations.map((item) => parseHash32(item.transactionHash)),
      ...(row.digest === undefined || row.digest === null
        ? {}
        : { expectedDigest: parseHash32(row.digest) }),
      previous: {
        ...(source.anchor === null ? {} : { source: anchor(source.anchor) }),
        destinations: destinations
          .filter((item) => item.anchor !== null)
          .map((item) => anchor(item.anchor)),
      },
    };
  }
  invariant(
    Array.isArray(row.destinationTransactionHashes) &&
      row.destinationTransactionHashes.length <= 32,
    "Supply at most 32 destination transaction hashes",
  );
  return {
    sourceTransactionHash: parseHash32(row.sourceTransactionHash),
    destinationTransactionHashes: row.destinationTransactionHashes.map((hash: unknown) =>
      parseHash32(hash),
    ),
    ...(row.expectedDigest === undefined
      ? {}
      : { expectedDigest: parseHash32(row.expectedDigest) }),
  };
}
