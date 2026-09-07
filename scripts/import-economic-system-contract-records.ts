import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const explorerBase = process.env.MDK_MEZO_EXPLORER_API_URL ?? "https://api.explorer.mezo.org";
const rpcUrl = process.env.MDK_MEZO_RPC_URL ?? "https://mezo-mainnet.boar.network";
const evidenceResourceId = "contract-economic-system-probes-2026-08-23";
const sourceId = "economic-system-explorer-executable-reproductions";
const verifiedAt = "2026-08-24T15:30:07Z";
const reviewAfter = "2026-09-24T00:00:00Z";
const fixedBlock = {
  number: 11_341_710,
  hash: "0xcca3b133bbb5282b84fd383d3b73440169a50155cea3288d91067a2ff76c61d0",
  timestamp: "2026-08-23T20:17:37Z",
};
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const upgradedTopic = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";

const definitions = [
  {
    contractId: "musd.savings-rate",
    registryAccepted: true,
    contractName: "MUSD Savings Rate",
    sourceContractName: "MUSDSavingsRate",
    protocol: "musd-savings",
    domains: ["musd", "savings", "yield-index"],
    address: "0xb4d498029af77680cd1ef828b967f010d06c51cc",
    sourceAddress: "0xb33c3f97bf3b7df59417d114c694353e42929e87",
    contractType: "transparent-proxy",
    adminAddress: "0x973c1a54b1b8d4ad04ea1d8469cda159672b95d0",
    activation: {
      blockNumber: 5_045_441,
      blockHash: "0x8f9f930cce0711a9a6f5304bb5d7c785bf01b77860d05baccbfddb665e384404",
      blockTimestamp: "2025-12-02T18:20:46Z",
      transactionHash: "0xd8622652aa1275d5e7a7b2817f9c151e0868e11e0e3b4b69406ad29ee5754600",
    },
    addressCodeSha256: "3a9bec4cf58ef60c3a34360c2443afcd835cc296e40ec941d7a6d8c211a51111",
    implementationCodeSha256: "8739fb3a70a6679d5b5355085505328922150dd91f2db20ee19a2e4cd6bf4565",
    explorerVerification: { isVerified: true, isFullyVerified: true, isPartiallyVerified: false },
    creationExecutableSha256: "1d36b9a9e3527cb74ded02a45b368b8e132309fc26a33f51454a2e1c300094d6",
    runtimeExecutableSha256: "f56a17a5a31b2eb5faf266de4bf593dc30631018ccfad6c23b42aefa73be6b9b",
    immutableSubstitutions: 1,
  },
  {
    contractId: "lending.morpho",
    registryAccepted: true,
    contractName: "Morpho",
    sourceContractName: "Morpho",
    protocol: "musdc-lending",
    domains: ["lending", "musdc", "market-accounting"],
    address: "0x565834ce7e40b8987bc20ebf83e2159467bda311",
    sourceAddress: "0x565834ce7e40b8987bc20ebf83e2159467bda311",
    contractType: "direct",
    adminAddress: null,
    activation: {
      blockNumber: 9_206_917,
      blockHash: "0xb5dca27661f41a2975ca1e4645e6d178fcf6ca177e8f0a69e09cedeb6cc3eb7a",
      blockTimestamp: "2026-05-25T15:04:32Z",
      transactionHash: "0x1459043d5cc8f8882ed154334a8ebd82df1129028b1e613a81a52109d49db48f",
    },
    addressCodeSha256: "503b1a0be404a21efd01e9491e6b1a132fd506352936c84db3e3aa38aa69e746",
    implementationCodeSha256: null,
    explorerVerification: { isVerified: true, isFullyVerified: false, isPartiallyVerified: true },
    creationExecutableSha256: "eedc07021adfd8f032f932cba6f63a8a418857ef9c8096b0a7e93a8541662088",
    runtimeExecutableSha256: "613e1df79c1eb308ca305d1d9f91bf38478603e94a70a151eff1d5e10d7ef9f0",
    immutableSubstitutions: 2,
  },
  {
    contractId: "lending.adaptive-curve-irm",
    registryAccepted: true,
    contractName: "Adaptive Curve IRM",
    sourceContractName: "AdaptiveCurveIrm",
    protocol: "musdc-lending",
    domains: ["lending", "musdc", "interest-rate"],
    address: "0x3760ebc636f912a4db9540fda4dec09c25c6c1e7",
    sourceAddress: "0x3760ebc636f912a4db9540fda4dec09c25c6c1e7",
    contractType: "direct",
    adminAddress: null,
    activation: {
      blockNumber: 9_222_603,
      blockHash: "0xfc06d34f65cdf4aa542d6ec66e81357482a33f105b297cea1a506c5f972ff4f9",
      blockTimestamp: "2026-05-26T06:51:58Z",
      transactionHash: "0x1aa04270b516a08f09c49a731c2afe1182dc5e654b33561cd2664deedca1c68a",
    },
    addressCodeSha256: "8e56a873ea5e23559aeb47f87ff3e745fb24e9f6909387e0febd62e86b75076c",
    implementationCodeSha256: null,
    explorerVerification: { isVerified: true, isFullyVerified: false, isPartiallyVerified: true },
    creationExecutableSha256: "8d0bb13b00cd09b0e98dd86828b830fef4127891006ea1f0fa0a484faff78380",
    runtimeExecutableSha256: "52c08d3ea42ab6ae28c6783069aaf0921bb2d04efbb7b0b15f76c09d7c485ada",
    immutableSubstitutions: 2,
  },
  {
    contractId: "lending.musdc-btc-oracle",
    registryAccepted: true,
    contractName: "mUSDC/BTC Morpho Price Oracle",
    sourceContractName: "MorphoPriceOracle",
    protocol: "musdc-lending",
    domains: ["lending", "musdc", "oracle"],
    address: "0xea0597d3d44ff2ea1e4c35501e153f4c025e48d1",
    sourceAddress: "0x799c63c61b885ef546c1469c182eaa54a36554d4",
    contractType: "transparent-proxy",
    adminAddress: "0x7745bab2fe49d39d3cc4d0a841117579a8718291",
    activation: {
      blockNumber: 9_226_009,
      blockHash: "0x68a4d1259bd20e1ee0813eb04c5ffaf1819a6d134c089780c6a5cbd2d80a2dd4",
      blockTimestamp: "2026-05-26T10:17:54Z",
      transactionHash: "0x868823ace4e5cad30f8f2b75e178d30a1d1f9d4c88da6ed74b96acf8e8748682",
    },
    addressCodeSha256: "4fd4e53e1f1ba95dc73aa7ddb779546561ecfb66e5e8854b8c1354b0683d9651",
    implementationCodeSha256: "21e60b2c114a8e5cf0e55cd0c2b9304bfe07959df96a5181391abaa88c9b9acd",
    explorerVerification: { isVerified: true, isFullyVerified: true, isPartiallyVerified: false },
    creationExecutableSha256: "cbb3c43a785406d34e186dd184f83b0b3c62d38c153b1642e38e722a1e7f34c9",
    runtimeExecutableSha256: "629ed18258333b121018c9cc8bce5043eecc57bd54633dc393846f5a5233cc1f",
    immutableSubstitutions: 0,
  },
  {
    contractId: "vaults.usdc-lending-market-adapter",
    registryAccepted: true,
    contractName: "USDC Lending Morpho Market Adapter",
    sourceContractName: "MorphoMarketV1AdapterV2",
    protocol: "usdc-lending-vault",
    domains: ["vaults", "musdc", "allocation"],
    address: "0xb0ee3a01d9134733155b28289c09f084acca4f61",
    sourceAddress: "0xb0ee3a01d9134733155b28289c09f084acca4f61",
    contractType: "direct",
    adminAddress: null,
    activation: {
      blockNumber: 9_274_357,
      blockHash: "0x10ceb234db356022fe55a1621ccd50b05d7560af504b17c182578d9837e3b4ad",
      blockTimestamp: "2026-05-28T11:10:11Z",
      transactionHash: "0xbe16512b5cb529f76812975c2ead40b11653df889a9c19bf45fc3e3fdc3063bc",
    },
    addressCodeSha256: "47cd22243a5e4f0986482b3fa1051e89e48cf67db4f14c572d7e818ee18863a0",
    implementationCodeSha256: null,
    explorerVerification: { isVerified: true, isFullyVerified: false, isPartiallyVerified: true },
    creationExecutableSha256: "7d019230b0c4fd59b4f5490e80970cb0d227402f427e47a5aec0a600be86c756",
    runtimeExecutableSha256: "41ece35d20616a51fa51618e905ce8ef6fdd08aa1da76b91239cc68425c35db0",
    immutableSubstitutions: 20,
  },
  {
    contractId: "vaults.usdc-lending-wrapper",
    registryAccepted: true,
    contractName: "USDC Lending Receipt Wrapper",
    sourceContractName: "ERC4626VaultAdapter",
    protocol: "usdc-lending-vault",
    domains: ["vaults", "musdc", "receipts", "redirected-yield"],
    address: "0xd3f6f147662bf2943ca09ee16bedaea28ae28788",
    sourceAddress: "0x80ec90e54e577dac8efca30f96bf21fe4efa885d",
    contractType: "transparent-proxy",
    adminAddress: "0x2214926add617fbd6b7634ecb128f0293e0910dd",
    activation: {
      blockNumber: 9_274_615,
      blockHash: "0x87f7f19c58155df0e4a7a5734f1eab24b405a0d2ae5dae224a4950ec6fe1825d",
      blockTimestamp: "2026-05-28T11:25:54Z",
      transactionHash: "0x57a7eb3e3c6ba7a8f2a64d89b3c5c29a16d04ac19fbc68b2c259ece64c320b97",
    },
    addressCodeSha256: "9660bebfd07bceee60f78aff8edb6a3ce227e75756d7cf24bcf2f0d6bd7f5f16",
    implementationCodeSha256: "c646ab923e842caadf4cf55640455a84e64a6ac87589160a73371fc2e9bd23c8",
    explorerVerification: { isVerified: true, isFullyVerified: true, isPartiallyVerified: false },
    creationExecutableSha256: "668edf2e28798bccb7d519b148e6ede5fda0743a956bb0bd5a4c74169db3c192",
    runtimeExecutableSha256: "45533af72b382be3a28e8fd683613f0672aed1d734ee113f77d36b8c572831dd",
    immutableSubstitutions: 1,
  },
] as const;

