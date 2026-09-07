import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const explorerBase = process.env.MDK_MEZO_EXPLORER_API_URL ?? "https://api.explorer.mezo.org";

const definitions = [
  {
    id: "musd.enclave-v1",
    contractId: "musd.enclave-v1",
    address: "0xf74d1bddc4c37cbc1b1d8a74480ddff30af6273d",
    name: "Enclave",
    artifact: true,
    creationExecutableSha256: "f368237812e5044d75b09cf15b1c9f97a90d5675d884a7f1629e5cfbc852cbd8",
    runtimeExecutableSha256: "ee7e61ad5b98f5a53e6f4f9e30941d4079f8620c166d27d6789970083a3069dd",
  },
  {
    id: "musd.enclave-v2",
    contractId: "musd.enclave-v2",
    address: "0x05bd601c3c381fd3d099dbb574cc39ea5d8b4a69",
    name: "Enclave",
    artifact: true,
    creationExecutableSha256: "e0f1e02881ae22908316d952fd35239c1b9ded9ea48d8e329f53b1b3ad4622b3",
    runtimeExecutableSha256: "daea9c01a6c3c9e08ecf9dd4b85e737f74910d54e8e0fdd7468656e53b59db43",
  },
  {
    id: "musd.enclave-debt-manager-implementation-v1",
    contractId: null,
    address: "0xb98a5fb78780a1523c193a13a3c59600a7f628e7",
    name: "EnclaveDebtManager",
    artifact: false,
    creationExecutableSha256: "3f353f805de33af8ef830157179a0d73e02476db3db5e2e387ae8fb7224b8574",
    runtimeExecutableSha256: "846b10f67d77820f1c6a1f6e55f571fddd743cf52b1f97547a44cc21e93bbcfa",
  },
  {
    id: "musd.enclave-debt-manager",
    contractId: "musd.enclave-debt-manager",
    address: "0x3ea98a11d349b515e628c1cc74ca999230744c43",
    name: "EnclaveDebtManager",
    artifact: true,
    creationExecutableSha256: "9bd048c31ef142d958a6554b8548c07713fce02d728491545a26718a468d6b2e",
    runtimeExecutableSha256: "731cbf3f02492784c2db6e8b5d1113249c861fc338f17f1216a8b317fdfbbd1b",
  },
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Hex(value: string): string {
  const normalized = value.replace(/^0x/, "");
  if (!/^[a-fA-F0-9]*$/.test(normalized) || normalized.length % 2 !== 0) {
    fail("invalid hexadecimal bytecode");
  }
  return sha256(Buffer.from(normalized, "hex"));
}

function semanticAbiDigest(abi: unknown[]): string {
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

const records = [];
for (const definition of definitions) {
  const url = `${explorerBase}/api/v2/smart-contracts/${definition.address}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  const contract = JSON.parse(raw) as {
    name?: string;
    abi?: unknown[];
    file_path?: string;
    source_code?: string;
    additional_sources?: unknown[];
    compiler_version?: string;
    compiler_settings?: unknown;
    external_libraries?: unknown[];
    creation_bytecode?: string;
    deployed_bytecode?: string;
    is_verified?: boolean;
    is_fully_verified?: boolean;
    is_partially_verified?: boolean;
    is_changed_bytecode?: boolean;
  };
  if (contract.name !== definition.name) fail(`${definition.id} explorer name drifted`);
  if (!contract.is_verified || !contract.is_fully_verified || contract.is_partially_verified) {
    fail(`${definition.id} is no longer fully verified by the official explorer`);
  }
  if (!Array.isArray(contract.abi) || contract.abi.length === 0) {
    fail(`${definition.id} ABI is missing`);
  }

  let abi = null;
  if (definition.artifact && definition.contractId) {
    const relativeArtifactPath = `artifacts/abis/${definition.contractId.replaceAll(".", "/")}.json`;
    const artifactPath = join(repositoryRoot, "knowledge", "contracts", relativeArtifactPath);
    const output = `${JSON.stringify(contract.abi, null, 2)}\n`;
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, output, "utf8");
    abi = {
      entryCount: contract.abi.length,
      artifactPath: relativeArtifactPath,
      fileSha256: sha256(output),
      abiSha256: sha256(JSON.stringify(canonicalize(contract.abi))),
      abiSemanticSha256: semanticAbiDigest(contract.abi),
    };
  }

  const sourceBundle = {
    filePath: contract.file_path,
    sourceCode: contract.source_code,
    additionalSources: [...(contract.additional_sources ?? [])].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  };
  records.push({
    id: definition.id,
    contractId: definition.contractId,
    name: contract.name,
    filePath: contract.file_path,
    address: definition.address,
    explorerEndpoint: url,
    retrievedAt: new Date().toISOString(),
    responseSha256: sha256(raw),
    explorerVerification: {
      isVerified: contract.is_verified,
      isFullyVerified: contract.is_fully_verified,
      isPartiallyVerified: contract.is_partially_verified,
      isChangedBytecode: contract.is_changed_bytecode,
    },
    compilerVersion: contract.compiler_version,
    compilerSettingsSha256: sha256(JSON.stringify(canonicalize(contract.compiler_settings ?? {}))),
    librariesSha256: sha256(JSON.stringify(canonicalize(contract.external_libraries ?? []))),
    sourceBundleSha256: sha256(JSON.stringify(canonicalize(sourceBundle))),
    explorerCreationBytecodeSha256: sha256Hex(contract.creation_bytecode ?? ""),
    explorerRuntimeBytecodeSha256: sha256Hex(contract.deployed_bytecode ?? ""),
    reproduction: {
      procedure:
        "Fetch the recorded explorer bundle, create an isolated Foundry project with scripts/reproduce-explorer-contract.ts, compile with the exact explorer compiler/settings, and compare with scripts/compare-explorer-build.ts.",
      creationExecutableExact: true,
      runtimeExecutableExactAfterImmutableSubstitution: true,
      creationExecutableSha256: definition.creationExecutableSha256,
      runtimeExecutableSha256: definition.runtimeExecutableSha256,
      immutableSubstitutions: 0,
      fullBytecodeDifference:
        "Executable bytes match exactly; full bytes differ only in Solidity metadata.",
    },
    abi,
  });
}

const verifiedAt = records.reduce(
  (latest, record) => (record.retrievedAt > latest ? record.retrievedAt : latest),
  "",
);
const output = {
  schemaVersion: 1,
  kind: "institutional-musd-debt-source-reproduction-evidence",
  id: "institutional-musd-debt-source-reproduction",
  owner: "protocols/musd/institutional-debt",
  status: "verified",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  verifiedAt,
  reviewAfter: "2026-09-23T00:00:00Z",
  scope: {
    networkIds: ["mezo-mainnet"],
    contractIds: ["musd.enclave-v1", "musd.enclave-v2", "musd.enclave-debt-manager"],
    implementationAddresses: definitions.map(({ address }) => address),
  },
  limitations: [
    "Executable reproduction proves byte correspondence for the four recorded implementation generations; it does not establish source authorship, repository history, audit coverage, or support.",
    "The ABI artifacts cover the two simultaneously active Enclave generations and the current debt-manager implementation; the superseded debt-manager ABI remains evidence only.",
    "All three Contract identities remain proposed pending qualified Level 3 review.",
  ],
  records,
};

const outputPath = join(
  repositoryRoot,
  "knowledge",
  "protocols",
  "musd",
  "institutional-debt",
  "evidence",
  "source-reproduction-2026-08-23.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);
