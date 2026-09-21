import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { object, objects, parseJson } from "../lib/json.ts";
import { loadKnowledgeReference } from "../lib/knowledge-reference.ts";
import {
  validateThirdPartyIncentives,
  validateThirdPartyModel,
  validateThirdPartySnapshot,
} from "../lib/third-party-incentives.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const reference = (moduleId: string, resourceId: string) => ({ moduleId, resourceId });
const modelReference = reference("protocols/incentives", "incentives-third-party-voting-rewards");
const evidenceReference = reference("protocols/incentives", "incentives-third-party-mainnet");

test("retained source, fixed-block state and direct-vote boundary fixtures agree", async () => {
  await validateThirdPartyIncentives(root);
});

test.for([
  "wrong chain",
  "missing gauge",
  "duplicate gauge",
  "unknown liveness",
  "invented delivery",
] as const)("rejects a snapshot with %s", async (kind) => {
  const evidence = object(
    structuredClone((await loadKnowledgeReference(root, evidenceReference)).value),
    "evidence",
  );
  const gauges = objects(evidence.gauges, "gauges");
  const first = gauges[0],
    second = gauges[1];
  if (!first || !second) throw new Error("missing gauge fixtures");
  if (kind === "wrong chain") object(evidence.networkSnapshot, "snapshot").chainId = "1";
  if (kind === "missing gauge") evidence.gauges = gauges.slice(1);
  if (kind === "duplicate gauge") second.address = first.address;
  if (kind === "unknown liveness") first.alive = null;
  if (kind === "invented delivery") object(evidence.settlement, "settlement").status = "completed";
  expect(() => {
    validateThirdPartySnapshot(evidence);
  }).toThrow(
    /network identity|incomplete gauge|duplicate gauge|liveness missing|remain unverified/,
  );
});

test.for([
  "veBTC substitution",
  "Aerodrome LP paid MEZO",
  "liquid Merkl reward",
  "documentation promoted",
  "conflict dropped",
  "writer enabled",
] as const)("rejects %s in the remote-incentives model", async (kind) => {
  const model = object(
    structuredClone((await loadKnowledgeReference(root, modelReference)).value),
    "model",
  );
  const destinations = objects(model.destinations, "destinations");
  const aerodrome = destinations.find((row) => row.mechanism === "aerodrome-voting-incentive");
  const merkl = destinations.find((row) => row.mechanism === "merkl-campaign");
  if (!aerodrome || !merkl) throw new Error("missing mechanism fixtures");
  if (kind === "veBTC substitution") object(model.voting, "voting").asset = "veBTC";
  if (kind === "Aerodrome LP paid MEZO") aerodrome.lpReward = "MEZO";
  if (kind === "liquid Merkl reward") merkl.directReward = "MEZO";
  if (kind === "documentation promoted") merkl.distributionStatus = "verified";
  if (kind === "conflict dropped") model.conflicts = [];
  if (kind === "writer enabled") model.supportStatus = "supported";
  expect(() => {
    validateThirdPartyModel(model);
  }).toThrow(
    /wrong voting domain|reward branches|Merkl recipient|settled delivery|conflict lost|operation support/,
  );
});

test.for(["source bytes", "recorded weight", "verification label", "destination binding"] as const)(
  "rejects changed %s against retained evidence",
  async (kind) => {
    const scratch = await mkdtemp(join(tmpdir(), "mdk-third-party-evidence-"));
    try {
      const model = object((await loadKnowledgeReference(root, modelReference)).value, "model");
      const evidence = object(
        (await loadKnowledgeReference(root, evidenceReference)).value,
        "evidence",
      );
      const sourceRecord = object(
        (await loadKnowledgeReference(root, reference("contracts", "third-party-voter-source")))
          .value,
        "source record",
      );
      const refs: unknown[] = [
        modelReference,
        evidenceReference,
        reference("contracts", "third-party-voter-source"),
        sourceRecord.artifactReference,
        sourceRecord.reproductionReference,
        sourceRecord.contractReference,
        sourceRecord.abiReference,
        reference("contracts", "voting-validator-source"),
        ...[
          "incentives-contract-roles",
          "incentives-third-party-sources",
          "incentives-validator-voting-rewards",
          "incentives-formula-fixtures",
          "incentives-third-party-voting-fixtures",
        ].map((id) => reference("protocols/incentives", id)),
        ...objects(evidence.artifacts, "artifacts").map((artifact) => artifact.reference),
        ...objects(model.destinations, "destinations").map(
          (destination) => destination.networkReference,
        ),
      ];
      const paths = new Set<string>();
      for (const ref of refs) {
        const loaded = await loadKnowledgeReference(root, ref);
        paths.add(loaded.indexPath);
        paths.add(loaded.path);
      }
      await Promise.all(
        [...paths].map(async (path) => {
          const target = join(scratch, relative(root, path));
          await mkdir(dirname(target), { recursive: true });
          await copyFile(path, target);
        }),
      );
      // The complete control proves the reduced fixture includes every dependency.
      await validateThirdPartyIncentives(scratch);
      if (kind === "source bytes") {
        const path = join(
          scratch,
          relative(root, (await loadKnowledgeReference(root, sourceRecord.artifactReference)).path),
        );
        await writeFile(path, (await readFile(path, "utf8")) + "\n");
      } else if (kind === "destination binding") {
        const path = join(
          scratch,
          relative(root, (await loadKnowledgeReference(root, modelReference)).path),
        );
        const altered = object(parseJson(await readFile(path, "utf8"), "model"), "model");
        const destinations = objects(altered.destinations, "destinations");
        const first = destinations[0],
          second = destinations[1];
        if (!first || !second) throw new Error("missing destination fixtures");
        [first.gaugeObservationReference, second.gaugeObservationReference] = [
          second.gaugeObservationReference,
          first.gaugeObservationReference,
        ];
        await writeFile(path, JSON.stringify(altered));
      } else {
        const path = join(
          scratch,
          relative(root, (await loadKnowledgeReference(root, evidenceReference)).path),
        );
        const altered = object(parseJson(await readFile(path, "utf8"), "evidence"), "evidence");
        const gauge = objects(altered.gauges, "gauges").find((row) => row.alive === true);
        if (!gauge) throw new Error("missing active gauge");
        if (kind === "recorded weight") gauge.weightRaw = "1";
        else gauge.explorerFullyVerified = true;
        await writeFile(path, JSON.stringify(altered));
      }
      await expect(validateThirdPartyIncentives(scratch)).rejects.toThrow(
        kind === "source bytes"
          ? /explorer capture changed/
          : kind === "recorded weight"
            ? /decoded gauge differs/
            : kind === "verification label"
              ? /verification labels differ/
              : /destination metadata binding differs/,
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
