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
import { object, objects, parseJson, text, texts, values } from "../../../scripts/lib/json.ts";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";

/** Offline semantic/provenance validation. No runtime package reads knowledge. */
export async function generateHistoricalContractEvidence(
  root: string,
): Promise<{ records: readonly Record<string, unknown>[]; digest: string }> {
  const digest = createHash("sha256"),
    codec = createAbiCodec();
  const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  function integer(value: unknown) {
    if (typeof value === "number") {
      assert(Number.isSafeInteger(value) && value >= 0, "invalid historical integer");
      return BigInt(value);
    }
    return parseUnsignedInteger(value);
  }
  async function load(reference: unknown, expected?: unknown): Promise<unknown> {
    const loaded = await loadKnowledgeReference(root, reference),
      bytes = await readFile(loaded.path);
    if (expected !== undefined)
      assert.equal(
        sha(bytes),
        text(expected, "artifact sha256"),
        "historical artifact digest differs",
      );
    digest.update(bytes);
    return loaded.value;
  }
  const catalog = object(
    await load({ moduleId: "contracts", resourceId: "historical-contract-evidence" }),
    "catalog",
  );
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.kind, "historical-contract-evidence-catalog");
  assert.equal(catalog.status, "verified", "historical evidence lifecycle differs");
  assert.equal(catalog.supportStatus, "proposed", "historical evidence lifecycle differs");
  assert.equal(
    catalog.reviewStatus,
    "pending-qualified-review",
    "historical evidence lifecycle differs",
  );
  assert(Number.isFinite(Date.parse(text(catalog.verifiedAt, "verifiedAt"))));
  assert.equal(
    catalog.reviewAfter,
    null,
    "historical evidence uses fixed hashes, not a current-state freshness window",
  );
  const deployments = objects(
    object(await load({ moduleId: "contracts", resourceId: "contract-deployments" }), "deployments")
      .records,
    "deployments",
  );
  const rows = objects(catalog.records, "historical records"),
    ids = new Set<string>(),
    spans: { key: string; from: bigint; until: bigint }[] = [];
  assert(rows.length > 0);
  const projected: Record<string, unknown>[] = [];
  for (const row of rows) {
    const id = text(row.id, "generation ID");
    assert(!ids.has(id), "duplicate historical generation");
    ids.add(id);
    const contractId = text(row.contractId, "contract ID"),
      networkId = text(row.networkId, "network ID"),
      address = parseAddress(row.address);
    const deployment = deployments.find(
      (d) => d.contractId === contractId && d.networkId === networkId && d.address === address,
    );
    assert(deployment, "historical logical identity differs");
    assert.equal(
      deployment.provenanceClass,
      row.provenanceClass,
      "historical provenance class differs",
    );
    const network = object(await load({ moduleId: "networks", resourceId: networkId }), "network");
    const chainId = integer(object(network.values, "network values").evmChainId);
    const sourceRef = object(row.source, "source"),
      buildRef = object(row.build, "build"),
      observationRef = object(row.observations, "observations");
    const source = object(await load(sourceRef.reference, sourceRef.sha256), "source"),
      build = object(await load(buildRef.reference, buildRef.sha256), "build");
    const probes = objects(
      await load(observationRef.reference, observationRef.sha256),
      "RPC evidence",
    );
    function probe(id: unknown, method: string, params?: readonly unknown[]) {
      const found = probes.find((p) => object(p.request, "request").id === id);
      assert(found, "historical probe missing");
      assert.equal(found.networkId, networkId, "historical probe network differs");
      assert.equal(found.httpStatus, 200, "historical probe unavailable");
      const request = object(found.request, "request"),
        response = object(found.response, "response");
      assert.equal(request.method, method, "historical probe method differs");
      assert.equal(response.id, id, "historical RPC ID differs");
      if (params) assert.deepEqual(request.params, params, "historical probe coordinate differs");
      return response;
    }
    function result(id: unknown, method: string, params?: readonly unknown[]) {
      const response = probe(id, method, params);
      assert.equal(response.error, undefined, "historical probe failed");
      return response.result;
    }
    assert.equal(
      parseRpcQuantity(result(row.chainProbeId, "eth_chainId", [])),
      chainId,
      "historical chain identity differs",
    );
    const abi = objects(build.abi, "full ABI"),
      runtimeBytecode = parseHexData(build.runtimeBytecode);
    assert(
      runtimeBytecode.length > 2 && runtimeBytecode.length < 2 * 1024 * 1024,
      "historical runtime bounds",
    );
    assert(abi.length > 0 && abi.length <= 1024, "historical ABI bounds");
    const functions = abi.filter((e) => e.type === "function");
    function entry(name: string) {
      const matches = functions.filter((e) => e.name === name);
      assert.equal(matches.length, 1, "historical ABI method differs");
      return matches[0];
    }
    let implementationAddress: ReturnType<typeof parseAddress> | null = null,
      implementationSlot: ReturnType<typeof parseHash32> | null = null;
    if (row.provenanceClass === "deployed-executable-reproduction") {
      implementationAddress = parseAddress(row.implementationAddress);
      implementationSlot = parseHash32(row.implementationSlot);
      const proxy = object(deployment.proxy, "proxy");
      assert.equal(proxy.implementationSlot, implementationSlot);
      const generation = objects(proxy.implementationHistory, "history").find(
        (r) => r.implementationAddress === implementationAddress,
      );
      assert(generation, "historical implementation absent");
      assert.deepEqual(row.generationRange, generation, "historical implementation range differs");
      assert.equal(row.executionVersion, null);
      assert.deepEqual(build.immutableReferences, {});
      assert.deepEqual(build.linkReferences, {});
      const metadata = object(build.metadata, "metadata"),
        input = object(source.standardInput, "input"),
        sources = object(input.sources, "sources");
      assert.equal(object(metadata.compiler, "compiler").version, source.compiler);
      assert.equal(build.compiler, source.compiler);
      assert.deepEqual(
        object(metadata.output, "output").abi,
        abi,
        "historical ABI differs from compiler metadata",
      );
      const retained = object(metadata.sources, "metadata sources");
      assert.deepEqual(Object.keys(sources).sort(), Object.keys(retained).sort());
      for (const [path, value] of Object.entries(sources))
        assert.equal(
          object(value, "input source").content,
          object(retained[path], "metadata source").content,
          "historical compiler source differs",
        );
      const settings = object(input.settings, "settings"),
        compiledSettings = object(metadata.settings, "metadata settings");
      for (const key of ["optimizer", "evmVersion", "libraries"])
        assert.deepEqual(
          settings[key] ?? {},
          compiledSettings[key] ?? {},
          `historical compiler ${key} differs`,
        );
      // solc 0.8.24 writes its default IPFS metadata hash mode into output metadata.
      assert.deepEqual(
        { bytecodeHash: "ipfs", ...object(settings.metadata, "input metadata settings") },
        compiledSettings.metadata,
        "historical compiler metadata settings differ",
      );
    } else if (row.provenanceClass === "official-client-precompile-source") {
      assert.equal(row.implementationAddress, null);
      assert.equal(row.implementationSlot, null);
      assert.equal(row.generationRange, null);
      assert.equal(row.executionVersion, 5);
      assert.equal(build.executionVersion, 5);
      assert.equal(source.commit, "8542dad7bab1ca2b32d96c37d966f5b713906737");
      assert.equal(source.repository, "https://github.com/mezo-org/mezod");
      const files = object(source.files, "source files");
      for (const value of Object.values(files)) {
        const file = object(value, "file");
        assert.equal(
          sha(text(file.content, "content")),
          file.sha256,
          "historical client source digest differs",
        );
      }
      const content = (path: string) => text(object(files[path], path).content, path);
      assert.deepEqual(
        parseJson(content("precompile/assetsbridge/abi.json"), "source ABI"),
        abi,
        "historical ABI differs from official client",
      );
      assert(
        content("precompile/assetsbridge/byte_code.go")
          .toLowerCase()
          .includes(runtimeBytecode.slice(2)),
        "historical wrapper differs from official client",
      );
      assert(
        content("app/upgrades/v9_0/upgrades.go").includes(".Version = 5"),
        "historical execution upgrade differs",
      );
      assert(
        content("x/evm/types/precompile.go").includes("AssetsBridgePrecompileLatestVersion = 5"),
        "historical execution map differs",
      );
    } else throw new Error("unsupported historical provenance class");
    const currentAbi =
      implementationAddress === null ? objects(await loadCurrentAbi(), "current ABI") : [];
    const coverage = objects(row.coverage, "coverage").map((span) => {
      const from = parseUnsignedInteger(text(span.fromBlock, "fromBlock")),
        until = parseUnsignedInteger(text(span.untilExclusiveBlock, "untilBlock"));
      assert.equal(until, from + 1n, "historical coverage must be a single observed block");
      const key = `${contractId}@${networkId}`;
      assert(
        !spans.some((s) => s.key === key && s.from < until && from < s.until),
        "overlapping historical coverage",
      );
      spans.push({ key, from, until });
      const blockHash = parseHash32(span.blockHash),
        coordinate = `0x${from.toString(16)}`;
      const block = object(
        result(span.blockProbeId, "eth_getBlockByNumber", [
          coordinate,
          implementationAddress === null,
        ]),
        "observed block",
      );
      assert.equal(parseRpcQuantity(block.number), from);
      assert.equal(parseHash32(block.hash), blockHash, "historical block hash differs");
      assert.equal(
        parseHexData(
          result(span.codeProbeId, "eth_getCode", [implementationAddress ?? address, coordinate]),
        ),
        runtimeBytecode,
        "historical executable differs",
      );
      const ids = values(span.probeIds, "generation probes");
      if (implementationAddress !== null) {
        assert.equal(ids.length, 1);
        const word = parseHash32(
          result(ids[0], "eth_getStorageAt", [address, implementationSlot, coordinate]),
        );
        assert.equal(
          word,
          `0x${"0".repeat(24)}${implementationAddress.slice(2)}`,
          "historical implementation slot differs",
        );
        const generation = object(row.generationRange, "range");
        assert(
          from >= integer(object(generation.effectiveFrom, "from").blockNumber) &&
            until <= integer(object(generation.effectiveUntilExclusive, "until").blockNumber),
          "historical observation outside implementation range",
        );
      } else {
        assert.equal(ids.length, 2);
        codec.decodeFunction(
          entry("getTripartyBlockDelay"),
          parseHexData(
            result(ids[0], "eth_call", [
              { to: address, data: codec.encodeFunction(entry("getTripartyBlockDelay")) },
              coordinate,
            ]),
          ),
        );
        const unavailable = currentAbi.find(
          (e) => e.type === "function" && e.name === "getBridgeOutChains",
        );
        assert(unavailable);
        const failed = probe(ids[1], "eth_call", [
          { to: address, data: codec.encodeFunction(unavailable) },
          coordinate,
        ]);
        assert.equal(failed.result, undefined);
        assert(
          text(object(failed.error, "expected method failure").message, "error").includes(
            "method not found in precompile",
          ),
          "historical execution discriminator differs",
        );
      }
      return { fromBlock: from.toString(), untilExclusiveBlock: until.toString(), blockHash };
    });
    assert(coverage.length > 0);
    projected.push({
      generationId: id,
      contractId,
      networkId,
      address,
      implementationAddress,
      implementationSlot,
      executionVersion: row.executionVersion,
      provenanceClass: row.provenanceClass,
      coverage,
      runtimeBytecode,
      readAbi: abi.filter(
        (e) =>
          e.type === "event" ||
          (e.type === "function" && ["view", "pure"].includes(String(e.stateMutability))),
      ),
      calldataAbi: functions,
      abiSha256: sha(JSON.stringify(abi)),
      sourceSha256: sourceRef.sha256,
      buildSha256: buildRef.sha256,
      observationsSha256: observationRef.sha256,
      verifiedAt: catalog.verifiedAt,
      status: catalog.status,
      supportStatus: catalog.supportStatus,
      reviewStatus: catalog.reviewStatus,
      limitations: texts(catalog.limitations, "limitations"),
    });
  }
  return { records: projected, digest: digest.digest("hex") };
  async function loadCurrentAbi(): Promise<unknown> {
    return load({ moduleId: "contracts", resourceId: "abi.bridge.native-assets-precompile" });
  }
}
