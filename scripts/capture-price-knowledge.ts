import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { object, objects, parseJson, text, type JsonObject } from "./lib/json.ts";

import { parseEvidenceArguments } from "./lib/evidence-scope.ts";

const { network: selectedNetwork, paths } = parseEvidenceArguments(process.argv.slice(2), 4);
const [outputPath, documentationRepository, clientRepository, pythRepository] = paths;
if (!outputPath || !documentationRepository || !clientRepository || !pythRepository) {
  throw new Error(
    "usage: node scripts/capture-price-knowledge.ts <output-json> <official-documentation-repository> <official-mezod-repository> <official-pyth-crosschain-repository> [--network mezo-mainnet|mezo-testnet]",
  );
}

const execFileAsync = promisify(execFile);
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const skipAddress = "0x7b7c000000000000000000000000000000000015";
const pythAddress = "0x2880ab155794e7179c9ee2e38200202908c17b43";
const btcUsdFeedId = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const musdUsdFeedId = "0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de";
const previousPythImplementation = "0xa2aa501b19aff244d90cc15a4cf739d2725b5729";
const staleSelector = "0x19abf40e";
const liveClientTag = "v12.0.0";
const currentPythVersion = "1.4.6";
const pythReleaseCommit = "d657d97eddaeb8984ee197fc60349dc176d98787";
const upgradedTopic = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";

const networks = [
  {
    id: "mezo-mainnet",
    chainId: 31_612,
    rpcUrl: "https://mezo-mainnet.boar.network",
    explorerApiUrl: "https://api.explorer.mezo.org",
    musdPriceFeed: "0xc5ac5a8892230e0a3e1c473881a2de7353ffca88",
    providerUpgradedPythAddress: "0x5d289ad1ce59fcc25b6892e7a303dfff3a9f7167",
  },
  {
    id: "mezo-testnet",
    chainId: 31_611,
    rpcUrl: "https://rpc.test.mezo.org",
    explorerApiUrl: "https://api.explorer.test.mezo.org",
    musdPriceFeed: "0x86bcf0841622a5dac14a313a15f96a95421b9366",
    providerUpgradedPythAddress: "0x933adec2c7624b11e4b2b80ace15bf9a71a31315",
  },
].filter((network) => selectedNetwork === undefined || network.id === selectedNetwork);

