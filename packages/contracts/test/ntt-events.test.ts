import assert from "node:assert/strict";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { createAbiCodec, parseHash32, parseHexData } from "@mezo-dev-kit/evm";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, text, values } from "../../../scripts/lib/json.ts";
import { resolveContract } from "../src/index.ts";

const root = resolve(import.meta.dirname, "../../..");

test.for(["mezo-mainnet", "ethereum-mainnet", "base-mainnet"] as const)(
  "registry ABI decodes both retained TransferSent overloads on %s",
  async (networkId) => {
    const review = object(
      (
        await loadKnowledgeReference(root, {
          moduleId: "contracts",
          resourceId: "ntt-transfer-event-abi-review-2026-10-07",
        })
      ).document,
      "event review",
    );
    const history = object(
      (await loadKnowledgeReference(root, review.evidence)).document,
      "history",
    );
    const endpoint = objects(
      object(history.initial, "initial capture").endpoints,
      "endpoints",
    ).find((e) => e.networkId === networkId);
    assert(endpoint);
    const cases = objects(review.checks, "event cases").filter(
      (c) => c.sourceNetwork === networkId,
    );
    expect(cases.length).toBeGreaterThan(0);
    const codec = createAbiCodec();
    for (const entry of cases) {
      const request = objects(endpoint.requests, "requests").find(
        (r) =>
          r.method === "eth_getTransactionReceipt" &&
          values(r.params, "params")[0] === entry.transactionHash,
      );
      assert(request);
      const receipt = object(object(request.response, "response").result, "receipt");
      expect(receipt.blockHash).toBe(entry.blockHash);
      expect(receipt.status).toBe("0x1");
      const contract = resolveContract({
        contractId: "bridge.musd-ntt-manager",
        networkId,
        blockNumber: BigInt(text(receipt.blockNumber, "receipt block")),
      });
      const events = contract.readAbi.filter(
        (e) => e.type === "event" && e.name === "TransferSent",
      );
      expect(events).toHaveLength(2);
      for (const expected of objects(entry.decoded, "expected events")) {
        const arity = expected.event === "digest" ? 1 : 6;
        const event = events.find((e) => values(e.inputs, "inputs").length === arity);
        const other = events.find((e) => values(e.inputs, "inputs").length !== arity);
        assert(event && other);
        const decoded = objects(receipt.logs, "logs").flatMap((log) => {
          if (log.address !== contract.address) return [];
          const input = {
            topics: values(log.topics, "topics").map((t) => parseHash32(t)),
            data: parseHexData(log.data),
          };
          const result = codec.decodeEvent(event, input);
          if (result === null) return [];
          expect(codec.decodeEvent(other, input)).toBeNull();
          expect(() =>
            codec.decodeEvent(event, { ...input, topics: input.topics.slice(0, -1) }),
          ).toThrow(expect.objectContaining({ code: "InvalidAbi" }));
          return [result.map((v) => (typeof v === "bigint" ? v.toString() : v))];
        });
        expect(decoded).toEqual([expected.values]);
      }
    }
  },
);
