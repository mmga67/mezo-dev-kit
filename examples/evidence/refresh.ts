import {
  createEvidenceHttpRequest,
  evidenceCapabilities,
  parseEvidenceRequest,
  refreshEvidence,
} from "@mezo-dev-kit/evidence";
import type { EvidenceProgress, EvidenceReport } from "@mezo-dev-kit/evidence";

/** Bind this function to your form's submit action. Nothing runs when this file is imported. */
export async function captureEvidence(input: {
  readonly request: unknown;
  readonly rpcUrl: string;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => bigint;
  readonly signal: AbortSignal;
  readonly showProgress: (progress: EvidenceProgress) => void;
}): Promise<Readonly<{ report: EvidenceReport; downloadJson: string }>> {
  // Form values are untrusted. Validate the selected recipe, network and explicit limits
  // before contacting RPC. Build your selectors from evidenceCapabilities().
  const request = parseEvidenceRequest(input.request);
  const report = await refreshEvidence(request, {
    request: createEvidenceHttpRequest({ url: input.rpcUrl, fetch: input.fetch }),
    now: input.now,
    signal: input.signal, // Pass an AbortController's signal; bind its abort() to Cancel.
    onProgress: input.showProgress,
  });
  // Display status, anchorIntegrity, freshness and each observation, including failures.
  // "Complete" means collection finished; it does not mean the evidence was accepted.
  // Your UI owns downloading this JSON or storing it. This helper writes no files.
  return Object.freeze({ report, downloadJson: JSON.stringify(report, null, 2) });
}

/** Call during form setup. Discovery is offline and does not select a provider for you. */
export const availableEvidenceRecipes = evidenceCapabilities;

/** Select this object in the same capture form to inspect one incentive root without a wallet. */
export const incentiveConfigurationSelection = {
  networkId: "mezo-mainnet",
  recipe: "incentives.configuration",
  contractIds: ["incentives.boost-voter"],
} as const;
