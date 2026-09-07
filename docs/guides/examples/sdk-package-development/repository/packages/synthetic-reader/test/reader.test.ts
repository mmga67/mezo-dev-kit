import { describe, expect, test, vi } from "vitest";

import {
  SyntheticReaderError,
  readSyntheticSnapshot,
  sumAvailableBaseUnits,
} from "../src/index.ts";
import type { SyntheticReadPort } from "../src/index.ts";

const BLOCK_HASH = `0x${"ab".repeat(32)}`;

describe("synthetic read-only module", () => {
  test("validates an exact-block response and keeps calculation pure", async () => {
    const port = portReturning({
      kind: "synthetic-reading",
      blockNumber: "42",
      blockHash: BLOCK_HASH,
      requiredValueBaseUnits: "1000001",
      optionalValueBaseUnits: "9",
    });

    const snapshot = await readSyntheticSnapshot({ port, blockNumber: 42n });

    expect(snapshot).toEqual({
      coordinate: { blockNumber: 42n, blockHash: BLOCK_HASH },
      consistency: "block",
      assetId: "synthetic-widget",
      decimals: 6,
      requiredValueBaseUnits: 1_000_001n,
      optionalValue: { status: "available", valueBaseUnits: 9n },
    });
    expect(sumAvailableBaseUnits(snapshot)).toBe(1_000_010n);
    expect(port.readSnapshot).toHaveBeenCalledExactlyOnceWith({
      kind: "synthetic-reading",
      blockNumber: 42n,
    });
  });

  test("represents an unavailable optional item explicitly", async () => {
    const snapshot = await readSyntheticSnapshot({
      port: portReturning({
        kind: "synthetic-reading",
        blockNumber: "0",
        blockHash: BLOCK_HASH,
        requiredValueBaseUnits: "7",
        optionalValueBaseUnits: null,
      }),
      blockNumber: 0n,
    });

    expect(snapshot.optionalValue).toEqual({ status: "unavailable", reason: "not-returned" });
    expect(sumAvailableBaseUnits(snapshot)).toBe(7n);
  });

  test("fails a partial required read instead of returning incomplete success", async () => {
    await expect(
      readSyntheticSnapshot({
        port: portReturning({
          kind: "synthetic-reading",
          blockNumber: "42",
          blockHash: BLOCK_HASH,
          optionalValueBaseUnits: "9",
        }),
        blockNumber: 42n,
      }),
    ).rejects.toMatchObject({
      code: "PartialRead",
      context: { failedItems: ["requiredValueBaseUnits"] },
    });
  });

  test("rejects malformed external values before exposing them", async () => {
    await expect(
      readSyntheticSnapshot({
        port: portReturning({
          kind: "synthetic-reading",
          blockNumber: "42",
          blockHash: BLOCK_HASH,
          requiredValueBaseUnits: 1.5,
        }),
        blockNumber: 42n,
      }),
    ).rejects.toMatchObject({ code: "InvalidResponse" });
  });

  test("rejects a response from a different block coordinate", async () => {
    await expect(
      readSyntheticSnapshot({
        port: portReturning({
          kind: "synthetic-reading",
          blockNumber: "43",
          blockHash: BLOCK_HASH,
          requiredValueBaseUnits: "1",
        }),
        blockNumber: 42n,
      }),
    ).rejects.toMatchObject({
      code: "InconsistentBlock",
      context: { requestedBlockNumber: "42", responseBlockNumber: "43" },
    });
  });

  test("validates caller input before invoking the external port", async () => {
    const port = portReturning({});

    await expect(readSyntheticSnapshot({ port, blockNumber: -1n })).rejects.toBeInstanceOf(
      SyntheticReaderError,
    );
    expect(port.readSnapshot).not.toHaveBeenCalled();
  });

  test("preserves provider failure as a typed error with its cause", async () => {
    const cause = new Error("provider unavailable");
    const port: SyntheticReadPort = {
      readSnapshot: vi.fn().mockRejectedValue(cause),
    };

    await expect(readSyntheticSnapshot({ port, blockNumber: 42n })).rejects.toMatchObject({
      code: "ProviderFailure",
      cause,
      context: { operation: "readSnapshot", blockNumber: "42" },
    });
  });
});

function portReturning(value: unknown): SyntheticReadPort & {
  readonly readSnapshot: ReturnType<typeof vi.fn<SyntheticReadPort["readSnapshot"]>>;
} {
  return { readSnapshot: vi.fn<SyntheticReadPort["readSnapshot"]>().mockResolvedValue(value) };
}
