import assert from "node:assert/strict";
import * as recipes from "../../dist/index.js";

for (const recipe of Object.values(recipes)) assert.equal(typeof recipe, "function");
assert(Object.keys(recipes).includes("borrowMusd"));
process.stdout.write("Built recipe entrypoints imported without executing a workflow.\n");
