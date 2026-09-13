import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
import type { Address } from "@mezo-dev-kit/evm";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, text, values } from "../../../scripts/lib/json.ts";

export async function validateMusdtTokenEvidence(root: string): Promise<{
  digest: string;
  profile: {
    address: Address;
    decimals: number;
    implementationAddress: Address;
    implementationSlot: string;
    addressCodeSha256: string;
    implementationCodeSha256: string;
  };
}> {
  const digest = createHash("sha256"),
    sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  async function load(moduleId: string, resourceId: string) {
    const loaded = await loadKnowledgeReference(root, { moduleId, resourceId });
    digest.update(await readFile(loaded.path));
    return object(loaded.document, resourceId);
  }
  const profile = await load("contracts", "musdt-token-runtime");
  assert.equal(profile.id, "musdt-token-runtime");
  assert.equal(profile.kind, "token-runtime-profile");
  assert.equal(profile.status, "verified");
  assert.equal(profile.supportStatus, "proposed");
  assert.equal(profile.reviewStatus, "pending-qualified-review");
  assert.equal(profile.decimals, 6);
  assert(Number.isFinite(Date.parse(text(profile.verifiedAt, "verified time"))));
  assert(
    Date.parse(text(profile.reviewAfter, "review time")) >
      Date.parse(text(profile.verifiedAt, "verified time")),
  );
  const artifacts = objects(profile.artifacts, "artifacts");
  assert.deepEqual(
    artifacts
      .map((a) => object(a.reference, "reference"))
      .sort((a, b) => text(a.resourceId, "resource").localeCompare(text(b.resourceId, "resource"))),
    [
      "musdt-token-implementation-explorer",
      "musdt-token-proxy-explorer",
      "musdt-token-runtime-probe",
    ].map((resourceId) => ({ moduleId: "contracts", resourceId })),
    "mUSDT artifact bindings must be complete and unique",
  );
  for (const artifact of artifacts) {
    const loaded = await loadKnowledgeReference(root, artifact.reference),
      bytes = await readFile(loaded.path);
    assert.equal(sha(bytes), artifact.sha256, "mUSDT artifact digest differs");
    digest.update(bytes);
  }
  const proxy = await load("contracts", "musdt-token-proxy-explorer"),
    implementation = await load("contracts", "musdt-token-implementation-explorer"),
    capture = await load("contracts", "musdt-token-runtime-probe");
  assert.equal(proxy.name, "TransparentUpgradeableProxy");
  assert.equal(implementation.name, "mUSDT");
  assert.equal(proxy.is_fully_verified, true);
  assert.equal(implementation.is_fully_verified, true);
  assert.equal(proxy.compiler_version, "v0.8.29+commit.ab55807c");
  assert.equal(implementation.compiler_version, proxy.compiler_version);
  assert(
    /^\/\/ SPDX-License-Identifier: LGPL-3\.0\s+pragma solidity 0\.8\.29;\s+import "\.\/mERC20\.sol";\s+contract mUSDT is mERC20 \{\}\s*$/.test(
      text(implementation.source_code, "implementation source"),
    ),
    "mUSDT empty subclass changed",
  );
  for (const [candidate, reference] of [
    [proxy, "musdc-token-proxy-explorer"],
    [implementation, "musdc-token-implementation-explorer"],
  ] as const) {
    const accepted = await load("contracts", reference);
    assert.deepEqual(
      objects(candidate.additional_sources, "source files")
        .map((f) => [f.file_path, f.source_code])
        .sort(),
      objects(accepted.additional_sources, "source files")
        .map((f) => [f.file_path, f.source_code])
        .sort(),
      "mUSDT inherited source differs from retained mERC20 class",
    );
    if (reference === "musdc-token-proxy-explorer")
      assert.equal(candidate.source_code, accepted.source_code);
  }
  const result = object(capture.result, "result"),
    runtime = object(result.runtime, "runtime"),
    block = object(result.block, "block"),
    scope = object(profile.scope, "scope");
  assert.deepEqual(scope.networkIds, ["mezo-mainnet"]);
  assert.equal(scope.blockNumber, block.number);
  assert.equal(scope.blockHash, block.hash);
  const blockNumber = parseUnsignedInteger(block.number),
    blockHash = parseHash32(block.hash);
  const requests = objects(capture.requests, "requests");
  assert.equal(profile.verifiedAt, capture.at);
  const urls = new Set(requests.map((r) => text(r.url, "RPC URL")));
  assert.equal(urls.size, 1, "mUSDT capture must retain a coherent provider");
  for (const request of requests) {
    const response = object(request.response, "response");
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.error, undefined, "mUSDT capture contains a failed call");
    assert(response.result !== undefined);
  }
  const network = await load("networks", "mezo-mainnet");
  const chain = requests.find((r) => r.method === "eth_chainId");
  assert(chain);
  assert.equal(
    parseRpcQuantity(object(chain.response, "response").result),
    parseUnsignedInteger(String(object(network.values, "network values").evmChainId)),
  );
  const headers = requests.filter((r) => r.method === "eth_getBlockByNumber");
  assert.equal(headers.length, 2);
  for (const header of headers) {
    const value = object(object(header.response, "response").result, "header");
    assert.equal(parseRpcQuantity(value.number), blockNumber);
    assert.equal(parseHash32(value.hash), blockHash);
  }
  const address = parseAddress(profile.tokenAddress),
    implementationAddress = parseAddress(profile.implementationAddress),
    implementationSlot = parseHash32(profile.implementationSlot);
  assert.equal(runtime.token, address);
  assert.equal(runtime.implementation, implementationAddress);
  assert.equal(runtime.slot, implementationSlot);
  assert.equal(runtime.storage, `0x${"0".repeat(24)}${implementationAddress.slice(2)}`);
  for (const [target, code, expected, explorer] of [
    [address, runtime.code, profile.addressCodeSha256, proxy],
    [
      implementationAddress,
      runtime.implementationCode,
      profile.implementationCodeSha256,
      implementation,
    ],
  ] as const) {
    const bytes = parseHexData(code);
    assert.equal(bytes, explorer.deployed_bytecode);
    assert.equal(sha(Buffer.from(bytes.slice(2), "hex")), expected);
    assert(
      requests.some(
        (r) =>
          r.method === "eth_getCode" &&
          values(r.params, "params")[0] === target &&
          parseRpcQuantity(values(r.params, "params")[1]) === blockNumber &&
          object(r.response, "response").result === bytes,
      ),
      "mUSDT code request missing",
    );
  }
  assert(
    requests.some(
      (r) =>
        r.method === "eth_getStorageAt" &&
        values(r.params, "params")[0] === address &&
        values(r.params, "params")[1] === implementationSlot &&
        parseRpcQuantity(values(r.params, "params")[2]) === blockNumber &&
        object(r.response, "response").result === runtime.storage,
    ),
    "mUSDT slot request missing",
  );
  assert.equal(result.decimals, "6");
  assert(
    requests.some((r) => {
      if (r.method !== "eth_call") return false;
      const p = values(r.params, "params"),
        call = object(p[0], "call");
      return (
        call.to === address &&
        call.data === "0x313ce567" &&
        parseRpcQuantity(p[1]) === blockNumber &&
        object(r.response, "response").result === `0x${"0".repeat(63)}6`
      );
    }),
    "mUSDT precision request missing",
  );
  const native = await loadKnowledgeReference(root, profile.sourceMappingReference);
  digest.update(await readFile(native.path));
  assert(
    objects(object(native.document, "Native evidence").erc20Mappings, "mappings").some(
      (m) => m.sourceToken === profile.sourceToken && m.mezoToken === address,
    ),
    "mUSDT original mapping differs",
  );
  assert.deepEqual(result.currentMapping, [profile.sourceToken, address]);
  const deployments = await load("contracts", "contract-deployments"),
    bridges = objects(deployments.records, "deployments").filter(
      (r) =>
        r.contractId === "bridge.native-assets-precompile" &&
        r.networkId === "mezo-mainnet" &&
        r.status === "verified-current",
    );
  assert.equal(bridges.length, 1);
  const bridge = bridges[0];
  assert(bridge);
  const abiResource = await loadKnowledgeReference(root, {
    moduleId: "contracts",
    resourceId: "abi.bridge.native-assets-precompile",
  });
  digest.update(await readFile(abiResource.path));
  const mappingAbi = objects(abiResource.document, "bridge ABI").find(
    (e) => e.name === "getERC20TokenMapping",
  );
  assert(mappingAbi);
  const mappingData = createAbiCodec().encodeFunction(mappingAbi, [
    parseAddress(profile.sourceToken),
  ]);
  assert(
    requests.some((r) => {
      if (r.method !== "eth_call") return false;
      const p = values(r.params, "params"),
        call = object(p[0], "call");
      return (
        call.to === bridge.address &&
        call.data === mappingData &&
        parseRpcQuantity(p[1]) === blockNumber &&
        object(r.response, "response").result ===
          `0x${parseAddress(profile.sourceToken).slice(2).padStart(64, "0")}${address.slice(2).padStart(64, "0")}`
      );
    }),
    "mUSDT current mapping request missing",
  );
  return {
    digest: digest.digest("hex"),
    profile: {
      address,
      decimals: 6,
      implementationAddress,
      implementationSlot,
      addressCodeSha256: text(profile.addressCodeSha256, "code hash"),
      implementationCodeSha256: text(profile.implementationCodeSha256, "implementation hash"),
    },
  };
}