const capturedAt = new Date().toISOString();
const observations: Record<string, unknown> = {};
for (const network of networks) {
  const rpc = createRpcClient(network.rpcUrl);
  const chainId = numberFromHex(text(await rpc.call("eth_chainId", []), "chain ID"));
  assert(chainId === network.chainId, `${network.id} chain ID changed to ${chainId}`);
  const block = normalizeBlock(await rpc.call("eth_getBlockByNumber", ["latest", false]));
  const blockTag = `0x${block.number.toString(16)}`;
  const pythAddressMetadata = await captureExplorerAddress(network.explorerApiUrl, pythAddress);
  const pythCreationTransaction = await captureExplorerTransaction(
    network.explorerApiUrl,
    pythAddressMetadata.creationTransactionHash,
  );
  const pythActivationBlock = await captureExplorerBlock(
    network.explorerApiUrl,
    pythCreationTransaction.blockNumber,
  );
  const skipActivationHeight = network.id === "mezo-mainnet" ? 1 : 2_213_000;
  const skipActivationBlock = await captureExplorerBlock(
    network.explorerApiUrl,
    skipActivationHeight,
  );
  const [
    priceFeedCodeValue,
    skipCodeValue,
    pythCodeValue,
    pythImplementationWordValue,
    oracleRawValue,
    protocolPriceRawValue,
    targetDigitsRawValue,
    skipDecimalsRawValue,
    skipRoundRawValue,
    skipDescription,
  ] = await Promise.all([
    rpc.call("eth_getCode", [network.musdPriceFeed, blockTag]),
    rpc.call("eth_getCode", [skipAddress, blockTag]),
    rpc.call("eth_getCode", [pythAddress, blockTag]),
    rpc.call("eth_getStorageAt", [pythAddress, implementationSlot, blockTag]),
    rpc.call("eth_call", [{ to: network.musdPriceFeed, data: "0x7dc0d1d0" }, blockTag]),
    rpc.call("eth_call", [{ to: network.musdPriceFeed, data: "0x0fdb11cf" }, blockTag]),
    rpc.call("eth_call", [{ to: network.musdPriceFeed, data: "0x1be5c92f" }, blockTag]),
    rpc.call("eth_call", [{ to: skipAddress, data: "0x313ce567" }, blockTag]),
    rpc.call("eth_call", [{ to: skipAddress, data: "0xfeaf968c" }, blockTag]),
    rpc.tryCall("eth_call", [{ to: skipAddress, data: "0x7284e416" }, blockTag]),
  ]);
  const priceFeedCode = text(priceFeedCodeValue, `${network.id} MUSD price-feed code`);
  const skipCode = text(skipCodeValue, `${network.id} Skip code`);
  const pythCode = text(pythCodeValue, `${network.id} Pyth code`);
  const pythImplementationWord = text(
    pythImplementationWordValue,
    `${network.id} Pyth implementation slot`,
  );
  const oracleRaw = text(oracleRawValue, `${network.id} oracle result`);
  const protocolPriceRaw = text(protocolPriceRawValue, `${network.id} protocol price`);
  const targetDigitsRaw = text(targetDigitsRawValue, `${network.id} target digits`);
  const skipDecimalsRaw = text(skipDecimalsRawValue, `${network.id} Skip decimals`);
  const skipRoundRaw = text(skipRoundRawValue, `${network.id} Skip round`);

  const observedPythImplementation = storageAddress(pythImplementationWord);
  assert(
    observedPythImplementation !== "0x0000000000000000000000000000000000000000",
    `${network.id} Pyth implementation slot is empty`,
  );
  const oracle = wordAddress(oracleRaw);
  assert(oracle === skipAddress, `${network.id} MUSD oracle changed to ${oracle}`);

  const providerUpgradedPythSlotValue = await rpc.call("eth_getStorageAt", [
    network.providerUpgradedPythAddress,
    implementationSlot,
    blockTag,
  ]);
  const providerUpgradedPythImplementation = storageAddress(
    text(providerUpgradedPythSlotValue, `${network.id} provider-upgraded Pyth implementation slot`),
  );
  const [
    pythImplementationCodeValue,
    pythVersionValue,
    providerUpgradedPythCodeValue,
    providerUpgradedPythImplementationCodeValue,
    providerUpgradedPythVersionValue,
    pythImplementationHistory,
  ] = await Promise.all([
    rpc.call("eth_getCode", [observedPythImplementation, blockTag]),
    rpc.call("eth_call", [{ to: pythAddress, data: "0x54fd4d50" }, blockTag]),
    rpc.call("eth_getCode", [network.providerUpgradedPythAddress, blockTag]),
    rpc.call("eth_getCode", [providerUpgradedPythImplementation, blockTag]),
    rpc.call("eth_call", [
      { to: network.providerUpgradedPythAddress, data: "0x54fd4d50" },
      blockTag,
    ]),
    captureProxyHistory(network.explorerApiUrl, rpc, block.number),
  ]);
  const pythImplementationCode = text(
    pythImplementationCodeValue,
    `${network.id} Pyth implementation code`,
  );
  const pythVersion = decodeAbiString(text(pythVersionValue, `${network.id} Pyth version`));
  assert(
    pythVersion === currentPythVersion,
    `${network.id} Pyth version changed to ${pythVersion}`,
  );
  const latestPythGeneration = pythImplementationHistory.at(-1);
  assert(latestPythGeneration !== undefined, `${network.id} Pyth history is empty`);
  assert(
    latestPythGeneration.implementationAddress === observedPythImplementation,
    `${network.id} Pyth history and implementation slot differ`,
  );

  const pythFeeds: Record<string, unknown> = {};
  for (const [feedId, pair] of [
    [btcUsdFeedId, "BTC/USD"],
    [musdUsdFeedId, "MUSD/USD"],
  ] as const) {
    const fresh = await rpc.tryCall("eth_call", [
      { to: pythAddress, data: pythCall(feedId, 3_600) },
      blockTag,
    ]);
    const diagnostic = await rpc.tryCall("eth_call", [
      { to: pythAddress, data: pythCall(feedId, 1_000_000_000) },
      blockTag,
    ]);
    pythFeeds[pair] = {
      feedId,
      maxAgeSeconds: 3_600,
      freshResult: isRpcFailure(fresh)
        ? normalizeRpcAttempt(fresh)
        : { ok: true, value: decodePythPrice(text(fresh, `${pair} fresh result`)) },
      diagnosticResult: isRpcFailure(diagnostic)
        ? normalizeRpcAttempt(diagnostic)
        : { ok: true, value: decodePythPrice(text(diagnostic, `${pair} diagnostic result`)) },
    };
  }

  const recheckedBlock = normalizeBlock(await rpc.call("eth_getBlockByNumber", [blockTag, false]));
  assert(
    recheckedBlock.number === block.number && recheckedBlock.hash === block.hash,
    `${network.id} observation block changed during capture`,
  );
  observations[network.id] = {
    networkId: network.id,
    chainId,
    rpcUrl: network.rpcUrl,
    explorerApiUrl: network.explorerApiUrl,
    block,
    contracts: {
      musdPriceFeed: {
        address: network.musdPriceFeed,
        codeSha256: bytecodeSha256(priceFeedCode),
        oracle,
        fetchPrice: wordUnsigned(protocolPriceRaw).toString(),
        targetDigits: Number(wordUnsigned(targetDigitsRaw)),
      },
      skipBtcUsd: {
        address: skipAddress,
        codeSha256: bytecodeSha256(skipCode),
        decimals: Number(wordUnsigned(skipDecimalsRaw)),
        latestRoundData: decodeLatestRoundData(skipRoundRaw),
        description: normalizeRpcAttempt(skipDescription),
      },
      pyth: {
        address: pythAddress,
        codeSha256: bytecodeSha256(pythCode),
        implementationSlot,
        implementationSlotValue: pythImplementationWord,
        implementation: observedPythImplementation,
        implementationCodeSha256: bytecodeSha256(pythImplementationCode),
        version: pythVersion,
        implementationHistory: pythImplementationHistory,
        feeds: pythFeeds,
      },
      providerUpgradedPyth: {
        address: network.providerUpgradedPythAddress,
        codeSha256: bytecodeSha256(
          text(providerUpgradedPythCodeValue, `${network.id} provider-upgraded Pyth code`),
        ),
        implementationSlot,
        implementation: providerUpgradedPythImplementation,
        implementationCodeSha256: bytecodeSha256(
          text(
            providerUpgradedPythImplementationCodeValue,
            `${network.id} provider-upgraded Pyth implementation code`,
          ),
        ),
        version: decodeAbiString(
          text(providerUpgradedPythVersionValue, `${network.id} provider-upgraded Pyth version`),
        ),
      },
    },
    activations: {
      skip: {
        kind: network.id === "mezo-mainnet" ? "genesis-first-observable-block" : "hard-fork",
        release: network.id === "mezo-mainnet" ? "mainnet-genesis" : "v0.5.0",
        transactionHash: null,
        block: skipActivationBlock,
      },
      pyth: {
        kind: "contract-creation",
        transactionHash: pythAddressMetadata.creationTransactionHash,
        transaction: pythCreationTransaction,
        block: pythActivationBlock,
      },
    },
  };
}

