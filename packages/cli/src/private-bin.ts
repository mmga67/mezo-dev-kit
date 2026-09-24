import { fileURLToPath } from "node:url";
import { runTerminal } from "./entry.ts";

// This entrypoint is copied into the portable kit's console directory.
process.exitCode = await runTerminal(
  [
    "console",
    "--artifacts",
    fileURLToPath(new URL("../manifest.json", import.meta.url)),
    ...process.argv.slice(2),
  ],
  process.cwd(),
);
