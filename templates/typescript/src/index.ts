import { getNetwork } from "@mezo-dev-kit/chains";
import { checkNetwork } from "./network.ts";

// Deterministic demonstration. Replace the injected port with your chosen provider.
// This fixture demonstrates validation and makes no network request.
const network = getNetwork("mezo-testnet");
const unused = (): never => {
  throw new Error("The identity example does not request block or contract data");
};
const result = await checkNetwork(network.id, {
  id: "synthetic-demo",
  getChainId: () => network.evmChainId,
  getBlockNumber: unused,
  getBlock: unused,
  read: unused,
});
process.stdout.write(
  `${JSON.stringify(result, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`,
);
