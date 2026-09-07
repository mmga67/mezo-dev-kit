const headerPattern = /^# Mezo Development Kit — Manifest v(\d+\.\d+\.\d+)$/m;
const releasedPattern = /^\*\*Released:\*\* (\d{4}-\d{2}-\d{2})$/m;
const logEntryPattern = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/gm;

export interface ManifestVersionValidation {
  version: string;
  released: string;
  entries: number;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) {
      throw new Error("semantic versions must contain three numeric parts");
    }
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

export function validateManifestVersion(
  manifest: string,
  improvementLog: string,
): ManifestVersionValidation {
  const header = headerPattern.exec(manifest);
  if (!header) throw new Error("manifest header must contain a semantic version");

  const released = releasedPattern.exec(manifest);
  if (!released) throw new Error("manifest must declare a YYYY-MM-DD release date");
  if (!manifest.includes("[`manifest-changelog.md`](./manifest-changelog.md)")) {
    throw new Error("manifest must link its improvement log");
  }

  const entries = [...improvementLog.matchAll(logEntryPattern)].map((match) => {
    const version = match[1];
    const date = match[2];
    if (version === undefined || date === undefined) {
      throw new Error("manifest improvement-log entry is incomplete");
    }
    return { version, date };
  });
  if (entries.length === 0) throw new Error("manifest improvement log has no version entries");
  const newestEntry = entries[0];
  const manifestVersion = header[1];
  const releaseDate = released[1];
  if (newestEntry === undefined || manifestVersion === undefined || releaseDate === undefined) {
    throw new Error("manifest version metadata could not be resolved");
  }
  if (newestEntry.version !== manifestVersion || newestEntry.date !== releaseDate) {
    throw new Error("manifest version/date must match the newest improvement-log entry");
  }

  const versions = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) throw new Error("manifest improvement-log entry is missing");
    if (versions.has(entry.version)) throw new Error(`duplicate manifest version ${entry.version}`);
    versions.add(entry.version);
    const next = entries[index + 1];
    if (next && compareVersions(entry.version, next.version) <= 0) {
      throw new Error("manifest improvement-log versions must be newest first");
    }
  }

  return { version: manifestVersion, released: releaseDate, entries: entries.length };
}
