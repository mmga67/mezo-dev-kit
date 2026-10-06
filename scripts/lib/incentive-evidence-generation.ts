import { loadKnowledgeReference } from "./knowledge-reference.ts";
import { object, objects, text } from "./json.ts";
import {
  isContractId,
  resolveContract,
  resolveRuntimeIdentity,
} from "../../packages/contracts/src/index.ts";
import {
  createAbiCodec,
  parseAddress,
  parseUint,
  parseUnsignedInteger,
} from "../../packages/evm/src/index.ts";

/** Project the bounded domain catalog, checking each exact getter against the public Contracts ABI. */
export async function incentiveEvidenceInputs(root: string): Promise<{
  networkId: string;
  baselineCoordinate: { blockNumber: string; blockHash: string; blockTimestamp: string };
  runtimes: {
    contractId: string;
    expected: {
      address: string;
      addressCodeSha256: string;
      implementationAddress: string | null;
      implementationCodeSha256: string | null;
      implementationSlotValue: string | null;
    };
  }[];
  claims: {
    id: string;
    contractId: string;
    classification: "configuration" | "state" | "metadata";
    unit: "address" | "address-list" | "seconds" | "count" | "base-units" | "text";
    signature: string | null;
    slot: string | null;
    abi: unknown;
    supported: boolean;
    expected: string | readonly string[] | null;
    sourceRefs: string[];
    interpretation: string;
  }[];
}> {
  const load = async (resourceId: string) =>
    object(
      (await loadKnowledgeReference(root, { moduleId: "protocols/incentives", resourceId })).value,
      resourceId,
    );
  const catalog = await load("incentives-configuration-observations");
  const baselineResourceId = text(
    object(catalog.baselineReference, "baseline reference").resourceId,
    "baseline resource ID",
  );
  const baseline = await load(baselineResourceId);
  const roles = objects((await load("incentives-contract-roles")).records, "roles");
  const observations = objects(baseline.observations, "observations");
  const topology = objects((await load("incentives-mainnet-topology")).contracts, "topology");
  const coordinate = object(baseline.coordinate, "coordinate");
  const blockNumber = parseUint(parseUnsignedInteger(coordinate.blockNumber));
  const codec = createAbiCodec();
  const claims = objects(catalog.records, "claims").map<
    Awaited<ReturnType<typeof incentiveEvidenceInputs>>["claims"][number]
  >((claim) => {
    const pointer = text(claim.baselinePointer, "pointer");
    if (!/^\/observations\/(0|[1-9][0-9]*)$/.test(pointer))
      throw new Error("Invalid baseline pointer");
    const observation = observations[Number(pointer.split("/")[2])];
    const role = roles.find((r) => r.id === claim.roleId);
    if (!observation || observation.role !== claim.roleId || !role)
      throw new Error("Claim role mismatch");
    const contractId = object(role.abiReference, "ABI reference").recordId;
    if (!isContractId(contractId)) throw new Error("Unknown incentives contract");
    const contract = resolveContract({ networkId: "mezo-mainnet", contractId, blockNumber });
    if (contract.address !== observation.address)
      throw new Error("Baseline address differs from Contracts owner");
    const signature =
      observation.signature === undefined ? null : text(observation.signature, "signature");
    const slot = observation.slot === undefined ? null : text(observation.slot, "slot");
    if (slot !== null) {
      const owner = topology.find((t) => t.role === claim.roleId);
      if (
        !owner ||
        object(
          object(owner.storageObservations, "storage observations")[
            text(observation.name, "storage field")
          ],
          "storage field",
        ).slot !== slot
      )
        throw new Error("Storage claim differs from source-derived topology");
    }
    const abi =
      signature === null
        ? null
        : contract.readAbi.find(
            (a) =>
              a.type === "function" &&
              a.name === signature.slice(0, -2) &&
              Array.isArray(a.inputs) &&
              a.inputs.length === 0,
          );
    if (signature !== null && !abi) throw new Error(`Missing exact canonical getter: ${signature}`);
    let supported = true;
    if (abi) {
      try {
        codec.encodeFunction(abi);
      } catch {
        supported = false;
      }
    }
    if ((signature === null) === (slot === null)) throw new Error("Ambiguous claim method");
    const classification = claim.classification;
    if (
      classification !== "configuration" &&
      classification !== "state" &&
      classification !== "metadata"
    )
      throw new Error("Unknown claim classification");
    const unit = claim.unit;
    if (
      unit !== "address" &&
      unit !== "address-list" &&
      unit !== "seconds" &&
      unit !== "count" &&
      unit !== "base-units" &&
      unit !== "text"
    )
      throw new Error("Unknown field unit");
    const observed = observation.observed;
    const expected = !supported
      ? null
      : slot !== null
        ? parseUint(BigInt(text(observed, "storage value"))).toString()
        : unit === "address"
          ? parseAddress(observed)
          : unit === "address-list"
            ? Array.isArray(observed)
              ? observed.map((v: unknown) => parseAddress(v))
              : (() => {
                  throw new Error("Expected address list");
                })()
            : parseUint(parseUnsignedInteger(observed)).toString();
    return {
      id: text(claim.id, "id"),
      contractId,
      classification,
      unit,
      signature,
      slot,
      abi: abi ?? null,
      supported,
      expected,
      sourceRefs: [
        "protocols/incentives:incentives-configuration-observations",
        `protocols/incentives:${baselineResourceId}`,
        "contracts:contract-abis",
      ],
      interpretation: text(claim.interpretation, "interpretation"),
    };
  });
  if (
    new Set(claims.map((c) => c.id)).size !== claims.length ||
    claims.length !== observations.length
  )
    throw new Error("Incomplete or duplicate incentive coverage");
  return {
    networkId: "mezo-mainnet",
    runtimes: [...new Set(claims.map((c) => c.contractId))].map((contractId) => {
      if (!isContractId(contractId)) throw new Error("Unknown baseline contract");
      const contract = resolveContract({ networkId: "mezo-mainnet", contractId, blockNumber });
      const identity = resolveRuntimeIdentity({
        networkId: "mezo-mainnet",
        contractId,
        blockNumber,
      });
      return {
        contractId,
        expected: {
          address: contract.address,
          addressCodeSha256: identity.addressCodeSha256,
          implementationAddress:
            identity.implementationSlot === null ? null : contract.implementationAddress,
          implementationCodeSha256: identity.implementationCodeSha256,
          implementationSlotValue:
            identity.implementationSlot === null || contract.implementationAddress === null
              ? null
              : `0x${"0".repeat(24)}${contract.implementationAddress.slice(2)}`,
        },
      };
    }),
    baselineCoordinate: {
      blockNumber: text(coordinate.blockNumber, "blockNumber"),
      blockHash: text(coordinate.blockHash, "blockHash"),
      blockTimestamp: text(coordinate.blockTimestamp, "blockTimestamp"),
    },
    claims,
  };
}