const explorer: Record<string, unknown> = {};
for (const network of networks) {
  const observation = object(observations[network.id], `${network.id} observation`);
  const contracts = object(observation.contracts, `${network.id} contracts`);
  const pyth = object(contracts.pyth, `${network.id} Pyth contract`);
  const providerUpgradedPyth = object(
    contracts.providerUpgradedPyth,
    `${network.id} provider-upgraded Pyth contract`,
  );
  explorer[network.id] = {
    skip: await captureExplorerContract(network.explorerApiUrl, skipAddress),
    pythProxy: await captureExplorerContract(network.explorerApiUrl, pythAddress),
    pythImplementation: await captureExplorerContract(
      network.explorerApiUrl,
      text(pyth.implementation, `${network.id} Pyth implementation`),
    ),
    providerUpgradedPythProxy: await captureExplorerContract(
      network.explorerApiUrl,
      network.providerUpgradedPythAddress,
    ),
    providerUpgradedPythImplementation: await captureExplorerContract(
      network.explorerApiUrl,
      text(
        providerUpgradedPyth.implementation,
        `${network.id} provider-upgraded Pyth implementation`,
      ),
    ),
  };
}

const documentationPath = "src/content/docs/docs/developers/architecture/oracles/read-oracle.md";
const architecturePath = "src/content/docs/docs/developers/architecture/oracles/index.md";
const clientArtifacts = [
  "precompile/priceoracle/abi.json",
  "precompile/priceoracle/IPriceOracle.sol",
  "precompile/priceoracle/byte_code.go",
  "precompile/priceoracle/price_oracle.go",
  "app/upgrades/v0_5/constants.go",
  "chain/mainnet/mezo_31612-1/genesis.json",
] as const;
const pythArtifacts = [
  "apps/developer-hub/content/docs/price-feeds/core/upgrade/contracts.mdx",
  "apps/developer-hub/content/docs/price-feeds/core/upgrade/preparing/index.mdx",
  "contract_manager/src/store/contracts/EvmPriceFeedContracts.json",
  "target_chains/ethereum/contracts/contracts/pyth/Pyth.sol",
  "target_chains/ethereum/contracts/contracts/pyth/PythUpgradable.sol",
  "target_chains/ethereum/sdk/solidity/abis/IPyth.json",
] as const;
const [
  { stdout: documentationCommit },
  { stdout: clientCommit },
  { stdout: pythCommit },
  { stdout: resolvedPythReleaseCommit },
  documentationBytes,
  architectureBytes,
  ...clientArtifactBytes
] = await Promise.all([
  execFileAsync("git", ["-C", documentationRepository, "rev-parse", "HEAD"]),
  execFileAsync("git", ["-C", clientRepository, "rev-list", "-n", "1", liveClientTag]),
  execFileAsync("git", ["-C", pythRepository, "rev-parse", "HEAD"]),
  execFileAsync("git", ["-C", pythRepository, "rev-parse", pythReleaseCommit]),
  readFile(`${documentationRepository}/${documentationPath}`),
  readFile(`${documentationRepository}/${architecturePath}`),
  ...clientArtifacts.map((path) =>
    execFileAsync("git", ["-C", clientRepository, "show", `${liveClientTag}:${path}`]).then(
      ({ stdout }) => Buffer.from(stdout),
    ),
  ),
]);
const pythArtifactBytes = await Promise.all(
  pythArtifacts.map((path) => readFile(`${pythRepository}/${path}`)),
);
assert(
  resolvedPythReleaseCommit.trim() === pythReleaseCommit,
  "official Pyth 1.4.6 release commit is unavailable",
);

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "price-source-capture",
      networkIds: networks.map(({ id }) => id),
      capturedAt,
      expected: {
        skipAddress,
        pythAddress,
        previousPythImplementation,
        currentPythVersion,
        providerUpgradedPythAddresses: Object.fromEntries(
          networks.map(({ id, providerUpgradedPythAddress }) => [id, providerUpgradedPythAddress]),
        ),
        btcUsdFeedId,
        musdUsdFeedId,
        staleSelector,
      },
      officialDocumentation: {
        repository: "https://github.com/mezo-org/documentation",
        commit: documentationCommit.trim(),
        artifacts: [
          { path: documentationPath, sha256: sha256(documentationBytes) },
          { path: architecturePath, sha256: sha256(architectureBytes) },
        ],
      },
      officialClient: {
        repository: "https://github.com/mezo-org/mezod",
        tag: liveClientTag,
        commit: clientCommit.trim(),
        artifacts: clientArtifacts.map((path, index) => ({
          path,
          sha256: sha256(
            clientArtifactBytes[index] ??
              fail(`missing captured client artifact bytes for ${path}`),
          ),
        })),
      },
      officialPyth: {
        repository: "https://github.com/pyth-network/pyth-crosschain",
        commit: pythCommit.trim(),
        releaseCommit: pythReleaseCommit,
        version: currentPythVersion,
        artifacts: pythArtifacts.map((path, index) => ({
          path,
          sha256: sha256(
            pythArtifactBytes[index] ?? fail(`missing captured Pyth artifact bytes for ${path}`),
          ),
        })),
      },
      observations,
      explorer,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`Captured price knowledge at ${capturedAt} in ${outputPath}.\n`);

