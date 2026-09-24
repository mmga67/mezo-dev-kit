import { sha256 } from "@mezo-dev-kit/evm";
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
    profiles = [{ ...POOL_MODEL.musdc, decimals: 6 }, POOL_MODEL.musdt];
  const compatible = tokens.every(
    (token) =>
      token.target.address === musd.address ||
      profiles.some((profile) => token.target.address === profile.address),
  );
  if (!compatible) return false;
  if (tokens.some((token) => token.target.address === musd.address))
    await verifyContractRuntime({ contract: musd, coordinate, transport });
  for (const profile of profiles.filter((profile) =>
    tokens.some((token) => token.target.address === profile.address),
  )) {
    for (const [address, expected] of [
      [profile.address, profile.addressCodeSha256],
      [profile.implementationAddress, profile.implementationCodeSha256],
    ] as const) {
      const code = parseHexData(await transport.getCode(address, coordinate));
      poolRequire(
        sha256(code).slice(2) === expected,
        "IdentityMismatch",
        "mapped ERC20 writer asset runtime changed",
      );
    }
    poolRequire(
      parseHash32(
        await transport.getStorage(profile.address, profile.implementationSlot, coordinate),
      ) === `0x${"0".repeat(24)}${profile.implementationAddress.slice(2)}`,
      "IdentityMismatch",
      "mapped ERC20 writer asset implementation changed",
    );
  }
  poolRequire(
    tokens.every(
      (token) =>
        token.decimals ===
        BigInt(
          token.target.address === musd.address
            ? 18
            : profiles.find((profile) => profile.address === token.target.address)!.decimals,
        ),
    ),
    "IdentityMismatch",
    "writer asset precision changed",
  );
  return true;
}
