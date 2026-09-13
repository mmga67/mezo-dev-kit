import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { Address } from "@mezo-dev-kit/evm";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, text, values } from "../../../scripts/lib/json.ts";

export async function validateNttTransferEvidence(root: string): Promise<{
  digest: string;
  tokens: readonly { networkId: string; address: Address; codeSha256: string }[];
}> {
  const digest = createHash("sha256");
  const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  async function load(reference: unknown, expected?: unknown) {
    const loaded = await loadKnowledgeReference(root, reference);
    const bytes = await readFile(loaded.path);
    if (expected !== undefined) assert.equal(sha(bytes), expected, "NTT artifact digest differs");
    digest.update(bytes);
    return object(loaded.document, "record");
  }
  const evidence = await load({
    moduleId: "workflows/bridges",
    resourceId: "ntt-transfer-qualification-2026-09-13",
  });
  assert.equal(evidence.status, "verified");
  assert.equal(evidence.supportStatus, "proposed");
  assert.equal(evidence.reviewStatus, "pending-qualified-review");
  assert.equal(evidence.reviewAfter, null);
  assert(Number.isFinite(Date.parse(text(evidence.verifiedAt, "time"))));
  const source = await load(evidence.sourceReference, evidence.sourceSha256);
  const sources = await load({ moduleId: "workflows/bridges", resourceId: "bridge-sources" });
  const official = objects(sources.sources, "sources").find(
    (s) => s.id === "official-source-musd-ntt-mainnet",
  );
  assert(official);
  assert.equal(source.commit, official.commit);
  assert.equal(source.repository, official.repository);
  const files = objects(source.files, "source files");
  assert.equal(new Set(files.map((f) => text(f.path, "source path"))).size, 12);
  const capture = await load(evidence.captureReference, evidence.captureSha256);
  const deployments = objects(
    (await load({ moduleId: "contracts", resourceId: "contract-deployments" })).records,
    "deployments",
  );
  const previous = await load({
    moduleId: "workflows/bridges",
    resourceId: "bridge-musd-ntt-evidence",
  });
  const attestationCapture = await load(evidence.attestationReference, evidence.attestationSha256);
  const attestations = objects(attestationCapture.records, "attestations");
  assert.equal(attestations.length, 4);
  assert.equal(new Set(attestations.map((a) => object(a.transfer, "transfer").id)).size, 4);
  for (const attestation of attestations) {
    const transfer = object(attestation.transfer, "transfer"),
      accepted = objects(previous.completedTransfers, "completed transfers").find(
        (t) => t.id === transfer.id,
      );
    assert.deepEqual(transfer, accepted, "NTT attestation transfer differs from indexed history");
    const destination = object(transfer.destination, "destination"),
      transaction = object(attestation.transaction, "transaction");
    assert.equal(attestation.networkId, transfer.destinationNetwork);
    assert.equal(transaction.hash, destination.transactionHash);
    assert.equal(transaction.blockHash, destination.blockHash);
    assert.equal(
      parseRpcQuantity(transaction.blockNumber).toString(),
      String(destination.blockNumber),
    );
    const vaa = parseHexData(attestation.vaa),
      message = parseHexData(attestation.message);
    assert(vaa.length <= 131074 && vaa.slice(2, 4) === "01", "bounded VAA version 1 required");
    assert.equal(message.length, 292);
    const signatures = Number.parseInt(vaa.slice(12, 14), 16);
    assert(signatures > 0);
    const body = vaa.slice(14 + signatures * 132);
    assert.equal(body.length, 536);
    assert.equal(body.slice(242, 532), message.slice(2), "VAA ordinary message differs");
    assert.equal(
      keccak256(parseHexData(`0x${body.slice(16, 20)}${message.slice(2)}`)),
      transfer.transferDigest,
      "VAA digest differs",
    );
    const calldata = parseHexData(transaction.input);
    assert(calldata.includes(vaa.slice(2)), "VAA not retained in original destination calldata");
    assert(
      objects(attestationCapture.requests, "attestation requests").some(
        (r) =>
          r.networkId === attestation.networkId &&
          r.method === "eth_getTransactionByHash" &&
          values(r.params, "params")[0] === transaction.hash &&
          JSON.stringify(object(r.response, "response").result) === JSON.stringify(transaction),
      ),
      "missing original destination transaction RPC",
    );
  }
  const records = objects(capture.records, "captured records");
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((r) => r.networkId).sort(), [
    "base-mainnet",
    "ethereum-mainnet",
    "mezo-mainnet",
  ]);
  const tokens = [];
  for (const record of records) {
    const networkId = text(record.networkId, "network");
    const requests = objects(capture.requests, "requests").filter((r) => r.networkId === networkId);
    for (const request of requests) {
      const response = object(request.response, "response");
      // Manager quote reverts are retained observations, never runtime evidence.
      if (
        ["eth_getCode", "eth_getStorageAt", "eth_getBlockByNumber"].includes(
          text(request.method, "method"),
        )
      ) {
        assert.equal(response.error, undefined, "NTT identity RPC failed");
        const params = values(request.params, "params");
        const block = request.method === "eth_getBlockByNumber" ? params[0] : params.at(-1);
        assert.equal(
          parseRpcQuantity(block).toString(),
          record.blockNumber,
          "NTT runtime observation block differs",
        );
      }
    }
    const network = await load({ moduleId: "networks", resourceId: networkId });
    const chain = requests.find((r) => r.method === "eth_chainId");
    assert(chain);
    assert.equal(
      parseRpcQuantity(object(chain.response, "response").result),
      BigInt(text(String(object(network.values, "network values").evmChainId), "chain")),
    );
    const block = parseHash32(record.blockHash);
    const headers = requests.filter((r) => r.method === "eth_getBlockByNumber");
    assert(headers.length >= 2);
    for (const header of headers) {
      const result = object(object(header.response, "response").result, "header");
      assert.equal(parseRpcQuantity(result.number).toString(), record.blockNumber);
      assert.equal(parseHash32(result.hash), block);
    }
    for (const contractId of ["bridge.musd-ntt-manager", "bridge.musd-wormhole-transceiver"]) {
      const observed = object(record[contractId], "runtime");
      const deployment = deployments.find((d) => d.id === `${contractId}@${networkId}`);
      assert(deployment);
      const runtime = object(deployment.runtime, "canonical runtime");
      const proxy = object(deployment.proxy, "proxy");
      assert.equal(parseAddress(observed.address), deployment.address);
      assert.equal(parseAddress(observed.implementation), proxy.currentImplementationAddress);
      assert.equal(
        parseAddress(`0x${parseHash32(observed.slot).slice(-40)}`),
        observed.implementation,
      );
      for (const [field, expected] of [
        ["code", runtime.addressCodeSha256],
        ["implementationCode", runtime.implementationCodeSha256],
      ] as const) {
        const code = parseHexData(observed[field]);
        assert.equal(sha(Buffer.from(code.slice(2), "hex")), expected);
        assert(
          requests.some(
            (r) =>
              r.method === "eth_getCode" &&
              object(r.response, "response").result === code &&
              values(r.params, "params")[0] ===
                observed[field === "code" ? "address" : "implementation"],
          ),
          "missing code observation",
        );
      }
      assert(
        requests.some(
          (r) =>
            r.method === "eth_getStorageAt" &&
            values(r.params, "params")[0] === observed.address &&
            values(r.params, "params")[1] === proxy.implementationSlot &&
            object(r.response, "response").result === observed.slot,
        ),
        "missing slot observation",
      );
    }
    const token = object(record.token, "token");
    const old = objects(previous.deploymentObservations, "previous observations").find(
      (d) => d.networkSnapshotId === `${networkId}-snapshot`,
    );
    assert(old);
    assert.equal(parseAddress(token.address), old.tokenAddress);
    const code = parseHexData(token.code);
    assert(code.length > 2);
    assert(
      requests.some(
        (r) =>
          r.method === "eth_getCode" &&
          values(r.params, "params")[0] === token.address &&
          object(r.response, "response").result === code,
      ),
    );
    tokens.push({
      networkId,
      address: parseAddress(token.address),
      codeSha256: sha(Buffer.from(code.slice(2), "hex")),
    });
  }
  return { digest: digest.digest("hex"), tokens };
}
