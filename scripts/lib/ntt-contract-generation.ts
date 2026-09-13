import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text, values } from "./json.ts";

/** Ordinary NTT functions only. Administrative and transceiver-only entrypoints stay absent. */
export async function generateNttContractInterfaces(
  root: string,
): Promise<{ digest: string; records: readonly Record<string, unknown>[] }> {
  const digest = createHash("sha256");
  async function load(resourceId: string) {
    const loaded = await loadKnowledgeReference(root, { moduleId: "contracts", resourceId });
    digest.update(await readFile(loaded.path));
    return loaded.document;
  }
  const deployments = objects(
    object(await load("contract-deployments"), "deployments").records,
    "records",
  );
  const records = [];
  for (const contractId of ["bridge.musd-ntt-manager", "bridge.musd-wormhole-transceiver"]) {
    const abi = objects(await load(`abi.${contractId}`), "ABI");
    const names =
      contractId === "bridge.musd-ntt-manager"
        ? [
            "transfer",
            "completeOutboundQueuedTransfer",
            "cancelOutboundQueuedTransfer",
            "completeInboundQueuedTransfer",
            "executeMsg",
          ]
        : ["receiveMessage"];
    const operationAbi = abi.filter(
      (e) =>
        e.type === "function" &&
        names.includes(text(e.name, "name")) &&
        (e.name !== "transfer" || values(e.inputs, "inputs").length === 6),
    );
    if (operationAbi.length !== names.length) throw new Error("NTT ordinary operation ABI changed");
    for (const networkId of ["mezo-mainnet", "ethereum-mainnet", "base-mainnet"]) {
      const deployment = deployments.find((d) => d.id === `${contractId}@${networkId}`);
      if (
        deployment?.status !== "verified-current" ||
        deployment.supportStatus !== "supported" ||
        deployment.reviewStatus !== "accepted" ||
        deployment.provenanceClass !== "official-deployment-repository-live-configuration"
      )
        throw new Error("NTT deployment lifecycle changed");
      const runtime = object(deployment.runtime, "runtime");
      records.push({
        networkId,
        contractId,
        operationAbi,
        runtime: {
          addressCodeSha256: text(runtime.addressCodeSha256, "proxy hash"),
          implementationCodeSha256: text(runtime.implementationCodeSha256, "implementation hash"),
          implementationSlot: text(object(deployment.proxy, "proxy").implementationSlot, "slot"),
        },
      });
    }
  }
  return { digest: digest.digest("hex"), records };
}
