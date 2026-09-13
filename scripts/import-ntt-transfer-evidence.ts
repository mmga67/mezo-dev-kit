import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, parseJson, text } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [captureDirectory, sourceDirectory, attestationDirectory, ...extra] = process.argv.slice(2);
if (!captureDirectory || !sourceDirectory || !attestationDirectory || extra.length)
  throw new Error(
    "usage: import-ntt-transfer-evidence.ts <capture-directory> <official-source-checkout> <attestation-capture-directory>",
  );
const sources = object(
  (
    await loadKnowledgeReference(root, {
      moduleId: "workflows/bridges",
      resourceId: "bridge-sources",
    })
  ).document,
  "sources",
);
const source = objects(sources.sources, "sources").find(
  (s) => s.id === "official-source-musd-ntt-mainnet",
);
if (!source) throw new Error("missing source owner");
const commit = text(source.commit, "commit");
if (
  execFileSync("git", ["-C", resolve(sourceDirectory), "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim() !== commit
)
  throw new Error("source checkout differs from indexed commit");
const files = [
  "evm/src/NttManager/NttManager.sol",
  "evm/src/NttManager/ManagerBase.sol",
  "evm/src/NttManager/TransceiverRegistry.sol",
  "evm/src/libraries/TrimmedAmount.sol",
  "evm/src/libraries/RateLimiter.sol",
  "evm/src/libraries/TransceiverStructs.sol",
  "evm/src/interfaces/INttManager.sol",
  "evm/src/interfaces/IManagerBase.sol",
  "evm/src/interfaces/IRateLimiter.sol",
  "evm/src/Transceiver/WormholeTransceiver/WormholeTransceiver.sol",
  "evm/src/Transceiver/WormholeTransceiver/WormholeTransceiverState.sol",
  "evm/src/interfaces/IWormholeTransceiver.sol",
].map((path) => ({
  path,
  content: execFileSync("git", ["-C", resolve(sourceDirectory), "show", `${commit}:${path}`], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  }),
}));
const capture = object(
  parseJson(await readFile(resolve(captureDirectory, "capture.json"), "utf8"), "capture"),
  "capture",
);
if (objects(capture.records, "records").length !== 3)
  throw new Error("capture must cover three networks");
const sourceArtifact = { repository: source.repository, commit, files };
const attestations = object(
  parseJson(await readFile(resolve(attestationDirectory, "capture.json"), "utf8"), "attestations"),
  "attestations",
);
if (objects(attestations.records, "attestation records").length !== 4)
  throw new Error("attestations must cover four indexed transfers");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const formatted = async (value: unknown) =>
  format(json(value), { ...(await resolveConfig(resolve(root, "package.json"))), parser: "json" });
const moduleDirectory = resolve(root, "knowledge/workflows/bridges");
await mkdir(resolve(moduleDirectory, "artifacts"), { recursive: true });
for (const [name, value] of [
  ["ntt-transfer-source.json", sourceArtifact],
  ["ntt-current-2026-09-13.json", capture],
  ["ntt-attestations-2026-09-13.json", attestations],
] as const)
  await writeFile(resolve(moduleDirectory, "artifacts", name), await formatted(value));
const sha = async (value: unknown) =>
  createHash("sha256")
    .update(await formatted(value))
    .digest("hex");
await writeFile(
  resolve(moduleDirectory, "evidence/ntt-transfer-2026-09-13.json"),
  json({
    schemaVersion: 1,
    kind: "ntt-transfer-qualification",
    id: "ntt-transfer-qualification-2026-09-13",
    owner: "workflows/bridges",
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    verifiedAt: capture.at,
    reviewAfter: null,
    scope: {
      canonicalNetworkIds: ["mezo-mainnet", "ethereum-mainnet", "base-mainnet"],
      assetIds: ["musd"],
      sourceCommit: commit,
    },
    sourceReference: { moduleId: "workflows/bridges", resourceId: "ntt-transfer-source" },
    sourceSha256: await sha(sourceArtifact),
    captureReference: { moduleId: "workflows/bridges", resourceId: "ntt-current-2026-09-13" },
    captureSha256: await sha(capture),
    attestationReference: {
      moduleId: "workflows/bridges",
      resourceId: "ntt-attestations-2026-09-13",
    },
    attestationSha256: await sha(attestations),
    attestationFormat: {
      url: "https://wormhole.com/docs/protocol/infrastructure/vaas/",
      checkedAt: "2026-09-13",
      scope:
        "Version-1 header/signature/body layout only; guardian validity requires deployed verification.",
    },
    limitations: [
      "Pinned observations and source, not live availability or a fee quote. Current preparation must re-read both chains and compare the registered runtimes.",
      "The retained manager TypeChain TransferSent event discrepancy is unchanged. Source intent uses the separately verified transceiver message, not TransferSent decoding.",
      "The manager view fee quote indexes an enabled-length array by registered index; the retained configurations have one enabled transceiver at index one. The transfer path uses the registered count. Direct enabled-transceiver quotes require exact source-call simulation.",
      "MUSD amounts with trimming dust revert. Outbound queues already custody or burn tokens; recovery must not transfer the source amount again.",
      "Source/built/fork qualification and qualified release review are separate. No route, relayer SLA, writer support or live value-bearing test is accepted by this record.",
    ],
  }),
);
