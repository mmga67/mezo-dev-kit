import { isContractId, resolveContract } from "@mezo-dev-kit/contracts";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import { EVIDENCE_INPUTS } from "./inputs.generated.ts";
import { EvidenceError } from "./types.ts";
import type { EvidenceObservation, EvidenceRequest, IncentiveEvidenceValue } from "./types.ts";

export function incentiveClaims(
  request: EvidenceRequest,
): readonly (typeof EVIDENCE_INPUTS.incentives.claims)[number][] {
  return request.recipe === "incentives.configuration"
    ? EVIDENCE_INPUTS.incentives.claims.filter((c) => request.contractIds.includes(c.contractId))
    : [];
}
export function plannedIncentives(request: EvidenceRequest): EvidenceObservation[] {
  return incentiveClaims(request).map((c) => ({
    id: `incentive:${c.id}`,
    unit: `incentive-${c.classification}`,
    status: "not-run",
    error: null,
    freshness: "not-evaluated",
    sourceRefs: c.sourceRefs,
    expected: c.expected === null ? null : { valueUnit: c.unit, value: c.expected },
    observed: null,
  }));
}
/** Read only after the selected contract's code/implementation identity matched at this coordinate. */
export async function readIncentiveField(
  id: string,
  request: EvidenceRequest,
  coordinate: ReadCoordinate,
  transport: RpcTransport,
): Promise<IncentiveEvidenceValue> {
  const claim = incentiveClaims(request).find((c) => `incentive:${c.id}` === id);
  if (!claim || !isContractId(claim.contractId)) throw new EvidenceError("unavailable");
  if (!claim.supported) throw new EvidenceError("unsupported-codec");
  const contract = resolveContract({
    contractId: claim.contractId,
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
  if (claim.slot !== null) {
    const slot = parseHash32(`0x${BigInt(claim.slot).toString(16).padStart(64, "0")}`);
    const value = parseUint(
      BigInt(await transport.getStorage(contract.address, slot, coordinate)),
    ).toString();
    return { valueUnit: claim.unit, value };
  }
  const codec = createAbiCodec();
  const abi = contract.readAbi.find(
    (a) =>
      a.type === "function" &&
      "name" in a &&
      typeof a.name === "string" &&
      `${a.name}()` === claim.signature &&
      Array.isArray(a.inputs) &&
      a.inputs.length === 0,
  );
  if (!abi || JSON.stringify(abi) !== JSON.stringify(claim.abi))
    throw new EvidenceError("unavailable");
  const data = codec.encodeFunction(abi);
  const raw = await transport.read({
    ...coordinate,
    contractId: claim.contractId,
    address: contract.address,
    data,
  });
  const [decoded] = codec.decodeFunction(abi, parseHexData(raw));
  if (claim.unit === "address") return { valueUnit: claim.unit, value: parseAddress(decoded) };
  if (claim.unit === "address-list") {
    if (!Array.isArray(decoded)) throw new EvidenceError("invalid-response");
    return { valueUnit: claim.unit, value: decoded.map((v: unknown) => parseAddress(v)) };
  }
  return { valueUnit: claim.unit, value: parseUint(decoded).toString() };
}