async function captureExplorerContract(apiUrl: string, address: string): Promise<JsonObject> {
  const response = await fetch(`${apiUrl}/api/v2/smart-contracts/${address}`);
  const raw = await response.text();
  assert(response.ok, `${apiUrl} explorer returned ${response.status}: ${raw.slice(0, 200)}`);
  const value = object(parseJson(raw, `${address} explorer contract response`), address);
  return {
    address,
    name: value.name ?? null,
    compilerVersion: value.compiler_version ?? null,
    optimizationEnabled: value.optimization_enabled ?? null,
    optimizationRuns: value.optimization_runs ?? null,
    evmVersion: value.evm_version ?? null,
    verifiedAt: value.verified_at ?? null,
    isVerified: value.is_verified ?? false,
    isFullyVerified: value.is_fully_verified ?? false,
    isPartiallyVerified: value.is_partially_verified ?? false,
    language: value.language ?? null,
    licenseType: value.license_type ?? null,
    proxyType: value.proxy_type ?? null,
    implementations: value.implementations ?? [],
    abi: value.abi ?? null,
    sourceCodeSha256: typeof value.source_code === "string" ? sha256(value.source_code) : null,
    additionalSourcesSha256: Array.isArray(value.additional_sources)
      ? sha256(JSON.stringify(value.additional_sources))
      : null,
  };
}

