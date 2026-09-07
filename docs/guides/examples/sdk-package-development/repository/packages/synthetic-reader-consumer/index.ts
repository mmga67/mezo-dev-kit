import { readSyntheticSnapshot, sumAvailableBaseUnits } from "@mezo-dev-kit/synthetic-reader";
import type { SyntheticReadPort } from "@mezo-dev-kit/synthetic-reader";

const blockHash = `0x${"cd".repeat(32)}`;
const port: SyntheticReadPort = {
  async readSnapshot({ blockNumber }) {
    return {
      kind: "synthetic-reading",
      blockNumber: blockNumber.toString(),
      blockHash,
      requiredValueBaseUnits: "12",
      optionalValueBaseUnits: null,
    };
  },
};

const snapshot = await readSyntheticSnapshot({ port, blockNumber: 7n });
if (snapshot.coordinate.blockNumber !== 7n || sumAvailableBaseUnits(snapshot) !== 12n) {
  throw new Error("built consumer observed an unexpected result");
}
process.stdout.write("Built package entrypoint returned a coherent synthetic snapshot.\n");
