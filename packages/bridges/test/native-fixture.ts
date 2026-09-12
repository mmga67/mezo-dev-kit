import { createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseHash32, parseRpcQuantity } from "@mezo-dev-kit/evm";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, parseJson, text } from "../../../scripts/lib/json.ts";
import type { NativeObserverConfig, NativeObserveInput } from "../src/native-types.ts";
export async function nativeFixture(inbound = true): Promise<{
  config: NativeObserverConfig;
  input: NativeObserveInput;
  probes: Record<string, unknown>[];
  consensus: Record<string, unknown>;
  calls: { networkId: string; method: string; params: readonly unknown[] }[];
  probe: (id: number) => Record<string, unknown>;
}> {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const probes = objects(
    (
      await loadKnowledgeReference(root, {
        moduleId: "contracts",
        resourceId: "historical-native-rpc",
      })
    ).document,
    "probes",
  );
  const capture = object(
      (
        await loadKnowledgeReference(root, {
          moduleId: "workflows/bridges",
          resourceId: "native-consensus-block-8944561",
        })
      ).document,
      "capture",
    ),
    consensus = object(
      object(parseJson(text(capture.body, "body"), "response"), "response").result,
      "consensus",
    );
  const evidence = object(
      (
        await loadKnowledgeReference(root, {
          moduleId: "workflows/bridges",
          resourceId: "bridge-native-evidence",
        })
      ).document,
      "evidence",
    ),
    transfer = objects(evidence.completedTransfers, "transfers")[inbound ? 0 : 1];
  if (!transfer) throw new Error("missing transfer");
  const calls: { networkId: string; method: string; params: readonly unknown[] }[] = [];
  function transport(networkId: string) {
    const request: RpcRequest = async (input) => {
      calls.push({ networkId, ...input });
      const candidates = probes.filter(
        (p) => p.networkId === networkId && object(p.request, "request").method === input.method,
      );
      if (input.method === "eth_blockNumber") {
        const heights = probes
          .filter(
            (p) =>
              p.networkId === networkId &&
              object(p.request, "request").method === "eth_getBlockByNumber",
          )
          .map((p) =>
            parseRpcQuantity(object(object(p.response, "response").result, "block").number),
          );
        // Captured blocks establish a conservative height floor, not a fabricated current head.
        return `0x${heights.reduce((a, b) => (a > b ? a : b), 0n).toString(16)}`;
      }
      const found = candidates.find((p) => {
        const params = object(p.request, "request").params;
        return input.method === "eth_getBlockByNumber"
          ? Array.isArray(params) && params[0] === input.params[0]
          : JSON.stringify(params) === JSON.stringify(input.params);
      });
      if (!found) {
        if (input.method === "eth_getTransactionReceipt") return null;
        throw new Error(`uncaptured ${networkId} ${input.method}`);
      }
      const response = object(found.response, "response");
      if (response.error !== undefined) throw new Error("captured RPC error");
      return structuredClone(response.result);
    };
    return createRpcTransport({ id: `captured-${networkId}`, request });
  }
  const sourceNetwork = text(transfer.sourceNetwork, "source network"),
    destinationNetwork = text(transfer.destinationNetwork, "destination network");
  return {
    config: {
      routeId: inbound ? "mezo-native-usdc-ethereum-to-mezo" : "mezo-native-btc-mezo-to-ethereum",
      sourceTransport: transport(sourceNetwork),
      destinationTransport: transport(destinationNetwork),
      sourceConfirmations: 1n,
      destinationConfirmations: 1n,
      getMezoConsensusBlock: async () => structuredClone(consensus),
    },
    input: {
      sourceTransactionHash: parseHash32(object(transfer.source, "source").transactionHash),
      destinationTransactionHashes: [
        parseHash32(object(transfer.destination, "destination").transactionHash),
      ],
    },
    probes,
    consensus,
    calls,
    probe: (id: number) => {
      const found = probes.find((p) => object(p.request, "request").id === id);
      if (!found) throw new Error("probe missing");
      return object(found.response, "response");
    },
  };
}
