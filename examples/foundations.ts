import { prepareAmount } from "./evm/amounts.ts";
import { networkChoices } from "./chains/select-network.ts";
import { inspectDeployment } from "./contracts/resolve-deployment.ts";
import { evaluatePrice } from "./prices/normalize.ts";
import { allocateRepayment } from "./institutional-debt/inspect-position.ts";
import { foundationConfig } from "./project-tooling/configure.ts";
import { printReport } from "./runtime/output.ts";

// Synthetic inputs demonstrate representation and policy. This program uses no RPC or wallet.
printReport("Exact token amount", prepareAmount(`0x${"11".repeat(20)}`, "12.345", 6));
printReport("Networks from the registry", networkChoices);
// Resolve metadata at an explicit example block; this does not inspect current deployed code.
const musd = inspectDeployment("musd.token", "mezo-mainnet", 12_000_000n);
printReport("MUSD deployment metadata", {
  address: musd.address,
  deploymentId: musd.deploymentId,
  readFunctions: musd.readAbi
    .filter((entry) => entry.type === "function")
    .map((entry) => entry.name),
});
printReport(
  "Price at the inclusive freshness boundary",
  evaluatePrice({
    amount: {
      raw: 12345n,
      exponent: -2,
      targetDecimals: 6,
      rounding: "floor",
      zeroAllowed: false,
      allowPrecisionLoss: false,
    },
    confidence: null,
    publishedAt: 1000n,
    asOf: 1060n,
    maxAgeSeconds: 60n,
  }),
);
// Tiny synthetic MUSD base-unit amounts make the fee-first allocation visible: 10 fees + 40 principal.
printReport(
  "Repayment allocation",
  allocateRepayment({ principal: 100n, totalFees: 10n, payment: 50n }),
);
printReport("Validated project configuration", foundationConfig);
