import { createHash } from "node:crypto";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import { parseHash32, parseHexData } from "@mezo-dev-kit/evm";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import { poolRequire } from "./errors.ts";
import { POOL_MODEL } from "./model.generated.ts";

/** Shared basic/CL writer token profile; discovery of arbitrary tokens remains read-only. */
export async function verifyPoolWriterAssets(input: {
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
  readonly coordinate: ReadCoordinate;
  readonly tokens: readonly [TokenSnapshot, TokenSnapshot];
}): Promise<boolean> {
  const { registry, transport, coordinate, tokens } = input,
    musd = registry.resolve({ ...coordinate, contractId: "musd.token" }),
    profile = POOL_MODEL.musdc;
  const compatible = tokens.every(
    (token) => token.target.address === musd.address || token.target.address === profile.address,
  );
  if (!compatible) return false;
  await verifyContractRuntime({ contract: musd, coordinate, transport });
  for (const [address, expected] of [
    [profile.address, profile.addressCodeSha256],
    [profile.implementationAddress, profile.implementationCodeSha256],
  ] as const) {
    const code = parseHexData(await transport.getCode(address, coordinate));
    poolRequire(
      createHash("sha256")
        .update(Buffer.from(code.slice(2), "hex"))
        .digest("hex") === expected,
      "IdentityMismatch",
      "mUSDC runtime changed",
    );
  }
  poolRequire(
    parseHash32(
      await transport.getStorage(profile.address, profile.implementationSlot, coordinate),
    ) === `0x${"0".repeat(24)}${profile.implementationAddress.slice(2)}`,
    "IdentityMismatch",
    "mUSDC implementation changed",
  );
  poolRequire(
    tokens.every((token) => token.decimals === (token.target.address === musd.address ? 18n : 6n)),
    "IdentityMismatch",
    "writer asset precision changed",
  );
  return true;
}
