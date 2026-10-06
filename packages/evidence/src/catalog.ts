import type { EvidenceCapabilities } from "./types.ts";
import { EVIDENCE_INPUTS } from "./inputs.generated.ts";
import { freeze } from "./validation.ts";

/** Offline capabilities, including known omissions. No endpoint is selected or probed. */
export function evidenceCapabilities(): EvidenceCapabilities {
  return freeze({
    formatVersion: 1 as const,
    recipeRevision: EVIDENCE_INPUTS.revision,
    inputDigest: EVIDENCE_INPUTS.inputDigest,
    inputs: EVIDENCE_INPUTS.inputs,
    maxConcurrency: 1 as const,
    recipes: [
      { id: "network.identity" as const, networkIds: EVIDENCE_INPUTS.networks.map((n) => n.id) },
      {
        id: "runtime.current" as const,
        networkIds: EVIDENCE_INPUTS.networks
          .filter((n) => n.runtimeContracts.length > 0)
          .map((n) => n.id),
      },
      { id: "price.skip" as const, networkIds: ["mezo-mainnet"] },
      { id: "incentives.configuration" as const, networkIds: ["mezo-mainnet"] },
    ],
    networks: EVIDENCE_INPUTS.networks,
    incentiveFields: EVIDENCE_INPUTS.incentives.claims.map(
      ({ id, contractId, classification, unit, supported, interpretation }) => ({
        id,
        contractId,
        classification,
        unit,
        supported,
        interpretation,
      }),
    ),
    incentiveBaseline: EVIDENCE_INPUTS.incentives.baselineCoordinate,
    limitations: [
      "Private candidate; qualified review and browser qualification remain release gates.",
      "Runtime coverage is limited to generated public Contracts runtime expectations; omitted registrations are listed explicitly.",
      "Current observations do not reproduce source, prove upgrade history, refresh canonical review dates or establish writer support.",
      "Skip is a mainnet direct source; Pyth, testnet prices and protocol-oracle recipes are not implemented.",
      "Incentives compares selected configuration and state fields with a retained baseline; it does not establish governance authorization, formulas, emissions, or universal mechanics. Unsupported string getters remain visible.",
    ],
  });
}
