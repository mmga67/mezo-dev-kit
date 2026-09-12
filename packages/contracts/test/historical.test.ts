import { describe, expect, expectTypeOf, test } from "vitest";
import {
  resolveContract,
  resolveHistoricalContractEvidence,
  resolveOperation,
  resolveRuntimeIdentity,
} from "../src/index.ts";
import type { HistoricalContractEvidence, ResolvedContract } from "../src/index.ts";
import { HISTORICAL_CONTRACT_EVIDENCE } from "../src/historical.generated.ts";
import { resolveHistoricalEvidenceFromData } from "../src/historical.ts";
const eth = {
  contractId: "bridge.native-mezo-bridge",
  networkId: "ethereum-mainnet",
  blockNumber: 25094211n,
} as const;
describe("explicit historical evidence", () => {
  test("returns the old full calldata interface and a separate read surface at its observed hash", () => {
    const r = resolveHistoricalContractEvidence(eth);
    expect(r.kind).toBe("historical-contract-evidence");
    expect(r.coordinate.blockNumber).toBe(eth.blockNumber);
    expect(r.coverage).toEqual({
      fromBlock: eth.blockNumber,
      untilExclusiveBlock: eth.blockNumber + 1n,
    });
    expect(
      r.readAbi.every(
        (e) => e.type === "event" || e.stateMutability === "view" || e.stateMutability === "pure",
      ),
    ).toBe(true);
    expect(
      r.calldataAbi.some((e) => e.name === "bridgeERC20" && e.stateMutability === "nonpayable"),
    ).toBe(true);
    expect(r.readAbi.some((e) => e.name === "WithdrawalFailed")).toBe(false);
    expect(r.evidence.reviewStatus).toBe("pending-qualified-review");
    expect(Object.isFrozen(r.readAbi[0])).toBe(true);
    expectTypeOf<HistoricalContractEvidence>().not.toExtend<ResolvedContract>();
  });
  test.for([25094210n, 25094212n, 25435730n, 0n])(
    "rejects the unobserved block %s even inside a known implementation interval",
    (blockNumber) => {
      expect(() => resolveHistoricalContractEvidence({ ...eth, blockNumber })).toThrowError(
        expect.objectContaining({ code: "HistoricalEvidenceUnavailable" }),
      );
    },
  );
  test("keeps logical identities scoped to networks", () => {
    expect(() =>
      resolveHistoricalContractEvidence({ ...eth, networkId: "mezo-mainnet" }),
    ).toThrowError(expect.objectContaining({ code: "HistoricalEvidenceUnavailable" }));
  });
  test("preserves current generation and writer guards", () => {
    expect(() => resolveContract(eth)).toThrowError(
      expect.objectContaining({ code: "HistoricalGenerationUnsupported" }),
    );
    const mezo = {
      contractId: "bridge.native-assets-precompile",
      networkId: "mezo-mainnet",
      blockNumber: 8944561n,
    } as const;
    expect(resolveHistoricalContractEvidence(mezo).runtime.executionVersion).toBe(5);
    expect(() => resolveContract(mezo)).toThrowError(
      expect.objectContaining({ code: "MissingDeployment" }),
    );
    const current = resolveContract({ ...mezo, blockNumber: 11358000n });
    expect(() => resolveOperation({ ...current, functionName: "bridgeOut" })).toThrowError(
      expect.objectContaining({ code: "AbiUnavailable" }),
    );
    expect(() => resolveRuntimeIdentity(current)).toThrow();
  });
  test("rejects overlapping coverage and changed lifecycle without choosing a preferred row", () => {
    const row = HISTORICAL_CONTRACT_EVIDENCE[0];
    expect(() => resolveHistoricalEvidenceFromData(eth, [row, row])).toThrowError(
      expect.objectContaining({ code: "OverlappingDeployments" }),
    );
    expect(() =>
      resolveHistoricalEvidenceFromData(eth, [{ ...row, reviewStatus: "rejected" }]),
    ).toThrowError(expect.objectContaining({ code: "UnsupportedDeploymentState" }));
  });
});
