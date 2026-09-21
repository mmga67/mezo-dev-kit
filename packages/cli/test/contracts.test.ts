import { describe, expect, test } from "vitest";
import {
  bundleDigest,
  digest,
  parseBundle,
  parseConfig,
  parseLock,
  safePath,
} from "../src/contracts.ts";
import { config, fixtureBundle } from "./fixtures.ts";

describe("configuration and ownership", () => {
  test("accepts selected and complete reference modes", () => {
    expect(parseConfig(config)).toEqual(config);
    expect(parseConfig({ ...config, references: { mode: "all" } }).references.mode).toBe("all");
  });
  test.for([
    { ...config, formatVersion: 2 },
    { ...config, unknown: true },
    { ...config, domains: [] },
    { ...config, domains: ["typescript", "typescript"] },
    { ...config, skillsDirectory: "src" },
    { ...config, references: { mode: "latest" } },
  ])("rejects unsupported or ambiguous config", (value) => {
    expect(() => parseConfig(value)).toThrowError();
  });
  test.for(["../AGENTS.md", "/tmp/file", "a/../b", "a//b", "a\\b", "C:/file", "./file", "a/\0b"])(
    "rejects escaping path %s",
    (path) => {
      expect(() => safePath(path)).toThrowError();
    },
  );
  test("a forged lock cannot claim application instructions", () => {
    expect(() =>
      parseLock({
        formatVersion: 1,
        bundleId: digest("bundle"),
        config,
        files: [{ path: "AGENTS.md", digest: digest("mine"), size: 4 }],
      }),
    ).toThrowError("application-owned");
  });
});
describe("immutable bundle identity", () => {
  test("verifies contents and preserves limitations", () => {
    expect(parseBundle(fixtureBundle())).toEqual(fixtureBundle());
  });
  test("distinguishes private snapshots with identical versions", () => {
    const first = fixtureBundle();
    const second = {
      ...first,
      packages: [
        {
          ...first.packages[0],
          name: "@mezo-dev-kit/synthetic",
          version: "0.0.0-private",
          manifestDigest: digest("manifest"),
          files: [{ path: "dist/index.js", digest: digest("second"), size: 6 }],
        },
      ],
    };
    expect(bundleDigest(first)).not.toBe(bundleDigest(second));
    expect(() => parseBundle(second)).toThrowError("digest");
  });
  test("rejects unresolved supporting records even with a recomputed digest", () => {
    const bundle = fixtureBundle();
    const resource = bundle.resources[0];
    if (!resource) throw new Error("fixture missing resource");
    const altered = { ...bundle, resources: [{ ...resource, requires: ["missing"] }] };
    expect(() => parseBundle({ ...altered, id: bundleDigest(altered) })).toThrowError("Unresolved");
  });
  test("rejects duplicate resource IDs", () => {
    const bundle = fixtureBundle();
    const doubled = { ...bundle, resources: [...bundle.resources, ...bundle.resources] };
    expect(() => parseBundle({ ...doubled, id: bundleDigest(doubled) })).toThrowError("Duplicate");
  });
});
