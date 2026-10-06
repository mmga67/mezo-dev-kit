import { expect, test } from "vitest";
import {
  browserContainerEndpoint,
  browserImage,
  planBrowserContainer,
  withBrowserContainer,
} from "../lib/browser-container.ts";

const token = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const plan = planBrowserContainer("1.63.0", "1.63.0", "/tools/playwright-core", token);

test("browser container pins the image and exposes only a read-only driver and loopback port", () => {
  expect(browserImage).toMatch(/@sha256:[a-f0-9]{64}$/);
  expect(plan.args).toEqual(
    expect.arrayContaining([
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "127.0.0.1::3000",
      "pwuser",
      'type=bind,"source=/tools/playwright-core",target=/opt/playwright,readonly',
    ]),
  );
  expect(plan.args.filter((arg) => arg === "--mount")).toHaveLength(1);
  for (const flag of ["--privileged", "--network=host", "--unsafe"])
    expect(plan.args).not.toContain(flag);
});

test("version drift requires a reviewed image update before starting Docker", () => {
  expect(() => planBrowserContainer("1.63.0", "1.62.0", "/driver", token)).toThrow("root-pinned");
  expect(() => planBrowserContainer("1.64.0", "1.64.0", "/driver", token)).toThrow("image pin");
});

test("driver paths with spaces and CSV delimiters remain one read-only Docker mount", () => {
  const unusual = planBrowserContainer("1.63.0", "1.63.0", '/tools/a, b"c', token);
  expect(unusual.args[unusual.args.indexOf("--mount") + 1]).toBe(
    'type=bind,"source=/tools/a, b""c",target=/opt/playwright,readonly',
  );
});

test.for(["0.0.0.0:1234", "127.0.0.1:0", "127.0.0.1:65536", "127.0.0.1:1234\n[::]:1234"])(
  "browser control rejects an unsafe or ambiguous port mapping: %s",
  (port) => {
    expect(() => browserContainerEndpoint(port, plan.endpointPath)).toThrow("loopback-only");
  },
);

test.for(["success", "startup", "port", "qualification"])(
  "%s path removes only this invocation's browser container",
  async (scenario) => {
    const mutableCalls: string[][] = [];
    const docker = async (args: readonly string[]) => {
      mutableCalls.push([...args]);
      if (args[0] === "run" && scenario === "startup") throw new Error("startup failed");
      if (args[0] === "port") {
        if (scenario === "port") throw new Error("port failed");
        return "127.0.0.1:32100\n";
      }
      if (args[0] === "container") return `${plan.name}\n`;
      return "";
    };
    const qualification = withBrowserContainer(plan, docker, async (endpoint) => {
      expect(endpoint).toBe(`ws://127.0.0.1:32100/${token}`);
      if (scenario === "qualification") throw new Error("qualification failed");
    });
    if (scenario === "success") await qualification;
    else await expect(qualification).rejects.toThrow(`${scenario} failed`);
    expect(mutableCalls.at(-1)).toEqual(["rm", "--force", plan.name]);
    expect(mutableCalls.filter((call) => call[0] === "rm")).toHaveLength(1);
  },
);

test("an unavailable Docker daemon does not run qualification or attempt removal", async () => {
  const calls: string[][] = [];
  await expect(
    withBrowserContainer(
      plan,
      async (args) => {
        calls.push([...args]);
        throw new Error("Docker unavailable");
      },
      async () => {
        throw new Error("must not run");
      },
    ),
  ).rejects.toThrow("Docker unavailable");
  expect(calls).toEqual([["version", "--format", "{{.Server.Version}}"]]);
});
