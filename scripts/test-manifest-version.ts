import assert from "node:assert/strict";

import { validateManifestVersion } from "./lib/manifest-version.ts";

const manifest = `# Mezo Development Kit — Manifest v2.1.0

**Released:** 2026-08-23

**Improvement log:** [\`manifest-changelog.md\`](./manifest-changelog.md)
`;
const log = `# Manifest improvement log

## 2.1.0 — 2026-08-23

- Added a capability.

## 2.0.0 — 2026-08-22

- Changed the constitution.
`;

assert.deepEqual(validateManifestVersion(manifest, log), {
  version: "2.1.0",
  released: "2026-08-23",
  entries: 2,
});
assert.throws(
  () => validateManifestVersion(manifest.replace("v2.1.0", "v2.1"), log),
  /semantic version/,
);
assert.throws(() => validateManifestVersion(manifest, log.replace("2.1.0", "2.1.1")), /must match/);
assert.throws(
  () => validateManifestVersion(manifest, log.replace("## 2.0.0", "## 2.2.0")),
  /newest first/,
);

process.stdout.write("Manifest version validation tests passed.\n");