type Json = Record<string, unknown>;
interface EvidenceCoordinate {
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  transactionHash: string;
  logIndex?: number;
  blockEvidenceMethod: string;
}
interface ImplementationHistoryEntry {
  implementationAddress: string;
  effectiveFrom: EvidenceCoordinate;
  effectiveUntilExclusive: EvidenceCoordinate | null;
}
interface ResolvedUpgrade {
  implementationAddress: string;
  effectiveFrom: EvidenceCoordinate & { logIndex: number };
  previousBlockNumber: number;
  implementationBefore: string;
  implementationAt: string;
  source: Json;
}
const fail = (message: string): never => {
  throw new Error(message);
};
const object = (value: unknown, label: string): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as Json;
};
const array = (value: unknown, label: string): Json[] => {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value as Json[];
};
const values = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) return fail(`${label} must be an array`);
  return value as unknown[];
};
const json = async (path: string): Promise<Json> =>
  JSON.parse(await readFile(path, "utf8")) as Json;
const writeJson = async (path: string, value: unknown): Promise<void> =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
};
const semanticAbiDigest = (abi: unknown[]): string =>
  sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));

const normalizedAddress = (value: unknown, label: string): string => {
  if (typeof value !== "string") return fail(`${label} must be an address`);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return fail(`${label} must be an address`);
  return value.toLowerCase();
};
const normalizedHash = (value: unknown, label: string): string => {
  if (typeof value !== "string") return fail(`${label} must be a hash`);
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) return fail(`${label} must be a hash`);
  return value.toLowerCase();
};
const safeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number") return fail(`${label} must be a non-negative safe integer`);
  if (!Number.isSafeInteger(value) || value < 0)
    return fail(`${label} must be a non-negative safe integer`);
  return value;
};
const sha256Hex = (value: unknown, label: string): string => {
  if (typeof value !== "string") return fail(`${label} must be hex bytes`);
  if (!/^0x(?:[a-fA-F0-9]{2})*$/.test(value)) return fail(`${label} must be hex bytes`);
  return sha256(Buffer.from(value.slice(2), "hex"));
};

