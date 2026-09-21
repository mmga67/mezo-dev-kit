import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("../../packages/bridges/test/native-built.ts", import.meta.url))],
  { encoding: "utf8" },
);
if (result.error || result.status !== 0)
  throw new Error(`Native built integration failed: ${result.stderr}\n${result.stdout}`, {
    cause: result.error,
  });
process.stdout.write(result.stdout);
