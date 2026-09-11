import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text } from "./json.ts";

/** Validate compiler-derived profiles against registered executables and embedded child programs. */
export async function generateVotingInterfaces(
  root: string,
): Promise<{ voters: Record<string, unknown>; rewards: Record<string, unknown>; digest: string }> {
  const digest = createHash("sha256");
  async function load(reference: unknown, expected?: string) {
    const loaded = await loadKnowledgeReference(root, reference),
      bytes = await readFile(loaded.path);
    if (expected !== undefined && createHash("sha256").update(bytes).digest("hex") !== expected)
      throw new Error("voting artifact digest differs");
    digest.update(bytes);
    return object(loaded.document, "voting artifact");
  }
  const catalog = await load({ moduleId: "contracts", resourceId: "voting-interfaces" });
  if (
    catalog.status !== "verified" ||
    catalog.supportStatus !== "proposed" ||
    catalog.reviewStatus !== "pending-qualified-review"
  )
    throw new Error("voting profile lifecycle differs");
  function hex(value: unknown) {
    const result = text(value, "bytecode").toLowerCase();
    if (!/^0x(?:[a-f0-9]{2})+$/.test(result)) throw new Error("invalid voting bytecode");
    return result.slice(2);
  }
  function executable(value: string) {
    const size = Number.parseInt(value.slice(-4), 16) + 2;
    if (size < 2 || size * 2 >= value.length) throw new Error("invalid compiler metadata");
    return value.slice(0, -size * 2);
  }
  const voters: Record<string, unknown> = {};
  let factoryRuntime = "";
  for (const record of objects(catalog.records, "voting records")) {
    const sourceRef = object(record.source, "source"),
      buildRef = object(record.build, "build"),
      source = await load(sourceRef.reference, text(sourceRef.sha256, "source digest")),
      build = await load(buildRef.reference, text(buildRef.sha256, "build digest"));
    const deployment = await loadKnowledgeReference(root, {
      moduleId: "contracts",
      resourceId: "contract-deployments",
      recordId: `${text(record.contractId, "contract")}@mezo-mainnet`,
    });
    digest.update(await readFile(deployment.path));
    const runtime = object(object(deployment.value, "deployment").runtime, "runtime"),
      deployed = hex(source.deployed_bytecode),
      compiled = object(build.deployedBytecode, "compiled runtime"),
      codeSha = createHash("sha256").update(Buffer.from(deployed, "hex")).digest("hex");
    if (
      source.is_verified !== true ||
      codeSha !== record.runtimeSha256 ||
      codeSha !== (runtime.implementationCodeSha256 ?? runtime.addressCodeSha256)
    )
      throw new Error("voting executable generation differs");
    let actual = hex(compiled.object);
    if (actual.length !== deployed.length) throw new Error("voting runtime length differs");
    const refs =
      compiled.immutableReferences === undefined
        ? {}
        : object(compiled.immutableReferences, "immutables");
    for (const ranges of Object.values(refs))
      for (const range of objects(ranges, "immutable ranges")) {
        const start = Number(range.start) * 2,
          length = Number(range.length) * 2;
        if (
          !Number.isSafeInteger(start) ||
          start < 0 ||
          length !== 64 ||
          start + length > executable(actual).length
        )
          throw new Error("invalid voting immutable");
        actual =
          actual.slice(0, start) +
          deployed.slice(start, start + length) +
          actual.slice(start + length);
      }
    if (executable(actual) !== executable(deployed))
      throw new Error("voting compiler reproduction differs");
    if (record.id === "rewards-factory") {
      if (
        actual !== deployed ||
        hex(object(build.bytecode, "creation").object) !== hex(source.creation_bytecode)
      )
        throw new Error("factory must reproduce full bytecode");
      factoryRuntime = deployed;
    } else {
      const layout = object(build.storageLayout, "storage layout"),
        field = objects(layout.storage, "storage").find((row) => row.label === record.listGetter);
      if (
        !field ||
        field.slot !== record.targetListSlot ||
        field.offset !== 0 ||
        field.type !== "t_mapping(t_uint256,t_array(t_address)dyn_storage)"
      )
        throw new Error("voter target layout differs");
      voters[text(record.id, "domain")] = {
        contractId: record.contractId,
        listGetter: record.listGetter,
        targetListSlot: record.targetListSlot,
      };
    }
  }
  const rewards: Record<string, unknown> = {};
  for (const child of objects(catalog.children, "reward children")) {
    const build = await load(child.reference, text(child.sha256, "child digest")),
      runtime = object(build.deployedBytecode, "child runtime"),
      creation = hex(object(build.bytecode, "child creation").object),
      template = hex(runtime.object);
    if (!factoryRuntime.includes(creation) || !creation.includes(template))
      throw new Error("reward child is not embedded in the exact factory");
    const refs = object(runtime.immutableReferences, "reward immutables"),
      ranges = Object.values(refs)
        .flatMap((value) => objects(value, "ranges"))
        .map((row) => `${String(row.start)}:${String(row.length)}`)
        .sort();
    const bindings = objects(child.immutableBindings, "bindings"),
      seen: string[] = [];
    if (bindings.length !== 3 || new Set(bindings.map((row) => row.role)).size !== 3)
      throw new Error("three distinct reward immutable roles required");
    const immutableWords = bindings.flatMap((binding) => {
      if (!["forwarder", "voter", "ve"].includes(text(binding.role, "role")))
        throw new Error("unknown reward immutable role");
      return objects(binding.ranges, "ranges").map((range) => {
        const start = Number(range.start),
          length = Number(range.length);
        if (
          !Number.isSafeInteger(start) ||
          start < 0 ||
          length !== 32 ||
          start * 2 + 64 > executable(template).length ||
          template.slice(start * 2, start * 2 + 64) !== "0".repeat(64)
        )
          throw new Error("invalid reward immutable word");
        seen.push(`${start}:${length}`);
        return { role: binding.role, start };
      });
    });
    if (JSON.stringify(ranges) !== JSON.stringify(seen.sort()))
      throw new Error("reward immutable coverage differs");
    rewards[text(child.role, "reward role")] = {
      factoryContractId: "incentives.voting-rewards-factory",
      runtimeTemplate: `0x${template}`,
      immutableWords,
      abi: objects(build.abi, "reward ABI").filter(
        (entry) =>
          entry.type === "event" ||
          (entry.type === "function" &&
            (entry.stateMutability === "view" ||
              entry.stateMutability === "pure" ||
              entry.name === "getReward")),
      ),
    };
  }
  return { voters, rewards, digest: digest.digest("hex") };
}
