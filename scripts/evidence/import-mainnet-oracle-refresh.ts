import { resolve } from "node:path";
import { oraclePromotionCommand } from "./oracle-promotion.ts";

await oraclePromotionCommand(resolve(import.meta.dirname, "../.."), process.argv.slice(2));