async function captureExplorerAddress(
  apiUrl: string,
  address: string,
): Promise<{ creationTransactionHash: string }> {
  const response = await fetch(`${apiUrl}/api/v2/addresses/${address}`);
  const raw = await response.text();
  assert(
    response.ok,
    `${apiUrl} address endpoint returned ${response.status}: ${raw.slice(0, 200)}`,
  );
  const value = object(parseJson(raw, `${address} explorer address response`), address);
  const creationTransactionHash = text(
    value.creation_transaction_hash ?? value.creation_tx_hash ?? "",
    `${address} creation transaction hash`,
  ).toLowerCase();
  assert(
    /^0x[a-f0-9]{64}$/.test(creationTransactionHash),
    `${address} creation transaction is missing`,
  );
  return { creationTransactionHash };
}

async function captureExplorerTransaction(
  apiUrl: string,
  transactionHash: string,
): Promise<JsonObject & { blockNumber: number }> {
  const response = await fetch(`${apiUrl}/api/v2/transactions/${transactionHash}`);
  const raw = await response.text();
  assert(
    response.ok,
    `${apiUrl} transaction endpoint returned ${response.status}: ${raw.slice(0, 200)}`,
  );
  const value = object(
    parseJson(raw, `${transactionHash} explorer transaction response`),
    transactionHash,
  );
  assert(value.status === "ok", `${transactionHash} did not succeed`);
  assert(
    typeof value.block_number === "number" && Number.isSafeInteger(value.block_number),
    `${transactionHash} block number is missing`,
  );
  const createdContract =
    value.created_contract === null || value.created_contract === undefined
      ? null
      : object(value.created_contract, `${transactionHash} created contract`);
  return {
    transactionHash,
    blockNumber: value.block_number,
    transactionIndex: value.position,
    timestamp: value.timestamp,
    contractAddress: text(
      createdContract?.hash ?? "",
      `${transactionHash} created contract address`,
    ).toLowerCase(),
  };
}

