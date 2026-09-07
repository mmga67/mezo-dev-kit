import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const explorerBase = "https://api.explorer.mezo.org";

const definitions = [
  {
    contractId: "mezo-earn.cl-factory",
    address: "0xbb24af5c6fb88f1d191fa76055e30bf881beeb79",
    name: "CLFactory",
    verification: "fully-verified",
    creationExecutableSha256: "ec0520bbfc32825c8f28741c807d2efbaac35bbbee9db62ea5693edca87f2cd7",
    runtimeExecutableSha256: "148ef74b3762fa7befce00d909647a2d7f2e8e088006fddb047b2f3361ad9472",
    immutableSubstitutions: 7,
  },
  {
    contractId: "mezo-earn.cl-pool-implementation",
    address: "0x819cfadd7f5bc0854fa3b7f5749ea0410a943e5f",
    name: "CLPool",
    verification: "fully-verified",
    creationExecutableSha256: "7d60c56ed16cf95b57638f0d3ac600c3205e388b24db8474f0a626b2d4636241",
    runtimeExecutableSha256: "d4c7b9b6873408b1f311f82efea2a3c46e199132c468d089b0bce946fc006f09",
    immutableSubstitutions: 0,
  },
  {
    contractId: "mezo-earn.cl-swap-router",
    address: "0x37cdd11919ec3860ead9efb8673d7476e5326225",
    name: "CLSwapRouter",
    verification: "fully-verified",
    creationExecutableSha256: "8f1c8d7eaa162e752e2231f18df1dae5fc5a803913b82e8c7e9dd95e46586515",
    runtimeExecutableSha256: "212959c5a8150fb3bf963e4e56478b64fda981a8d132bf78ea19d6f6b7e9c1ed",
    immutableSubstitutions: 3,
  },
  {
    contractId: "mezo-earn.cl-position-manager",
    address: "0x509bc221df2b83927c695fa0bb0f5b21053c874c",
    name: "NonfungiblePositionManager",
    verification: "fully-verified",
    creationExecutableSha256: "1cc66ee8ded80a68aba4fca3cd26e555b0c19c44d49342079952463fdd2715f3",
    runtimeExecutableSha256: "6cb215e69ac16148bed356fbb1ccdd3b4ee7802364af1798761aee4e3f82d372",
    immutableSubstitutions: 9,
  },
  {
    contractId: "mezo-earn.cl-position-descriptor",
    address: "0x818f6ccfbee90202b967567bcf2a5fb9b73cfeca",
    name: "NonfungibleTokenPositionDescriptor",
    verification: "partially-verified",
    creationExecutableSha256: "956696b2008a9c4bf37ec568a4ca637c3e25fa93286b8bac8a6faa5f552ccad9",
    runtimeExecutableSha256: "d9ca57a03798bab0432b7761122fdcb29a6240548ae8167651e056ae5db539c5",
    immutableSubstitutions: 0,
  },
  {
    contractId: "incentives.cl-gauge-factory",
    address: "0xfc41e1aae0e58e8bdc32e85d8c995a902fedeb13",
    name: "CLGaugeFactory",
    verification: "fully-verified",
    creationExecutableSha256: "d652a3f5e8bcbc4c98b06813eb21d5fdd6fa7c95b9ded23dd0c0d29e13d3fe58",
    runtimeExecutableSha256: "df28cb373ae9b9e1bee679bc2ef481ccc999b652e36747b0c480a21668b7e48a",
    immutableSubstitutions: 7,
  },
  {
    contractId: "incentives.cl-gauge-implementation",
    address: "0x8f11a90265f7a784b46fe326638ec37a5cc29c33",
    name: "CLGauge",
    verification: "fully-verified",
    creationExecutableSha256: "5f46891c0e81715ad887483d496f34788d0f74a8a1c7563a9ef6885652561437",
    runtimeExecutableSha256: "7674d9b1a61bbfdcd575fbc508f19c8222206e04b0f251806b9aa459d7c14084",
    immutableSubstitutions: 0,
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
  const verification = contract.is_fully_verified
    ? "fully-verified"
    : contract.is_partially_verified
      ? "partially-verified"
      : "unverified";
  if (contract.name !== definition.name) fail(`${definition.contractId} name drifted`);
  if (verification !== definition.verification) {
    fail(`${definition.contractId} explorer verification label drifted`);
  }
  if (!Array.isArray(contract.abi) || contract.abi.length === 0) {
    fail(`${definition.contractId} ABI is missing`);
  }

  const relativeArtifactPath = `artifacts/abis/${definition.contractId.replaceAll(".", "/")}.json`;
  const artifactPath = join(repositoryRoot, "knowledge", "contracts", relativeArtifactPath);
  const output = `${JSON.stringify(contract.abi, null, 2)}\n`;
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, output, "utf8");

  const sourceBundle = {
    filePath: contract.file_path,
    sourceCode: contract.source_code,
    additionalSources: [...(contract.additional_sources ?? [])].sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  };
  records.push({
    id: definition.contractId,
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
      immutableSubstitutions: definition.immutableSubstitutions,
      fullBytecodeDifference:
        "Executable bytes match; full bytes differ only in Solidity metadata and, where recorded, deployed immutable substitutions.",
    },
    abi: {
      entryCount: contract.abi.length,
      artifactPath: relativeArtifactPath,
      fileSha256: sha256(output),
      abiSha256: sha256(JSON.stringify(canonicalize(contract.abi))),
      abiSemanticSha256: semanticAbiDigest(contract.abi),
    },
  });
}

const verifiedAt = records.reduce(
  (latest, record) => (record.retrievedAt > latest ? record.retrievedAt : latest),
  "",
);
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "mezo-pool-source-reproduction-evidence",
      id: "pools-source-reproduction",
      owner: "protocols/pools",
      status: "verified",
      supportStatus: "proposed",
      reviewStatus: "pending-qualified-review",
      verifiedAt,
      reviewAfter: "2026-09-23T00:00:00Z",
      scope: {
        networkIds: ["mezo-mainnet"],
        contractIds: definitions.map(({ contractId }) => contractId),
      },
      limitations: [
        "Executable reproduction proves the recorded source/compiler build corresponds to deployed executable bytes; it does not establish source authorship, repository history, audit coverage, or support.",
        "The position descriptor's official explorer label is partially verified and is preserved even though the supplied bundle reproduces its executable bytes.",
        "Every root and ABI remains proposed pending qualified Level 3 review.",
      ],
      records,
    },
    null,
    2,
  )}\n`,
);
