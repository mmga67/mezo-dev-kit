import { bundleDigest, digest } from "../src/contracts.ts";
import type { ProjectConfig, ReferenceBundle } from "../src/contracts.ts";

export const config: ProjectConfig = {
  formatVersion: 1,
  domains: ["typescript"],
  skillsDirectory: ".agents/skills",
  references: { mode: "selected" },
};
export function fixtureBundle(): ReferenceBundle {
  const base: Omit<ReferenceBundle, "id"> = {
    formatVersion: 1,
    source: { revision: "a".repeat(40), inputsDigest: digest("source") },
    packages: [
      {
        name: "@mezo-dev-kit/synthetic",
        version: "0.0.0-private",
        manifestDigest: digest("manifest"),
        files: [{ path: "dist/index.js", digest: digest("first"), size: 5 }],
      },
    ],
    domains: [{ id: "typescript", packages: [], resources: ["guide:synthetic"] }],
    skills: [],
    template: { path: "APP_AGENTS.md", digest: digest("# Application\n"), size: 14 },
    starter: [],
    resources: [
      {
        id: "guide:synthetic",
        title: "Synthetic guidance",
        searchTerms: ["synthetic"],
        path: "references/synthetic.md",
        digest: digest("guide"),
        size: 5,
        sourcePath: "docs/synthetic.md",
        sourceDigest: digest("guide"),
        domains: ["typescript"],
        requires: [],
        kind: "guide",
        moduleId: null,
        resourceId: null,
        recordIds: [],
        reviewAfter: null,
        limitations: ["Synthetic test content"],
      },
    ],
    exclusions: [],
    remoteBase: null,
  };
  return { ...base, id: bundleDigest(base) };
}