async function captureExplorerBlock(apiUrl: string, blockNumber: number): Promise<JsonObject> {
  const response = await fetch(`${apiUrl}/api/v2/blocks/${blockNumber}`);
  const raw = await response.text();
  assert(response.ok, `${apiUrl} block endpoint returned ${response.status}: ${raw.slice(0, 200)}`);
  const value = object(parseJson(raw, `explorer block ${blockNumber}`), `block ${blockNumber}`);
  assert(value.height === blockNumber, `${blockNumber} explorer block height changed`);
  const hash = text(value.hash ?? "", `${blockNumber} explorer block hash`).toLowerCase();
  assert(/^0x[a-f0-9]{64}$/.test(hash), `${blockNumber} explorer block hash is missing`);
  return {
    number: blockNumber,
    hash,
    timestamp: new Date(text(value.timestamp, `${blockNumber} explorer timestamp`)).toISOString(),
  };
}

interface PythHistoryEntry {
  implementationAddress: string;
  effectiveFrom: JsonObject;
  effectiveUntilExclusive: JsonObject | null;
  implementationBefore: string;
  implementationAt: string;
}

async function captureProxyHistory(
  apiUrl: string,
  rpc: RpcClient,
  observedThroughBlock: number,
): Promise<PythHistoryEntry[]> {
  const url = `${apiUrl}/api/v2/addresses/${pythAddress}/logs?topic=${upgradedTopic}`;
  const response = await fetch(url);
  const raw = await response.text();
  assert(response.ok, `${apiUrl} upgrade-log endpoint returned ${response.status}`);
  const page = object(parseJson(raw, `${apiUrl} Pyth upgrade logs`), "Pyth upgrade logs");
  assert(
    page.next_page_params === null || page.next_page_params === undefined,
    `${apiUrl} Pyth upgrade history is paginated`,
  );
  const logItems = objects(page.items, `${apiUrl} Pyth upgrade log items`);
  assert(logItems.length > 0, `${apiUrl} Pyth upgrade history is empty`);
  const resolved = await Promise.all(
    logItems.map(async (item, itemIndex) => {
      const topics = Array.isArray(item.topics) ? item.topics : fail("upgrade topics are missing");
      assert(topics[0] === upgradedTopic, `Pyth upgrade log ${itemIndex} topic drifted`);
      const implementationTopic = text(
        topics[1],
        `${apiUrl} Pyth upgrade log ${itemIndex} implementation`,
      );
      assert(
        /^0x[a-fA-F0-9]{64}$/.test(implementationTopic),
        `${apiUrl} Pyth upgrade implementation topic is invalid`,
      );
      const implementationAddress = `0x${implementationTopic.slice(-40)}`.toLowerCase();
      const blockNumber = safeInteger(
        item.block_number,
        `${apiUrl} Pyth upgrade log ${itemIndex} block`,
      );
      assert(
        blockNumber <= observedThroughBlock,
        `${apiUrl} Pyth upgrade log is beyond the observation block`,
      );
      const transactionHash = text(
        item.transaction_hash ?? item.tx_hash,
        `${apiUrl} Pyth upgrade log ${itemIndex} transaction`,
      ).toLowerCase();
      assert(
        /^0x[a-f0-9]{64}$/.test(transactionHash),
        `${apiUrl} Pyth upgrade transaction is invalid`,
      );
      const logIndex = safeInteger(item.index, `${apiUrl} Pyth upgrade log ${itemIndex} index`);
      const blockTag = `0x${blockNumber.toString(16)}`;
      const [blockValue, beforeWord, atWord] = await Promise.all([
        rpc.call("eth_getBlockByNumber", [blockTag, false]),
        rpc.call("eth_getStorageAt", [
          pythAddress,
          implementationSlot,
          `0x${(blockNumber - 1).toString(16)}`,
        ]),
        rpc.call("eth_getStorageAt", [pythAddress, implementationSlot, blockTag]),
      ]);
      const block = normalizeBlock(blockValue);
      assert(block.number === blockNumber, `${apiUrl} Pyth upgrade block number drifted`);
      assert(
        block.hash === text(item.block_hash, `${apiUrl} Pyth upgrade block hash`).toLowerCase(),
        `${apiUrl} explorer and RPC Pyth upgrade block hashes differ`,
      );
      const implementationBefore = storageAddress(
        text(beforeWord, `${apiUrl} Pyth implementation before block ${blockNumber}`),
      );
      const implementationAt = storageAddress(
        text(atWord, `${apiUrl} Pyth implementation at block ${blockNumber}`),
      );
      assert(
        implementationAt === implementationAddress,
        `${apiUrl} Pyth upgrade event and implementation slot differ`,
      );
      return {
        implementationAddress,
        effectiveFrom: {
          blockNumber,
          blockHash: block.hash,
          blockTimestamp: block.timestamp,
          transactionHash,
          logIndex,
          blockEvidenceMethod:
            "official explorer Upgraded log plus before/at eth_getStorageAt and eth_getBlockByNumber",
        },
        implementationBefore,
        implementationAt,
      };
    }),
  );
  resolved.sort(
    (left, right) =>
      safeInteger(left.effectiveFrom.blockNumber, "left upgrade block") -
        safeInteger(right.effectiveFrom.blockNumber, "right upgrade block") ||
      safeInteger(left.effectiveFrom.logIndex, "left upgrade log index") -
        safeInteger(right.effectiveFrom.logIndex, "right upgrade log index"),
  );
  assert(
    resolved[0]?.implementationAddress === previousPythImplementation,
    `${apiUrl} initial Pyth implementation changed`,
  );
  for (let index = 1; index < resolved.length; index += 1) {
    assert(
      resolved[index]?.implementationBefore === resolved[index - 1]?.implementationAddress,
      `${apiUrl} Pyth implementation history is discontinuous at index ${index}`,
    );
  }
  return resolved.map((entry, index) => ({
    ...entry,
    effectiveUntilExclusive: resolved[index + 1]?.effectiveFrom ?? null,
  }));
}

