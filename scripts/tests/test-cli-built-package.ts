import { createServer } from "node:http";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceBundle, packPrivateArtifacts } from "@mezo-dev-kit/cli";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await mkdtemp(join(tmpdir(), "mdk-packed-proof-"));
async function pnpm(cwd: string, args: readonly string[]): Promise<string> {
  const result = await promisify(execFile)("pnpm", [...args], {
    cwd,
    env: { ...process.env, CI: "true" },
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.stdout;
}
function resultData(output: string): Record<string, unknown> {
  const value: unknown = JSON.parse(output);
  assert.ok(typeof value === "object" && value !== null && "data" in value);
  assert.ok(typeof value.data === "object" && value.data !== null);
  return value.data as Record<string, unknown>;
}
try {
  const source = resolve(root, "packages/cli/dist/assets");
  await rm(source, { recursive: true, force: true });
  const bundle = await buildReferenceBundle({
    sourceRoot: root,
    outputRoot: source,
    revision: null,
  });
  const repeated = await buildReferenceBundle({
    sourceRoot: root,
    outputRoot: join(temporary, "repeated"),
    revision: null,
  });
  assert.equal(bundle.id, repeated.id, "Bundle generation must be deterministic");
  assert.ok(bundle.resources.length > 100);
  assert.ok(bundle.exclusions.length > 0);
  assert.equal(bundle.skills.length, 20);
  assert.ok(bundle.skills.some((skill) => skill.name === "mdk-frontend-application"));
  assert.ok(bundle.sets?.some((set) => set.id === "frontend"));
  const architectureSkill = bundle.skills.find(
    (skill) => skill.name === "mdk-application-architecture",
  );
  assert.ok(architectureSkill);
  for (const setId of ["base", "frontend"]) {
    const set = bundle.sets?.find((item) => item.id === setId);
    assert.ok(set);
    assert.ok(!architectureSkill.domains.some((domain) => set.domains.includes(domain)));
  }
  for (const guide of ["application_architecture", "frontend_patterns"]) {
    assert.ok(bundle.resources.some((resource) => resource.id === `guide:docs/guides/${guide}.md`));
  }
  for (const resource of bundle.resources.filter((item) => item.kind === "knowledge"))
    assert.deepEqual(
      await readFile(join(source, resource.path)),
      await readFile(join(root, resource.sourcePath)),
      "Knowledge records retain original bytes and evidence envelope",
    );
  for (const resource of bundle.resources.filter((item) => item.kind !== "knowledge")) {
    const original = await readFile(join(root, resource.sourcePath), "utf8");
    const distributed = await readFile(join(source, resource.path), "utf8");
    // The maintained corpus uses top-level backtick fences. Compare their exact
    // bytes independently of the production link scanner, including example labels.
    for (const example of original.matchAll(/^(`{3,})[^`\r\n]*\r?\n[\s\S]*?^\1[ \t]*(?=\r?$)/gm))
      assert.ok(
        distributed.includes(example[0]),
        `${resource.sourcePath}: distribution changed or omitted a fenced example`,
      );
  }
  for (const skill of bundle.skills)
    for (const file of skill.files)
      assert.deepEqual(
        await readFile(join(source, "skills", skill.name, file.path)),
        await readFile(join(root, "agents/consumer/skills", skill.name, file.path)),
      );
  const artifacts = join(temporary, "artifacts");
  const packed = await packPrivateArtifacts(root, artifacts);
  assert.equal(packed.packages.length, bundle.packages.length + 1);
  const kitHelp = await promisify(execFile)(
    process.execPath,
    [join(artifacts, "start.ts"), "--help"],
    { cwd: temporary },
  );
  assert.match(kitHelp.stdout, /MDK guided console/);
  assert.deepEqual(
    await readFile(join(artifacts, "console/assets/bundle.json")),
    await readFile(join(source, "bundle.json")),
  );
  const project = join(temporary, "consumer");
  const create = [
    "create",
    project,
    "--template",
    "typescript",
    "--artifacts",
    join(artifacts, "manifest.json"),
  ];
  await promisify(execFile)(
    process.execPath,
    [resolve(root, "packages/cli/dist/bin.js"), ...create, "--dry-run"],
    { cwd: root },
  );
  assert.ok(!(await readdir(temporary)).includes("consumer"));
  await promisify(execFile)(
    process.execPath,
    [resolve(root, "packages/cli/dist/bin.js"), ...create],
    { cwd: root },
  );
  await pnpm(project, ["install", "--offline", "--ignore-scripts"]);
  const consoleHelp = await pnpm(project, ["mdk", "console", "--help"]);
  assert.match(consoleHelp, /MDK guided console/);
  const second = join(temporary, "created-by-installed-cli");
  await pnpm(project, [
    "exec",
    "mdk",
    "create",
    second,
    "--template",
    "typescript",
    "--artifacts",
    join(artifacts, "manifest.json"),
    "--offline",
    "--json",
  ]);
  assert.match(await readFile(join(second, ".gitignore"), "utf8"), /node_modules\//);
  assert.ok((await readdir(join(second, "src"))).includes("network.ts"));
  await pnpm(project, ["exec", "mdk", "init", "--set", "base", "--offline", "--json"]);
  await pnpm(project, ["start"]);
  await pnpm(project, ["check"]);
  assert.deepEqual((await readdir(join(project, ".agents/skills"))).sort(), [
    "mdk-foundation-application",
    "mdk-memory-application",
    "mdk-typescript-application",
  ]);
  const catalog = resultData(await pnpm(project, ["exec", "mdk", "sets", "--json"]));
  assert.ok(Array.isArray(catalog.sets) && catalog.sets.length === bundle.sets?.length);
  const beforeEconomy = await readFile(join(project, "package.json"));
  const beforeEconomyInstructions = await readFile(join(project, "AGENTS.md"));
  const economy = resultData(
    await pnpm(project, ["exec", "mdk", "add", "economy", "--offline", "--json"]),
  );
  assert.equal(economy.complete, true);
  assert.deepEqual(await readFile(join(project, "package.json")), beforeEconomy);
  assert.deepEqual(await readFile(join(project, "AGENTS.md")), beforeEconomyInstructions);
  assert.deepEqual(
    await readFile(join(project, ".agents/skills/mdk-economic-system-application/SKILL.md")),
    await readFile(join(root, "agents/consumer/skills/mdk-economic-system-application/SKILL.md")),
  );
  for (const id of [
    "guide:docs/architecture/mezo-economic-system-composition.md",
    "guide:knowledge/protocols/musd/savings/review/source-conflicts.md",
    "knowledge:protocols/vaults/usdc-lending:economic-relationships",
  ]) {
    const shown = resultData(
      await pnpm(project, ["exec", "mdk", "docs", "show", id, "--offline", "--json"]),
    );
    assert.ok(typeof shown.content === "string" && shown.content.length > 0);
    if (id.startsWith("knowledge:")) {
      const retained: unknown = JSON.parse(shown.content);
      const expected: unknown = JSON.parse(
        await readFile(
          join(root, "knowledge/protocols/vaults/usdc-lending/records/economic-relationships.json"),
          "utf8",
        ),
      );
      assert.deepEqual(
        retained,
        expected,
        "Offline retrieval must preserve the complete evidence envelope",
      );
    }
  }
  const beforeAdd = await readFile(join(project, "package.json"));
  // An existing independent app can bootstrap the base set without a generated starter.
  const existing = join(temporary, "existing-app");
  await mkdir(join(existing, ".mdk"), { recursive: true });
  const cliArtifact = packed.packages.find((item) => item.name === "@mezo-dev-kit/cli");
  assert.ok(cliArtifact);
  await writeFile(
    join(existing, ".mdk/cli.tgz"),
    await readFile(join(artifacts, cliArtifact.path)),
  );
  const rootManifest: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.ok(
    typeof rootManifest === "object" &&
      rootManifest !== null &&
      "packageManager" in rootManifest &&
      typeof rootManifest.packageManager === "string",
  );
  await writeFile(
    join(existing, "package.json"),
    JSON.stringify({
      name: "existing-app",
      private: true,
      type: "module",
      packageManager: rootManifest.packageManager,
      devDependencies: { "@mezo-dev-kit/cli": "file:./.mdk/cli.tgz" },
    }),
  );
  await writeFile(join(existing, "AGENTS.md"), "Keep this application's conventions.\n");
  await writeFile(
    join(existing, "pnpm-workspace.yaml"),
    "overrides:\n  unrelated-package: 1.2.3\n",
  );
  await pnpm(existing, ["install", "--offline", "--ignore-scripts"]);
  // Exercise the installed tarball from an empty directory, before init/add or wallet setup.
  const evidenceDirectory = join(temporary, "evidence-only");
  await mkdir(evidenceDirectory);
  const rpcServer = createServer();
  const capturedSeconds = Math.floor(Date.now() / 1000);
  let incentiveFixture = false;
  rpcServer.on("request", (request, response) => {
    let body = "";
    request.on("data", (bytes: Buffer) => {
      body += bytes.toString("utf8");
    });
    request.on("end", () => {
      const input: unknown = JSON.parse(body);
      assert.ok(typeof input === "object" && input !== null && "method" in input);
      assert.ok(
        [
          "eth_chainId",
          "eth_blockNumber",
          "eth_getBlockByNumber",
          "eth_getCode",
          "eth_getStorageAt",
        ].includes(String(input.method)),
      );
      const result =
        input.method === "eth_chainId"
          ? incentiveFixture
            ? "0x7b7c"
            : "0x1"
          : input.method === "eth_blockNumber"
            ? incentiveFixture
              ? "0xffffff"
              : "0x64"
            : input.method === "eth_getCode"
              ? "0x00"
              : input.method === "eth_getStorageAt"
                ? `0x${"00".repeat(32)}`
                : {
                    number: incentiveFixture ? "0xffffff" : "0x64",
                    hash: `0x${"ab".repeat(32)}`,
                    timestamp: `0x${capturedSeconds.toString(16)}`,
                  };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
  });
  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));
  try {
    const address = rpcServer.address();
    assert.ok(address && typeof address !== "string");
    const evidenceArgs = [
      "evidence",
      "refresh",
      "--network",
      "ethereum-mainnet",
      "--recipe",
      "network.identity",
      "--provider",
      "packed-fixture",
      "--rpc-env",
      "PACKED_EVIDENCE_RPC",
      "--policy",
      "current-v1",
      "--output",
      "reports",
      "--json",
    ];
    for (const executable of [
      join(existing, "node_modules/@mezo-dev-kit/cli/dist/bin.js"),
      join(artifacts, "console/bin.js"),
    ]) {
      const captured = await promisify(execFile)(process.execPath, [executable, ...evidenceArgs], {
        cwd: evidenceDirectory,
        env: { ...process.env, PACKED_EVIDENCE_RPC: `http://127.0.0.1:${address.port}/SECRET` },
      });
      const report = resultData(captured.stdout);
      assert.equal(report.status, "complete");
      assert.equal(report.canonicalAcceptance, "unreviewed");
      assert.ok(!captured.stdout.includes("SECRET"));
    }
    incentiveFixture = true;
    for (const executable of [
      join(existing, "node_modules/@mezo-dev-kit/cli/dist/bin.js"),
      join(artifacts, "console/bin.js"),
    ]) {
      let report: Record<string, unknown> | undefined;
      try {
        await promisify(execFile)(
          process.execPath,
          [
            executable,
            ...evidenceArgs.map((arg) =>
              arg === "ethereum-mainnet"
                ? "mezo-mainnet"
                : arg === "network.identity"
                  ? "incentives.configuration"
                  : arg,
            ),
            "--contracts",
            "incentives.boost-voter",
          ],
          {
            cwd: evidenceDirectory,
            env: { ...process.env, PACKED_EVIDENCE_RPC: `http://127.0.0.1:${address.port}/SECRET` },
          },
        );
        assert.fail("A runtime conflict must exit with findings");
      } catch (error) {
        assert.ok(
          error instanceof Error &&
            "code" in error &&
            error.code === 3 &&
            "stdout" in error &&
            typeof error.stdout === "string",
        );
        report = resultData(error.stdout);
      }
      assert.equal(report.status, "partial");
      assert.ok(Array.isArray(report.observations));
      const fields = report.observations.filter(
        (o: unknown) =>
          typeof o === "object" && o !== null && "id" in o && String(o.id).startsWith("incentive:"),
      );
      assert.equal(fields.length, 5);
      assert.ok(
        fields.every(
          (o: unknown) =>
            typeof o === "object" && o !== null && "error" in o && o.error === "runtime-changed",
        ),
      );
    }
    assert.deepEqual(await readdir(evidenceDirectory), ["reports"]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      rpcServer.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
  const existingAdd = resultData(
    await pnpm(existing, [
      "exec",
      "mdk",
      "add",
      "base",
      "--artifacts",
      join(artifacts, "manifest.json"),
      "--offline",
      "--json",
    ]),
  );
  assert.equal(existingAdd.complete, true);
  assert.equal(
    await readFile(join(existing, "AGENTS.md"), "utf8"),
    "Keep this application's conventions.\n",
  );
  assert.equal(
    JSON.parse(await pnpm(existing, ["config", "get", 'overrides["unrelated-package"]', "--json"])),
    "1.2.3",
  );
  assert.deepEqual(
    resultData(await pnpm(existing, ["exec", "mdk", "doctor", "--json"])).issues,
    [],
  );
  const preview = resultData(
    await pnpm(project, ["exec", "mdk", "add", "borrowing", "--dry-run", "--offline", "--json"]),
  );
  assert.equal(preview.complete, false);
  assert.deepEqual(await readFile(join(project, "package.json")), beforeAdd);
  // All additions use only the application's retained artifacts and installed CLI.
  await rm(artifacts, { recursive: true });
  for (const set of bundle.sets ?? []) {
    const added = resultData(
      await pnpm(project, ["exec", "mdk", "add", set.id, "--offline", "--json"]),
    );
    assert.equal(added.complete, true, `Set ${set.id} must finish installation and guidance`);
  }
  assert.ok(
    !(await readdir(join(project, ".agents/skills"))).includes("mdk-application-architecture"),
  );
  const appInstructions = await readFile(join(project, "AGENTS.md"));
  const appManifest = await readFile(join(project, "package.json"));
  const architectureAdd = resultData(
    await pnpm(project, [
      "exec",
      "mdk",
      "add",
      "--skill",
      "mdk-application-architecture",
      "--offline",
      "--json",
    ]),
  );
  assert.equal(architectureAdd.complete, true);
  assert.deepEqual(await readFile(join(project, "AGENTS.md")), appInstructions);
  assert.deepEqual(await readFile(join(project, "package.json")), appManifest);
  assert.deepEqual(
    await readFile(join(project, ".agents/skills/mdk-application-architecture/SKILL.md")),
    await readFile(join(root, "agents/consumer/skills/mdk-application-architecture/SKILL.md")),
  );
  const installed = resultData(await pnpm(project, ["exec", "mdk", "skills", "--json"]));
  assert.ok(Array.isArray(installed.skills) && installed.skills.length === bundle.skills.length);
  const approval = await promisify(execFile)(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { planApproval } from "@mezo-dev-kit/tokens"; if (planApproval({ allowance: 0n, requiredAmount: 12n }).kind !== "approve") throw new Error("Installed SDK planner failed");',
    ],
    { cwd: project },
  );
  assert.equal(approval.stderr, "");
  await mkdir(join(project, ".agents/skills/my-app"), { recursive: true });
  await writeFile(join(project, ".agents/skills/my-app/SKILL.md"), "Application-owned guidance\n");
  const memoryFile = join(temporary, "memory-entry.json");
  await writeFile(
    memoryFile,
    JSON.stringify({
      schemaVersion: 1,
      id: "installed-sdk-proof",
      domain: "application/sdk",
      status: "verified",
      title: "Installed token planner fixture",
      summary: "The installed token planner was exercised with synthetic amounts.",
      sources: ["package.json"],
      related: [],
      updated: "2026-09-22",
    }),
  );
  await pnpm(project, ["exec", "mdk", "memory", "save", "--file", memoryFile, "--json"]);
  await pnpm(project, ["exec", "mdk", "memory", "check", "--json"]);
  assert.equal(
    resultData(await pnpm(project, ["exec", "mdk", "memory", "search", "token planner", "--json"]))
      .total,
    1,
  );
  await pnpm(project, [
    "exec",
    "mdk",
    "add",
    "--skill",
    "mdk-memory-application",
    "--offline",
    "--json",
  ]);
  assert.equal(
    await readFile(join(project, ".agents/skills/my-app/SKILL.md"), "utf8"),
    "Application-owned guidance\n",
  );
  const memory = await readFile(join(project, ".mdk/memory/installed-sdk-proof.json"));
  await pnpm(project, ["check"]);
  const search = resultData(
    await pnpm(project, ["exec", "mdk", "docs", "search", "borrowing", "--json"]),
  );
  assert.ok(Array.isArray(search.resources) && search.resources.length > 0);
  await pnpm(project, [
    "exec",
    "mdk",
    "docs",
    "fetch",
    "api:musd-borrowing",
    "--offline",
    "--json",
  ]);
  const shown = resultData(
    await pnpm(project, [
      "exec",
      "mdk",
      "docs",
      "show",
      "api:musd-borrowing",
      "--offline",
      "--json",
    ]),
  );
  const borrowingReference = bundle.resources.find(
    (resource) => resource.id === "api:musd-borrowing",
  );
  assert.ok(borrowingReference);
  assert.equal(shown.content, await readFile(join(source, borrowingReference.path), "utf8"));
  const all = resultData(
    await pnpm(project, ["exec", "mdk", "docs", "fetch", "--all", "--offline", "--json"]),
  );
  assert.equal(all.complete, true);
  assert.ok(Array.isArray(all.verified));
  assert.equal(all.verified.length, bundle.resources.length);
  const doctor = resultData(await pnpm(project, ["exec", "mdk", "doctor", "--offline", "--json"]));
  assert.deepEqual(doctor.issues, []);
  assert.equal(doctor.cached, bundle.resources.length);
  const instructions = await readFile(join(project, "AGENTS.md"));
  await rm(join(project, ".agents"), { recursive: true });
  await rm(join(project, ".mdk/reference"), { recursive: true });
  await pnpm(project, ["exec", "mdk", "sync", "--locked", "--offline", "--json"]);
  await pnpm(project, ["exec", "mdk", "sync", "--locked", "--check", "--offline", "--json"]);
  assert.deepEqual(await readFile(join(project, "AGENTS.md")), instructions);
  assert.deepEqual(await readFile(join(project, ".mdk/memory/installed-sdk-proof.json")), memory);
  process.stdout.write(
    `Packed CLI and ${bundle.packages.length} SDK packages passed external creation, ${bundle.sets?.length ?? 0} capability additions, memory, starter checks, ${bundle.resources.length}-resource offline retrieval and locked restoration.\n`,
  );
} finally {
  if (process.env.MDK_KEEP_CLI_FIXTURE) process.stdout.write(`Fixture retained: ${temporary}\n`);
  else await rm(temporary, { recursive: true, force: true });
}
