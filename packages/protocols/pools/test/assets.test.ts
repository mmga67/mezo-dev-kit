import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { parseHexData } from "@mezo-dev-kit/evm";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import { object } from "../../../../scripts/lib/json.ts";
import { loadKnowledgeReference } from "../../../../scripts/lib/knowledge-reference.ts";
import { verifyPoolWriterAssets } from "../src/assets.ts";
import { POOL_MODEL } from "../src/model.generated.ts";
import { snapshot } from "./fixtures.ts";

async function fixture() {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const load = async (resourceId: string) =>
    object(
      (await loadKnowledgeReference(root, { moduleId: "contracts", resourceId })).document,
      resourceId,
    );
  const usdc = await load("musdc-token-runtime-probe"),
    usdt = object(
      object((await load("musdt-token-runtime-probe")).result, "result").runtime,
      "runtime",
    );
  const codes = new Map<string, string>([
    [POOL_MODEL.musdc.address, String(usdc.code)],
    [POOL_MODEL.musdc.implementationAddress, String(usdc.implementationCode)],
    [POOL_MODEL.musdt.address, String(usdt.code)],
    [POOL_MODEL.musdt.implementationAddress, String(usdt.implementationCode)],
  ]);
  const storage = new Map<string, `0x${string}`>(
    [POOL_MODEL.musdc, POOL_MODEL.musdt].map((p) => [
      p.address,
      `0x${"0".repeat(24)}${p.implementationAddress.slice(2)}`,
    ]),
  );
  const transport = {
    ...createRpcTransport({
      id: "asset-fixture",
      request: async () => {
        throw new Error("unneeded RPC in asset check");
      },
    }),
    getCode: vi.fn(async (address: `0x${string}`) => parseHexData(codes.get(address))),
    getStorage: vi.fn(async (address: `0x${string}`) => parseHexData(storage.get(address))),
  };
  const base = snapshot(),
    tokens: readonly [TokenSnapshot, TokenSnapshot] = [
      {
        ...base.token0,
        decimals: 6n,
        target: { ...base.token0.target, address: POOL_MODEL.musdc.address },
      },
      {
        ...base.token1,
        decimals: 6n,
        target: { ...base.token1.target, address: POOL_MODEL.musdt.address },
      },
    ];
  return {
    codes,
    storage,
    input: { registry: createContractRegistry(), transport, coordinate: base.coordinate, tokens },
  };
}
test("mUSDC/mUSDT compatibility verifies each asset's own proxy and implementation", async () => {
  const f = await fixture();
  expect(await verifyPoolWriterAssets(f.input)).toBe(true);
  expect(f.input.transport.getCode).toHaveBeenCalledTimes(4);
  expect(f.input.transport.getStorage).toHaveBeenCalledTimes(2);
});
test.for(["code", "slot", "precision"] as const)(
  "mUSDT %s drift prevents writer compatibility",
  async (kind) => {
    const f = await fixture();
    if (kind === "code") f.codes.set(POOL_MODEL.musdt.address, "0x00");
    if (kind === "slot") f.storage.set(POOL_MODEL.musdt.address, `0x${"0".repeat(64)}`);
    const input =
      kind === "precision"
        ? {
            ...f.input,
            tokens: [f.input.tokens[0], { ...f.input.tokens[1], decimals: 18n }] as const,
          }
        : f.input;
    await expect(verifyPoolWriterAssets(input)).rejects.toMatchObject({ code: "IdentityMismatch" });
  },
);
test("a quotable arbitrary asset remains outside writer qualification", async () => {
  const f = await fixture();
  const unqualified = snapshot().token0;
  expect(
    await verifyPoolWriterAssets({ ...f.input, tokens: [unqualified, f.input.tokens[1]] }),
  ).toBe(false);
  expect(f.input.transport.getCode).not.toHaveBeenCalled();
});