const sourceArtifactByPath = new Map<string, Json>();
const rememberSourceArtifact = (path: string, raw: string): void => {
  sourceArtifactByPath.set(path, { sourceId, path, sha256: sha256(raw) });
};
const explorerContractCache = new Map<
  string,
  Promise<{ path: string; raw: string; value: Json }>
>();
const explorerContract = async (
  address: string,
): Promise<{ path: string; raw: string; value: Json }> => {
  const normalized = normalizedAddress(address, "explorer contract address");
  const cached = explorerContractCache.get(normalized);
  if (cached) return cached;
  const request = (async () => {
    const path = `api/v2/smart-contracts/${normalized}`;
    const endpoint = `${explorerBase}/${path}`;
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
    const raw = await response.text();
    if (!response.ok) fail(`${endpoint} returned HTTP ${response.status}`);
    const value = object(JSON.parse(raw), endpoint);
    rememberSourceArtifact(path, raw);
    return { path, raw, value };
  })();
  explorerContractCache.set(normalized, request);
  return request;
};
const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    if (response.ok) {
      const payload = object(JSON.parse(raw), `${method} response`);
      if (payload.error !== undefined) fail(`${method} returned ${JSON.stringify(payload.error)}`);
      return payload.result;
    }
    const transient = response.status === 429 || response.status >= 500;
    if (!transient || attempt === 3) fail(`${method} returned HTTP ${response.status}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, (attempt + 1) * 1_000));
  }
  return fail(`${method} exhausted its bounded retry policy`);
};
const storageAddress = (value: unknown, label: string): string => {
  if (typeof value !== "string") return fail(`${label} must be a storage word`);
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) return fail(`${label} must be a storage word`);
  return normalizedAddress(`0x${value.slice(-40)}`, label);
};
const blockAt = async (
  blockNumber: number,
): Promise<{ blockHash: string; blockTimestamp: string }> => {
  const block = object(
    await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]),
    `block ${blockNumber}`,
  );
  const timestamp =
    typeof block.timestamp === "string" ? Number.parseInt(block.timestamp, 16) : Number.NaN;
  if (!Number.isSafeInteger(timestamp)) fail(`block ${blockNumber} timestamp is invalid`);
  return {
    blockHash: normalizedHash(block.hash, `block ${blockNumber} hash`),
    blockTimestamp: new Date(timestamp * 1000).toISOString(),
  };
};

const proxyHistory = async (
  definition: (typeof definitions)[number],
): Promise<{ history: ImplementationHistoryEntry[]; historyEvidence: Json }> => {
  const path = `api/v2/addresses/${definition.address}/logs?topic=${upgradedTopic}`;
  const endpoint = `${explorerBase}/${path}`;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
  const raw = await response.text();
  if (!response.ok) fail(`${endpoint} returned HTTP ${response.status}`);
  const page = object(JSON.parse(raw), `${definition.contractId} upgrade log response`);
  if (page.next_page_params !== null && page.next_page_params !== undefined) {
    fail(`${definition.contractId} upgrade history is paginated; refusing an incomplete import`);
  }
  const items = array(page.items, `${definition.contractId} upgrade logs`);
  if (items.length === 0) fail(`${definition.contractId} proxy has no Upgraded events`);
  rememberSourceArtifact(path, raw);

  const upgrades: ResolvedUpgrade[] = [];
  for (const [itemIndex, item] of items.entries()) {
    const topics = values(item.topics, `${definition.contractId} upgrade log ${itemIndex} topics`);
    if (topics[0] !== upgradedTopic) {
      fail(`${definition.contractId} upgrade log ${itemIndex} has invalid topics`);
    }
    const implementationTopic =
      typeof topics[1] === "string"
        ? topics[1]
        : fail(`${definition.contractId} upgrade log ${itemIndex} has invalid topics`);
    const blockNumber = safeInteger(item.block_number, `${definition.contractId} upgrade block`);
    const logIndex = safeInteger(item.index, `${definition.contractId} upgrade log index`);
    const implementationAddress = normalizedAddress(
      `0x${implementationTopic.slice(-40)}`,
      `${definition.contractId} upgrade implementation`,
    );
    const transactionHash = normalizedHash(
      item.transaction_hash ?? item.tx_hash,
      `${definition.contractId} upgrade transaction`,
    );
    const { blockHash, blockTimestamp } = await blockAt(blockNumber);
    if (
      normalizedHash(item.block_hash, `${definition.contractId} explorer upgrade block hash`) !==
      blockHash
    ) {
      fail(`${definition.contractId} explorer and RPC upgrade block hashes differ`);
    }
    const previousBlockNumber = blockNumber - 1;
    const beforeWord = await rpc("eth_getStorageAt", [
      definition.address,
      implementationSlot,
      `0x${previousBlockNumber.toString(16)}`,
    ]);
    const atWord = await rpc("eth_getStorageAt", [
      definition.address,
      implementationSlot,
      `0x${blockNumber.toString(16)}`,
    ]);
    const contractCapture = await explorerContract(implementationAddress);
    const implementationBefore = storageAddress(
      beforeWord,
      `${definition.contractId} implementation before block ${blockNumber}`,
    );
    const implementationAt = storageAddress(
      atWord,
      `${definition.contractId} implementation at block ${blockNumber}`,
    );
    if (implementationAt !== implementationAddress)
      fail(
        `${definition.contractId} upgrade event and implementation slot differ at block ${blockNumber}`,
      );
    const contract = contractCapture.value;
    if (contract.name !== definition.sourceContractName)
      fail(`${definition.contractId} generation ${implementationAddress} explorer name drifted`);
    if (
      contract.is_verified !== true ||
      contract.is_fully_verified !== true ||
      contract.is_partially_verified !== false
    ) {
      fail(
        `${definition.contractId} generation ${implementationAddress} is not fully explorer-verified`,
      );
    }
    upgrades.push({
      implementationAddress,
      effectiveFrom: {
        blockNumber,
        blockHash,
        blockTimestamp,
        transactionHash,
        logIndex,
        blockEvidenceMethod:
          "official explorer Upgraded log, eth_getBlockByNumber, and before/after eth_getStorageAt",
      },
      previousBlockNumber,
      implementationBefore,
      implementationAt,
      source: {
        implementationAddress,
        name: contract.name,
        filePath: contract.file_path,
        compilerVersion: contract.compiler_version,
        isVerified: contract.is_verified,
        isFullyVerified: contract.is_fully_verified,
        isPartiallyVerified: contract.is_partially_verified,
        isChangedBytecode: contract.is_changed_bytecode,
        abiEntries: Array.isArray(contract.abi) ? contract.abi.length : 0,
        sourceArtifact: { path: contractCapture.path, sha256: sha256(contractCapture.raw) },
        executableReproduction:
          implementationAddress === definition.sourceAddress
            ? "exact-current-generation"
            : "not-reproduced-historical-generation",
      },
    });
  }
  upgrades.sort(
    (left, right) =>
      left.effectiveFrom.blockNumber - right.effectiveFrom.blockNumber ||
      left.effectiveFrom.logIndex - right.effectiveFrom.logIndex,
  );
  for (let index = 0; index < upgrades.length; index += 1) {
    const expectedBefore =
      index === 0
        ? "0x0000000000000000000000000000000000000000"
        : upgrades[index - 1]?.implementationAddress;
    if (upgrades[index]?.implementationBefore !== expectedBefore)
      fail(`${definition.contractId} implementation slot boundary ${index} is discontinuous`);
  }
  const first = upgrades[0] ?? fail(`${definition.contractId} upgrade history is empty`);
  const last = upgrades.at(-1) ?? fail(`${definition.contractId} upgrade history is empty`);
  if (
    first.effectiveFrom.blockNumber !== definition.activation.blockNumber ||
    first.effectiveFrom.blockHash !== definition.activation.blockHash ||
    first.effectiveFrom.transactionHash !== definition.activation.transactionHash
  ) {
    fail(`${definition.contractId} first upgrade differs from pinned proxy activation`);
  }
  if (last.implementationAddress !== definition.sourceAddress)
    fail(`${definition.contractId} latest implementation differs from the reproduced source`);
  const history = upgrades.map((upgrade, index): ImplementationHistoryEntry => ({
    implementationAddress: upgrade.implementationAddress,
    effectiveFrom: upgrade.effectiveFrom,
    effectiveUntilExclusive: upgrades[index + 1]?.effectiveFrom ?? null,
  }));
  return {
    history,
    historyEvidence: {
      eventTopic: upgradedTopic,
      eventSourceArtifact: { path, sha256: sha256(raw) },
      observedEventCount: upgrades.length,
      slotBoundaries: upgrades.map(
        ({ effectiveFrom, previousBlockNumber, implementationBefore, implementationAt }) => ({
          blockNumber: effectiveFrom.blockNumber,
          previousBlockNumber,
          implementationBefore,
          implementationAt,
        }),
      ),
      generationSources: upgrades.map(({ source }) => source),
      historicalGenerationPolicy:
        "Resolve the implementation by the requested coordinate; use the latest verified generation for present operations, while retaining closed historical ranges for replay and audit.",
    },
  };
};

const deploymentRecords: Json[] = [];
const abiRecords: Json[] = [];
const observations: Json[] = [];

for (const definition of definitions) {
  const currentSourceCapture = await explorerContract(definition.sourceAddress);
  const source = currentSourceCapture.value;
  const raw = currentSourceCapture.raw;
  if (source.name !== definition.sourceContractName)
    fail(`${definition.contractId} explorer name drifted`);
  const sourceAbi = Array.isArray(source.abi)
    ? source.abi
    : fail(`${definition.contractId} ABI is missing`);
  if (sourceAbi.length === 0) fail(`${definition.contractId} ABI is missing`);
  const verification = definition.explorerVerification;
  if (
    source.is_verified !== verification.isVerified ||
    source.is_fully_verified !== verification.isFullyVerified ||
    source.is_partially_verified !== verification.isPartiallyVerified
  ) {
    fail(`${definition.contractId} explorer verification label drifted`);
  }

  const artifactRelativePath = `artifacts/abis/${definition.contractId.replaceAll(".", "/")}.json`;
  const artifactPath = join(contractsDirectory, artifactRelativePath);
  const artifactOutput = `${JSON.stringify(sourceAbi, null, 2)}\n`;
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, artifactOutput, "utf8");
  const abiSemanticSha256 = semanticAbiDigest(sourceAbi);
  const compilerSettingsSha256 = sha256(
    JSON.stringify(canonicalize(source.compiler_settings ?? {})),
  );
  const librariesSha256 = sha256(JSON.stringify(canonicalize(source.external_libraries ?? [])));
  const sourceBundle = {
    filePath: source.file_path,
    sourceCode: source.source_code,
    additionalSources: [...((source.additional_sources as unknown[]) ?? [])].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  };
  const sourceBundleSha256 = sha256(JSON.stringify(canonicalize(sourceBundle)));
  const sourceArtifactPath = currentSourceCapture.path;

  const deploymentId = `${definition.contractId}@mezo-mainnet`;
  const observationId = `observe-${definition.contractId.replaceAll(".", "-")}-mezo-mainnet`;
  const evidenceReference = {
    moduleId: "contracts",
    resourceId: evidenceResourceId,
    recordId: observationId,
  };
  let activation: EvidenceCoordinate = {
    ...definition.activation,
    blockEvidenceMethod: "official explorer creation transaction and eth_getBlockByNumber",
  };
  let currentCodeFrom = activation;
  let proxy: Json | null = null;
  let observationProxy: Json | null = null;
  if (definition.contractType === "transparent-proxy") {
    const resolvedHistory = await proxyHistory(definition);
    activation =
      resolvedHistory.history[0]?.effectiveFrom ??
      fail(`${definition.contractId} proxy history is empty`);
    currentCodeFrom =
      resolvedHistory.history.at(-1)?.effectiveFrom ??
      fail(`${definition.contractId} proxy history is empty`);
    proxy = {
      standard: "eip-1967-transparent",
      implementationSlot,
      adminSlot,
      adminAddress: definition.adminAddress,
      currentImplementationAddress: definition.sourceAddress,
      implementationHistory: resolvedHistory.history,
    };
    observationProxy = { ...proxy, historyEvidence: resolvedHistory.historyEvidence };
  }
  const fixedBlockTag = `0x${fixedBlock.number.toString(16)}`;
  const addressCode = await rpc("eth_getCode", [definition.address, fixedBlockTag]);
  const implementationCode = proxy
    ? await rpc("eth_getCode", [definition.sourceAddress, fixedBlockTag])
    : null;
  if (
    sha256Hex(addressCode, `${definition.contractId} address code`) !== definition.addressCodeSha256
  ) {
    fail(`${definition.contractId} address code digest drifted`);
  }
  if (proxy) {
    if (
      sha256Hex(implementationCode, `${definition.contractId} implementation code`) !==
      definition.implementationCodeSha256
    ) {
      fail(`${definition.contractId} implementation code digest drifted`);
    }
    const implementationWord = await rpc("eth_getStorageAt", [
      definition.address,
      implementationSlot,
      fixedBlockTag,
    ]);
    const adminWord = await rpc("eth_getStorageAt", [definition.address, adminSlot, fixedBlockTag]);
    if (
      storageAddress(implementationWord, `${definition.contractId} fixed implementation`) !==
      definition.sourceAddress
    ) {
      fail(`${definition.contractId} fixed-block implementation drifted`);
    }
    if (
      storageAddress(adminWord, `${definition.contractId} fixed admin`) !== definition.adminAddress
    ) {
      fail(`${definition.contractId} fixed-block admin drifted`);
    }
  }
  const comparison = {
    creationExecutableExact: true,
    runtimeExecutableExactAfterImmutableSubstitution: true,
    immutableSubstitutions: definition.immutableSubstitutions,
    creationExecutableSha256: definition.creationExecutableSha256,
    runtimeExecutableSha256: definition.runtimeExecutableSha256,
    explorerFullRuntimeSha256: definition.implementationCodeSha256 ?? definition.addressCodeSha256,
    fullExact: definition.contractId === "lending.musdc-btc-oracle",
  };
  const provenance = {
    explorerVerification: verification,
    sourceBundleSha256,
    compilerVersion: String(source.compiler_version),
    compilerSettingsSha256,
    librariesSha256,
    buildProcedure:
      "Fetch the official explorer bundle, create an isolated Foundry project with scripts/reproduce-explorer-contract.ts, compile with the exact explorer compiler/settings, compare executable bytes with scripts/compare-explorer-build.ts, and compare the ABI semantically.",
    creationExecutableMatch: true,
    runtimeExecutableMatch: true,
    fullBytecodeDifference: comparison.fullExact
      ? "Full implementation bytecode matches."
      : "Executable bytes match after immutable substitution where applicable; full runtime bytes may differ only in Solidity metadata.",
    abiDerivedFromExactBuild: true,
    activationHistoryReference: evidenceReference,
  };
  const runtime = {
    observedAt: verifiedAt,
    blockNumber: fixedBlock.number,
    blockHash: fixedBlock.hash,
    addressCodeSha256: definition.addressCodeSha256,
    implementationCodeSha256: definition.implementationCodeSha256,
    artifactBytecodeComparison: comparison,
  };

  observations.push({
    id: observationId,
    deploymentId,
    networkId: "mezo-mainnet",
    observedAt: verifiedAt,
    observationBlock: fixedBlock,
    methods: [
      "official explorer creation transaction",
      "eth_getBlockByNumber",
      "eth_getCode",
      ...(proxy ? ["eth_getStorageAt EIP-1967 slots"] : []),
      "official explorer source/ABI",
      "isolated exact-compiler Foundry reproduction",
    ],
    activation,
    runtime,
    proxy: observationProxy,
    explorer: {
      activeContract: {
        name: source.name,
        filePath: source.file_path,
        isVerified: source.is_verified,
        isFullyVerified: source.is_fully_verified,
        isPartiallyVerified: source.is_partially_verified,
        compilerVersion: source.compiler_version,
        proxyType: null,
        abiEntries: sourceAbi.length,
        abiSemanticSha256,
        deployedBytecodeSha256: definition.implementationCodeSha256 ?? definition.addressCodeSha256,
      },
      reproducedAbiMatch: true,
      rpcBytecodeMatch: true,
    },
    reproduction: provenance,
    outcome: "passed",
  });

  deploymentRecords.push({
    id: deploymentId,
    contractId: definition.contractId,
    contractName: definition.contractName,
    sourceContractName: definition.sourceContractName,
    protocol: definition.protocol,
    domains: definition.domains,
    networkId: "mezo-mainnet",
    environment: "mainnet",
    address: definition.address,
    provenanceClass: "deployed-executable-reproduction",
    contractType: definition.contractType,
    validity: { deploymentFrom: activation, currentCodeFrom, effectiveUntilExclusive: null },
    proxy,
    abi: {
      catalogReference: {
        moduleId: "contracts",
        resourceId: "contract-abis",
        recordId: definition.contractId,
      },
      appliesTo: proxy ? "current-implementation-through-proxy" : "deployment",
    },
    source: {
      sourceReference: {
        moduleId: "contracts",
        resourceId: "contract-sources",
        recordId: sourceId,
      },
      artifactPath: sourceArtifactPath,
      declaredImplementationAddress: proxy ? definition.sourceAddress : null,
    },
    runtime,
    provenanceEvidence: { reproduction: provenance },
    evidenceReference,
    status: "verified-current",
    supportStatus: definition.registryAccepted ? "supported" : "proposed",
    reviewStatus: definition.registryAccepted ? "accepted" : "pending-qualified-review",
    limitations: [
      definition.registryAccepted
        ? "This identity and ABI are accepted for bounded Contract registry use; that acceptance creates no reader, writer, route, market, vault, or product support."
        : "This identity is proposed and pending qualified Level 3 review; it creates no reader, writer, route, market, vault, or product support.",
      "Executable reproduction proves byte correspondence and semantic ABI equality but not source authorship, repository history, audit coverage, or current operation safety.",
      ...(proxy
        ? [
            "Present operations resolve to the latest verified implementation at the requested coordinate. Historical proxy generations remain closed, queryable ranges; only the current generation has a canonical ABI and exact executable reproduction in this packet.",
          ]
        : []),
      "An open validity range means no later code change was observed through the evidence block, not that the deployment or governed state is immutable.",
    ],
  });

  abiRecords.push({
    id: definition.contractId,
    contractId: definition.contractId,
    provenanceClass: "deployed-executable-reproduction",
    intendedNetworkIds: ["mezo-mainnet"],
    artifactReference: { moduleId: "contracts", resourceId: `abi.${definition.contractId}` },
    entryCount: sourceAbi.length,
    fileSha256: sha256(artifactOutput),
    abiSha256: sha256(JSON.stringify(canonicalize(sourceAbi))),
    abiSemanticSha256,
    sourceReference: { moduleId: "contracts", resourceId: "contract-sources", recordId: sourceId },
    sourceArtifacts: [{ networkId: "mezo-mainnet", path: sourceArtifactPath, sha256: sha256(raw) }],
    status: "verified",
    supportStatus: definition.registryAccepted ? "supported" : "proposed",
    reviewStatus: definition.registryAccepted ? "accepted" : "pending-qualified-review",
    limitations: [
      "The full ABI applies only to the recorded current direct deployment or implementation generation on Mezo Mainnet.",
      definition.registryAccepted
        ? "Qualified Level 3 review accepted this bounded ABI identity; ABI and executable equality still do not establish authorship, audit coverage, writer safety, or protocol support."
        : "ABI and executable equality do not establish authorship, audit coverage, writer safety, or support; qualified Level 3 review remains pending.",
    ],
  });
}

const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceResourceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "accepted",
  verifiedAt,
  reviewAfter,
  scope: { networkIds: ["mezo-mainnet"], deploymentIds: deploymentRecords.map(({ id }) => id) },
  limitations: [
    "Evidence is bounded to the pinned block, official explorer activation/source/ABI responses, complete Upgraded-log histories, historical ERC-1967 slot boundaries, and isolated exact executable reproductions of current generations.",
    "Historical proxy generations retain official explorer source metadata and exact closed ranges but do not gain canonical historical ABIs, executable reproduction, operation support, or an audit claim from this packet.",
    "VaultV2 and VaultGauge remain candidates because their official explorer records omit creation input; they are not silently entered through this packet.",
  ],
  registryStatus: null,
  observedFrom: verifiedAt,
  observedThrough: verifiedAt,
  methodology: [
    "Resolve current product topology and stable roots from official docs and on-chain reverse links.",
    "Enumerate every official explorer Upgraded log for each proxy and fail rather than truncate a paginated history.",
    "Pin every upgrade transaction, block/hash/timestamp, and before/after ERC-1967 implementation-slot boundary.",
    "Pin current runtime code and EIP-1967 slots at one fixed block.",
    "Fetch generation-specific official explorer source metadata and the exact source/compiler/ABI bundle for each current implementation.",
    "Compile current generations in isolation with exact compiler settings and compare executable bytes plus ABI semantics.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: 31612,
      blockNumber: fixedBlock.number,
      blockHash: fixedBlock.hash,
      blockTimestamp: fixedBlock.timestamp,
      rpcUrl,
      explorerApiUrl: explorerBase,
    },
  ],
  observations,
};
const evidencePath = join(
  contractsDirectory,
  "evidence",
  "economic-system-contracts-2026-08-23.json",
);
await writeJson(evidencePath, evidence);

const deployments = await json(join(contractsDirectory, "records", "deployments.json"));
const deploymentIds = new Set(deploymentRecords.map(({ id }) => id));
deployments.records = [
  ...array(deployments.records, "deployments.records").filter(({ id }) => !deploymentIds.has(id)),
  ...deploymentRecords,
];
deployments.verifiedAt = verifiedAt;
deployments.reviewAfter = reviewAfter;
const acceptedDeploymentCount = array(deployments.records, "deployments.records").filter(
  ({ supportStatus }) => supportStatus === "supported",
).length;
const proposedDeploymentCount = array(deployments.records, "deployments.records").filter(
  ({ supportStatus }) => supportStatus === "proposed",
).length;
deployments.limitations = [
  "Catalog verification is point-in-time and must be repeated after reviewAfter or before a protocol-sensitive release.",
  "Open deployment ranges mean no supersession was observed at the verification block; they do not assert immutability.",
  `The catalog contains ${acceptedDeploymentCount} supported deployments and ${proposedDeploymentCount} proposed deployments; record-level lifecycle and provenance govern use.`,
];
await writeJson(join(contractsDirectory, "records", "deployments.json"), deployments);

const abis = await json(join(contractsDirectory, "records", "abis.json"));
const abiIds = new Set(abiRecords.map(({ id }) => id));
abis.records = [
  ...array(abis.records, "abis.records").filter(({ id }) => !abiIds.has(id)),
  ...abiRecords,
];
abis.verifiedAt = verifiedAt;
abis.reviewAfter = reviewAfter;
const acceptedAbiCount = array(abis.records, "abis.records").filter(
  ({ supportStatus }) => supportStatus === "supported",
).length;
const proposedAbiCount = array(abis.records, "abis.records").filter(
  ({ supportStatus }) => supportStatus === "proposed",
).length;
abis.limitations = [
  "Each artifact is the current implementation/deployment ABI for the verified generation, not a historical implementation catalog.",
  "ABI support is limited to accepted records; proposed records remain pending qualified review and create no public capability.",
  `The catalog contains ${acceptedAbiCount} supported ABIs and ${proposedAbiCount} proposed ABIs; record-level lifecycle and provenance govern use.`,
];
await writeJson(join(contractsDirectory, "records", "abis.json"), abis);

const sources = await json(join(contractsDirectory, "sources", "catalog.json"));
sources.sources = [
  ...array(sources.sources, "sources.sources").filter(({ id }) => id !== sourceId),
  {
    id: sourceId,
    kind: "on-chain-explorer-executable-reproduction",
    reference: { moduleId: "contracts", resourceId: evidenceResourceId },
    sha256: sha256(await readFile(evidencePath)),
    retrievedAt: verifiedAt,
    endpoints: [explorerBase, rpcUrl],
    note: "Official explorer activation/source/ABI captures, complete proxy upgrade histories with historical ERC-1967 slot boundaries, fixed-block code/proxy evidence, and exact isolated executable reproductions for the six current Savings/mUSDC-lending/USDC-vault roots.",
  },
];
sources.sourceArtifacts = [
  ...array(sources.sourceArtifacts, "sources.sourceArtifacts").filter(
    ({ sourceId: id }) => id !== sourceId,
  ),
  ...sourceArtifactByPath.values(),
];
const sourceScope = object(sources.scope, "sources.scope");
sourceScope.sourceIds = [
  ...((sourceScope.sourceIds as unknown[]) ?? []).filter((id) => id !== sourceId),
  sourceId,
];
sources.verifiedAt = verifiedAt;
sources.reviewAfter = reviewAfter;
await writeJson(join(contractsDirectory, "sources", "catalog.json"), sources);

const index = await json(join(contractsDirectory, "index.json"));
const indexScope = object(index.scope, "index.scope");
indexScope.contractIds = [
  ...((indexScope.contractIds as unknown[]) ?? []).filter((id) => !abiIds.has(id)),
  ...abiRecords.map(({ id }) => id),
];
const resources = array(index.resources, "index.resources");
for (const resource of resources) {
  if (resource.id === "contract-deployments")
    resource.recordIds = array(deployments.records, "deployments.records").map(({ id }) => id);
  if (resource.id === "contract-abis")
    resource.recordIds = array(abis.records, "abis.records").map(({ id }) => id);
  if (resource.id === "contract-sources")
    resource.recordIds = array(sources.sources, "sources.sources").map(({ id }) => id);
  if (resource.id === "contract-reference")
    resource.generatedFrom = [
      ...((resource.generatedFrom as Json[]) ?? []).filter(
        ({ resourceId }) => resourceId !== evidenceResourceId,
      ),
      { moduleId: "contracts", resourceId: evidenceResourceId },
    ];
}
index.resources = [
  ...resources.filter(
    ({ id }) => id !== evidenceResourceId && !abiIds.has(String(id).replace(/^abi\./, "")),
  ),
  {
    id: evidenceResourceId,
    role: "evidence",
    kind: "contract-observation-set",
    path: "evidence/economic-system-contracts-2026-08-23.json",
    recordIds: observations.map(({ id }) => id),
    recordCollectionPointer: "/observations",
  },
  ...abiRecords.map(({ id }) => ({
    id: `abi.${String(id)}`,
    role: "artifact",
    kind: "contract-abi",
    path: `artifacts/abis/${String(id).replaceAll(".", "/")}.json`,
  })),
];
index.verifiedAt = verifiedAt;
index.reviewAfter = reviewAfter;
index.limitations = [
  "Open validity ranges and current implementation/deployment ABIs require re-verification after upgrades or the review window.",
  "Proposed records do not create reader, writer, route, protocol, market, vault, or product support.",
  `MDK registry support covers ${acceptedAbiCount} accepted Contract identities/ABIs and ${acceptedDeploymentCount} supported deployments; ${proposedAbiCount} identities/ABIs and ${proposedDeploymentCount} deployments remain proposed and pending qualified review.`,
];
await writeJson(join(contractsDirectory, "index.json"), index);

process.stdout.write(
  JSON.stringify(
    {
      contractIds: abiRecords.map(({ id }) => id),
      deployments: array(deployments.records, "deployments.records").length,
      abis: array(abis.records, "abis.records").length,
    },
    null,
    2,
  ) + "\n",
);
