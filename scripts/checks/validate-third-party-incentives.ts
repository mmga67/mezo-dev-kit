import { fileURLToPath } from "node:url";
import { validateThirdPartyIncentives } from "../lib/third-party-incentives.ts";

if (process.argv.length > 2) throw new Error("usage: validate-third-party-incentives.ts");
await validateThirdPartyIncentives(fileURLToPath(new URL("../../", import.meta.url)));
process.stdout.write(
  "Third-party voting source, ABI, graph, weights, documentation scope and boundary fixtures validated; remote settlement remains unverified.\n",
);
