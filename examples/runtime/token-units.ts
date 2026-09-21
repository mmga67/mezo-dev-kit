import { createTokenReader } from "@mezo-dev-kit/tokens";
import type { TokenTarget, TokenSnapshot } from "@mezo-dev-kit/tokens";
import { parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { Connection } from "../setup.ts";
import { invariant } from "./validation.ts";

/** Read current token precision instead of maintaining another asset metadata table. */
export async function readWalletToken(
  runtime: Pick<Connection, "network" | "transport" | "account">,
  target: TokenTarget,
): Promise<Readonly<TokenSnapshot>> {
  const blockNumber = parseUint(await runtime.transport.getBlockNumber());
  const block = await runtime.transport.getBlock(blockNumber);
  invariant(block, "Missing token read block");
  return createTokenReader({ transport: runtime.transport }).read({
    target,
    account: runtime.account,
    spender: target.address,
    coordinate: {
      networkId: runtime.network.id,
      chainId: runtime.network.evmChainId,
      blockNumber,
      blockHash: parseHash32(block.hash),
    },
  });
}
