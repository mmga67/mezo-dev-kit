import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text } from "./json.ts";

/** Project only ordinary Native source calls from the accepted current deployments. */
export async function generateNativeContractInterfaces(
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
  for (const [contractId, networkId, functionName, inputs, provenanceClass] of [
    [
      "bridge.native-assets-precompile",
      "mezo-mainnet",
      "bridgeOut",
      ["address", "uint256", "uint8", "bytes"],
      "official-client-precompile-source",
    ],
    [
      "bridge.native-mezo-bridge",
      "ethereum-mainnet",
      "bridgeERC20",
      ["address", "uint256", "address"],
      "deployed-executable-reproduction",
    ],
  ] as const) {
    const matches = deployments.filter(
      (d) =>
        d.contractId === contractId && d.networkId === networkId && d.status === "verified-current",
    );
    const deployment = matches[0];
    if (
      matches.length !== 1 ||
      deployment?.supportStatus !== "supported" ||
      deployment.reviewStatus !== "accepted" ||
      deployment.provenanceClass !== provenanceClass
    )
      throw new Error("Native deployment lifecycle changed");
    const abi = objects(await load(`abi.${contractId}`), "ABI");
    const operationAbi = abi.filter(
      (entry) => entry.type === "function" && entry.name === functionName,
    );
    const operation = operationAbi[0];
    if (
      operationAbi.length !== 1 ||
      operation?.stateMutability !== "nonpayable" ||
      JSON.stringify(objects(operation.outputs, "outputs").map((p) => text(p.type, "type"))) !==
        JSON.stringify(functionName === "bridgeOut" ? ["bool"] : []) ||
      JSON.stringify(objects(operation.inputs, "inputs").map((p) => text(p.type, "type"))) !==
        JSON.stringify(inputs)
    )
      throw new Error("Native ordinary source interface changed");
    const runtime = object(deployment.runtime, "runtime");
    const proxy = deployment.proxy === null ? null : object(deployment.proxy, "proxy");
    records.push({
      deploymentId: text(deployment.id, "deployment"),
      networkId,
      contractId,
      operationAbi,
      calldataAbi: abi.filter(
        (entry) =>
          entry.type === "function" &&
          [functionName, ...(networkId === "mezo-mainnet" ? ["bridge"] : [])].includes(
            text(entry.name, "name"),
          ),
      ),
      runtime: {
        addressCodeSha256: text(runtime.addressCodeSha256, "address runtime"),
        implementationCodeSha256:
          proxy === null ? null : text(runtime.implementationCodeSha256, "implementation runtime"),
        implementationSlot: proxy === null ? null : text(proxy.implementationSlot, "slot"),
      },
    });
  }
  return { digest: digest.digest("hex"), records };
}