interface RpcClient {
  call(method: string, params: unknown[]): Promise<unknown>;
  tryCall(method: string, params: unknown[]): Promise<unknown>;
}

function createRpcClient(url: string): RpcClient {
  let id = 0;
  async function request(method: string, params: unknown[], tolerate: boolean): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      if (!response.ok) {
        const transient = response.status === 429 || response.status >= 500;
        if (transient && attempt < 3) {
          await delay((attempt + 1) * 1_000);
          continue;
        }
        if (tolerate) return { error: { code: response.status, message: raw.slice(0, 500) } };
        throw new Error(`${url} ${method} returned HTTP ${response.status}: ${raw.slice(0, 200)}`);
      }
      const value = object(
        parseJson(raw, `${url} ${method} response`),
        `${url} ${method} response`,
      );
      if (value.error !== undefined && value.error !== null) {
        if (tolerate) return { error: value.error };
        throw new Error(`${url} ${method} failed: ${JSON.stringify(value.error)}`);
      }
      return value.result;
    }
    return fail(`${url} ${method} exhausted its bounded retry policy`);
  }
  return {
    call: (method: string, params: unknown[]) => request(method, params, false),
    tryCall: (method: string, params: unknown[]) => request(method, params, true),
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function normalizeBlock(value: unknown): { number: number; hash: string; timestamp: string } {
  const block = object(value, "RPC block");
  return {
    number: numberFromHex(text(block.number, "RPC block number")),
    hash: text(block.hash, "RPC block hash").toLowerCase(),
    timestamp: new Date(
      numberFromHex(text(block.timestamp, "RPC block timestamp")) * 1_000,
    ).toISOString(),
  };
}

function pythCall(feedId: string, maxAge: number): string {
  return `0xa4ae35e0${feedId.slice(2)}${BigInt(maxAge).toString(16).padStart(64, "0")}`;
}

function decodeLatestRoundData(value: string) {
  const words = wordsFromHex(value, 5);
  return {
    roundId: unsignedWord(wordAt(words, 0)).toString(),
    answer: signedWord(wordAt(words, 1), 256).toString(),
    startedAt: unsignedWord(wordAt(words, 2)).toString(),
    updatedAt: unsignedWord(wordAt(words, 3)).toString(),
    answeredInRound: unsignedWord(wordAt(words, 4)).toString(),
  };
}

function decodePythPrice(value: string) {
  const words = wordsFromHex(value, 4);
  return {
    price: signedWord(wordAt(words, 0), 64).toString(),
    conf: unsignedWord(wordAt(words, 1)).toString(),
    expo: Number(signedWord(wordAt(words, 2), 32)),
    publishTime: unsignedWord(wordAt(words, 3)).toString(),
  };
}

function decodeAbiString(value: string): string {
  assert(/^0x[a-fA-F0-9]+$/.test(value), "invalid ABI string result");
  const hex = value.slice(2);
  assert(hex.length >= 128 && hex.length % 64 === 0, "invalid ABI string result length");
  const offset = Number(unsignedWord(hex.slice(0, 64)));
  assert(offset === 32, `unsupported ABI string offset ${offset}`);
  const length = Number(unsignedWord(hex.slice(64, 128)));
  assert(Number.isSafeInteger(length), "unsafe ABI string length");
  const encoded = hex.slice(128, 128 + length * 2);
  assert(encoded.length === length * 2, "truncated ABI string result");
  return Buffer.from(encoded, "hex").toString("utf8");
}

function wordsFromHex(value: string, count: number): string[] {
  assert(/^0x[a-fA-F0-9]*$/.test(value), "invalid ABI result");
  const hex = value.slice(2);
  assert(hex.length === count * 64, `expected ${count} ABI words, received ${hex.length / 64}`);
  return Array.from({ length: count }, (_, index) => hex.slice(index * 64, (index + 1) * 64));
}

function wordAt(words: readonly string[], index: number): string {
  return words[index] ?? fail(`missing ABI word ${index}`);
}

function wordUnsigned(value: string): bigint {
  const words = wordsFromHex(value, 1);
  return unsignedWord(wordAt(words, 0));
}

function unsignedWord(word: string): bigint {
  return BigInt(`0x${word}`);
}

function signedWord(word: string, bits: number): bigint {
  const mask = (1n << BigInt(bits)) - 1n;
  const value = unsignedWord(word) & mask;
  const sign = 1n << BigInt(bits - 1);
  return value >= sign ? value - (1n << BigInt(bits)) : value;
}

function wordAddress(value: string): string {
  const words = wordsFromHex(value, 1);
  return `0x${wordAt(words, 0).slice(-40)}`.toLowerCase();
}

function storageAddress(value: string): string {
  assert(/^0x[a-fA-F0-9]{64}$/.test(value), "invalid storage word");
  return `0x${value.slice(-40)}`.toLowerCase();
}

function isRpcFailure(value: unknown): value is { error: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    value.error !== null &&
    value.error !== undefined
  );
}

function normalizeRpcAttempt(value: unknown): JsonObject {
  if (!isRpcFailure(value)) return { ok: true, raw: value };
  const error = object(value.error, "RPC error");
  return {
    ok: false,
    error: {
      code: error.code ?? null,
      message: error.message ?? null,
      data: error.data ?? null,
    },
  };
}

function numberFromHex(value: string): number {
  const number = Number.parseInt(value, 16);
  assert(Number.isSafeInteger(number), `unsafe hexadecimal number '${value}'`);
  return number;
}

function safeInteger(value: unknown, label: string): number {
  assert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    `${label} must be a non-negative safe integer`,
  );
  return value;
}

function bytecodeSha256(value: string): string {
  assert(/^0x(?:[a-fA-F0-9]{2})+$/.test(value), "invalid bytecode");
  return sha256(Buffer.from(value.slice(2), "hex"));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
