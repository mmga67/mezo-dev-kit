import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import {
  browserImage,
  planBrowserContainer,
  withBrowserContainer,
} from "../lib/browser-container.ts";
import { object, parseJson, text } from "../lib/json.ts";

const root = resolve(import.meta.dirname, "../..");
const exec = promisify(execFile);
const cancellation = new AbortController();
const interrupt = () => {
  cancellation.abort(new Error("Browser qualification interrupted"));
};

async function waitForServer(endpoint: string): Promise<void> {
  const url = new URL(endpoint);
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    cancellation.signal.throwIfAborted();
    const ready = await new Promise<boolean>((resolveReady) => {
      const socket = createConnection({ host: url.hostname, port: Number(url.port) });
      const finish = (connected: boolean) => {
        socket.destroy();
        resolveReady(connected);
      };
      socket.setTimeout(1000, () => {
        finish(false);
      });
      socket.once("connect", () => {
        finish(true);
      });
      socket.once("error", () => {
        finish(false);
      });
    });
    if (ready) return;
    await delay(100, undefined, { signal: cancellation.signal });
  }
  throw new Error("The container browser server did not become ready within 30 seconds");
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Usage: pnpm test:browser:container");
  const manifest = object(
    parseJson(await readFile(resolve(root, "package.json"), "utf8"), "package"),
    "package",
  );
  const version = text(
    object(manifest.devDependencies, "devDependencies").playwright,
    "playwright",
  );
  const require = createRequire(import.meta.url);
  const driverManifest = createRequire(require.resolve("playwright/package.json")).resolve(
    "playwright-core/package.json",
  );
  const installed = object(parseJson(await readFile(driverManifest, "utf8"), "driver"), "driver");
  const plan = planBrowserContainer(
    version,
    text(installed.version, "driver version"),
    await realpath(dirname(driverManifest)),
    randomUUID(),
  );
  process.stdout.write(
    `Optional browser qualification using ${browserImage}\nContainer: ${plan.name}\n`,
  );
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    await withBrowserContainer(
      plan,
      async (args) => {
        // Let Docker finish each bounded operation so cleanup can account for a created container.
        const result = await exec("docker", [...args], {
          cwd: root,
          timeout: 600_000,
          maxBuffer: 4 * 1024 * 1024,
        });
        return result.stdout;
      },
      async (endpoint) => {
        await waitForServer(endpoint);
        cancellation.signal.throwIfAborted();
        await new Promise<void>((resolveTest, rejectTest) => {
          const child = spawn("pnpm", ["test:browser"], {
            cwd: root,
            stdio: "inherit",
            signal: cancellation.signal,
            env: { ...process.env, MDK_BROWSER_WS_ENDPOINT: endpoint },
          });
          child.once("error", rejectTest);
          child.once("exit", (code, signal) => {
            if (code === 0) resolveTest();
            else
              rejectTest(new Error(`Browser suite failed (${signal ?? code ?? "unknown exit"})`));
          });
        });
      },
    );
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
