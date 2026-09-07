import { createHash } from "node:crypto";
import { object, text } from "./json.ts";

export interface FeedAssessment {
  status: "usable" | "stale" | "future" | "invalid";
  ageSeconds: string;
}
/** This is a point-in-time observation predicate, never a persisted feed allowlist. */
export function assessFeed(
  price: bigint,
  publishedAt: bigint,
  asOf: bigint,
  maxAge: bigint,
): FeedAssessment {
  if (maxAge < 0n || asOf < 0n) throw new Error("Invalid freshness policy");
  const age = asOf - publishedAt;
  return {
    status:
      price <= 0n || publishedAt <= 0n
        ? "invalid"
        : age < 0n
          ? "future"
          : age > maxAge
            ? "stale"
            : "usable",
    ageSeconds: age.toString(),
  };
}
export function abiWords(value: unknown, count: number): bigint[] {
  const raw = text(value, "ABI result");
  if (!new RegExp(`^0x[0-9a-fA-F]{${count * 64}}$`).test(raw))
    throw new Error("Malformed ABI result");
  return Array.from({ length: count }, (_, i) =>
    BigInt(`0x${raw.slice(2 + i * 64, 2 + (i + 1) * 64)}`),
  );
}
export function signedWord(value: bigint, bits: number): bigint {
  const low = BigInt.asUintN(bits, value),
    result = BigInt.asIntN(bits, low);
  if (BigInt.asUintN(256, result) !== value) throw new Error("Noncanonical signed ABI word");
  return result;
}
export function verifyCode(raw: unknown, expected: unknown): string {
  const code = text(raw, "runtime code");
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("Missing runtime code");
  const hash = createHash("sha256")
    .update(Buffer.from(code.slice(2), "hex"))
    .digest("hex");
  if (hash !== expected)
    throw new Error("Runtime differs from accepted generation; review required");
  return hash;
}
export function snapshotBlock(value: unknown): { number: string; hash: string; timestamp: string } {
  const block = object(value, "block");
  const number = text(block.number, "block number"),
    hash = text(block.hash, "block hash"),
    timestamp = text(block.timestamp, "timestamp");
  if (
    !/^0x[0-9a-f]+$/i.test(number) ||
    !/^0x[0-9a-f]{64}$/i.test(hash) ||
    !/^0x[0-9a-f]+$/i.test(timestamp)
  )
    throw new Error("Invalid block coordinate");
  return {
    number: BigInt(number).toString(),
    hash: hash.toLowerCase(),
    timestamp: BigInt(timestamp).toString(),
  };
}
export function assertSameSnapshot(
  before: ReturnType<typeof snapshotBlock>,
  after: ReturnType<typeof snapshotBlock>,
): void {
  if (
    before.number !== after.number ||
    before.hash !== after.hash ||
    before.timestamp !== after.timestamp
  )
    throw new Error("Snapshot changed during capture");
}
