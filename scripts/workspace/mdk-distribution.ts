import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { buildReferenceBundle, packPrivateArtifacts } from "@mezo-dev-kit/cli";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [command, output, ...extra] = process.argv.slice(2);
if (extra.length || !["bundle", "pack"].includes(command ?? ""))
  throw new Error("Use pnpm cli:bundle [empty-output] or pnpm cli:pack <empty-output>");
if (command === "bundle") {
  let revision: string | null = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Exported source archives are identified by input hashes alone. */
  }
  const bundle = await buildReferenceBundle({
    sourceRoot: root,
    outputRoot: resolve(root, output ?? "packages/cli/dist/assets"),
    revision,
  });
  process.stdout.write(
    `${JSON.stringify({ bundle: bundle.id, resources: bundle.resources.length, excluded: bundle.exclusions.length })}\n`,
  );
} else {
  if (!output) throw new Error("Provide a new empty artifact directory");
  const artifacts = await packPrivateArtifacts(root, resolve(root, output));
  process.stdout.write(
    `${JSON.stringify({ bundle: artifacts.bundleId, packages: artifacts.packages.length, output })}\n`,
  );
}
