import assert from "node:assert/strict";

import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadTransport } from "@mezo-dev-kit/core";
import { parseHash32 } from "@mezo-dev-kit/evm";

const blockNumber = 12_000_000n;
const blockHash = parseHash32(`0x${"42".repeat(32)}`);
const transport: CoreReadTransport = {
  id: "example-injected-transport",
  getChainId: () => 31_612n,
  getBlockNumber: () => blockNumber,
  getBlock: (number) => ({ number, hash: blockHash }),
  read: ({ contractId, blockNumber: pinnedBlock }) => ({ contractId, pinnedBlock }),
};

const client = createCoreReadClient({
  network: getNetwork("mezo-mainnet"),
  registry: createContractRegistry(),
  transport,
});
const result = await client.readCoherent({
  calls: [{ id: "savings-rate", contractId: "musd.savings-rate", data: "0x" }],
});

assert.equal(result.coordinate.blockNumber, blockNumber);
assert.equal(result.coordinate.blockHash, blockHash);
assert.equal(result.reads["savings-rate"]?.status, "available");
