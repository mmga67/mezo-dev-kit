/** Official multi-platform image; review its digest whenever root Playwright changes. */
export const browserImage =
  "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";

export interface BrowserContainerPlan {
  readonly name: string;
  readonly endpointPath: string;
  readonly args: readonly string[];
}

/** Expose only the installed, version-matched driver to the browser container. */
export function planBrowserContainer(
  version: string,
  installedVersion: string,
  driverDirectory: string,
  token: string,
): BrowserContainerPlan {
  if (
    installedVersion !== version ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !browserImage.startsWith(`mcr.microsoft.com/playwright:v${version}-noble@sha256:`)
  )
    throw new Error("Review the browser image pin and install the root-pinned Playwright version");
  if (!/^[a-f0-9-]{36}$/.test(token) || !driverDirectory || /[\r\n\0]/.test(driverDirectory))
    throw new Error("Invalid browser container input");
  const name = `mdk-browser-${token}`;
  const endpointPath = `/${token}`;
  const source = `"source=${driverDirectory.replaceAll('"', '""')}"`;
  return {
    name,
    endpointPath,
    args: [
      "run",
      "--detach",
      "--rm",
      "--init",
      "--name",
      name,
      "--user",
      "pwuser",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--shm-size=1g",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=1g",
      "--tmpfs",
      "/home/pwuser:rw,nosuid,nodev,mode=1777,size=256m",
      "--publish",
      "127.0.0.1::3000",
      "--mount",
      `type=bind,${source},target=/opt/playwright,readonly`,
      browserImage,
      "node",
      "/opt/playwright/cli.js",
      "run-server",
      "--host",
      "0.0.0.0",
      "--port",
      "3000",
      "--path",
      endpointPath,
      "--max-clients",
      "4",
    ],
  };
}

/** Refuse a port mapping that exposes the browser controller beyond loopback. */
export function browserContainerEndpoint(port: string, path: string): string {
  const match = /^127\.0\.0\.1:([0-9]+)$/.exec(port.trim());
  const number = Number(match?.[1]);
  if (!match || number < 1 || number > 65535 || !Number.isInteger(number))
    throw new Error("Expected one loopback-only Docker port mapping");
  return `ws://127.0.0.1:${number}${path}`;
}

export type DockerCommand = (args: readonly string[]) => Promise<string>;

/** Clean up even when startup, qualification or an ordinary interruption fails. */
export async function withBrowserContainer(
  plan: BrowserContainerPlan,
  docker: DockerCommand,
  qualify: (endpoint: string) => Promise<void>,
): Promise<void> {
  await docker(["version", "--format", "{{.Server.Version}}"]);
  const failures: unknown[] = [];
  try {
    await docker(plan.args);
    const port = await docker(["port", plan.name, "3000/tcp"]);
    await qualify(browserContainerEndpoint(port, plan.endpointPath));
  } catch (error) {
    failures.push(error);
  }
  try {
    // A failed start may still have created the uniquely named container.
    const existing = await docker([
      "container",
      "ls",
      "--all",
      "--filter",
      `name=^/${plan.name}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (existing.trim() === plan.name) await docker(["rm", "--force", plan.name]);
    else if (existing.trim()) throw new Error("Unexpected container cleanup target");
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Browser qualification and container cleanup both failed");
}
