import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { object, objects, parseJson, text, texts, values, type JsonObject } from "./lib/json.ts";

interface Coordinate extends JsonObject {
  blockNumber: number;
  transactionHash: string;
  logIndex?: number;
  blockHash: string;
  blockTimestamp: string;
  activationKind?: string;
  method?: string;
}
interface CaptureBlock extends JsonObject {
  hash: string;
  timestamp: string;
  error?: unknown;
}
interface CaptureReceipt extends JsonObject {
  status: string;
  blockNumber: string;
  logs: JsonObject[];
  error?: unknown;
}
interface CaptureTransaction extends JsonObject {
  input: string;
  error?: unknown;
}
interface CapturedContract extends JsonObject {
  address: string;
  implementation: string;
  implementationSlot: string;
  adminSlot: string;
  code: string;
  implementationCode: string;
}
interface CaptureNetwork extends JsonObject {
  chainId: number;
  rpcUrl: string;
  clientVersion?: string;
  snapshot: { number: number; hash: string; timestamp: string };
  blocks: Record<number, CaptureBlock>;
  transactions: Record<string, { receipt?: CaptureReceipt; transaction?: CaptureTransaction }>;
  contracts: Record<string, CapturedContract>;
}
interface Capture extends JsonObject {
  capturedAt: string;
  networks: Record<string, CaptureNetwork>;
  precompileUpdateTrace: unknown;
}
interface HistoryEntry extends JsonObject {
  implementationAddress: string;
  effectiveFrom: Coordinate;
  effectiveUntilExclusive: Coordinate | null;
}
interface TraceCall extends JsonObject {
  to?: string;
  input?: string;
  output?: string;
  calls?: TraceCall[];
}
interface AbiRecordArguments {
  contractId: string;
  abi: readonly unknown[];
  abiBytes: Buffer;
  provenanceClass: string;
  intendedNetworkIds: string[];
  sourceId: string;
  sourceArtifacts: JsonObject[];
  limitations: string[];
}
interface UpdateCatalogArguments {
  abiRecords: JsonObject[];
  deploymentRecords: JsonObject[];
  sourceRecords: JsonObject[];
  sourceArtifacts: JsonObject[];
  evidence: JsonObject & { observations: JsonObject[] };
  evidenceSha256: string;
}

const [
  capturePath,
  nttRepository,
  originalNttRepository,
  mezodRepository,
  nativeBridgeStandardInputPath,
  nativeBridgeCompilerOutputPath,
  nativeImplementationExplorerHtmlPath,
  nativeProxyExplorerHtmlPath,
  mezodUpgradeScheduleRepository,
] = process.argv.slice(2);
if (
  !capturePath ||
  !nttRepository ||
  !originalNttRepository ||
  !mezodRepository ||
  !nativeBridgeStandardInputPath ||
  !nativeBridgeCompilerOutputPath ||
  !nativeImplementationExplorerHtmlPath ||
  !nativeProxyExplorerHtmlPath ||
  !mezodUpgradeScheduleRepository
) {
  throw new Error(
    "usage: node scripts/import-bridge-contract-records.ts " +
      "<capture-json> <ntt-repository> <original-ntt-repository> <mezod-repository> " +
      "<native-standard-input> <native-compiler-output> " +
      "<native-implementation-etherscan-html> <native-proxy-etherscan-html> " +
      "<mezod-upgrade-schedule-repository>",
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const evidenceId = "contract-bridge-probes-2026-08-21";
const nttSourceId = "official-ntt-musd-live-deployment";
const originalNttSourceId = "official-ntt-musd-initial-deployments";
const precompileSourceId = "official-mezod-assets-bridge-current";
const upgradeScheduleSourceId = "official-mezod-v13-upgrade-schedule";
const nativeSourceId = "native-bridge-etherscan-executable-reproduction";
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const upgradedTopic = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b";
const zeroWord = `0x${"0".repeat(64)}`;

const capture = await loadJson<Capture>(capturePath);
const nativeStandardInput = await loadJson<JsonObject>(nativeBridgeStandardInputPath);
const nativeCompilerOutput = await loadJson<JsonObject>(nativeBridgeCompilerOutputPath);
const nativeImplementationHtml = await readFile(nativeImplementationExplorerHtmlPath);
const nativeProxyHtml = await readFile(nativeProxyExplorerHtmlPath);
const capturedAt = capture.capturedAt;
assertTimestamp(capturedAt, "capture timestamp");

const contractDefinitions = [
  {
    contractId: "bridge.musd-ntt-manager",
    contractName: "MUSD NTT Manager",
    sourceContractName: "NttManager",
    protocol: "wormhole-ntt",
    domains: ["bridges", "musd", "ntt"],
    provenanceClass: "official-deployment-repository-live-configuration",
    abiFile: "musd-ntt-manager.json",
    factoryPath: "evm/ts/src/ethers-contracts/1_1_0/factories/NttManager__factory.ts",
    factorySha256: "11ecedfda4242865639467c005fdfdcae2a417947b182fbc4a8e9b3759b33044",
    deployments: [
      {
        networkId: "mezo-mainnet",
        address: "0x7efb386675d75280d39aae42964a6776de0ee0bd",
        implementation: "0xd0cbe9be1ab548eb93e5557649b236305874d4d0",
        activationTransaction: "0x417756f53017044576f7d102630be4123bfcf67e363b14873144ae83b2b24269",
        activationBlock: 1579320,
        broadcastSourceId: originalNttSourceId,
        broadcastRepository: originalNttRepository,
        broadcastPath: "musd/mainnet/evm/broadcast/DeployWormholeNtt.s.sol/31612/run-latest.json",
        configurationRecordId: "musd-ntt-mezo-snapshot",
        networkEvidenceRecordId: "mezo-mainnet-snapshot",
      },
      {
        networkId: "ethereum-mainnet",
        address: "0x5293158bf7a81ed05418da497a80f7e6dbf4477e",
        implementation: "0x075108f275ed81c9cfc01065e6e50ceea81d6363",
        activationTransaction: "0xf863849c0eb9c26bd1ae924aa80c0617db77dd1d1d2f99bca8de6f206546cd77",
        activationBlock: 22884633,
        broadcastSourceId: originalNttSourceId,
        broadcastRepository: originalNttRepository,
        broadcastPath: "musd/mainnet/evm/broadcast/DeployWormholeNtt.s.sol/1/run-latest.json",
        configurationRecordId: "musd-ntt-ethereum-snapshot",
        networkEvidenceRecordId: "ethereum-mainnet-snapshot",
      },
      {
        networkId: "base-mainnet",
        address: "0x3eb418bdbe95b4b9cf465ecfbd8424685acd1bc1",
        implementation: "0x7d61512edc44dba19ea9758e9f383547cec38366",
        activationTransaction: "0xff365759a87db9fd9986403436d42cab91a4d39cd838ee080eeab261ceb60212",
        activationBlock: 42181281,
        broadcastSourceId: nttSourceId,
        broadcastRepository: nttRepository,
        broadcastPath: "evm/broadcast/DeployWormholeNtt.s.sol/8453/run-latest.json",
        configurationRecordId: "musd-ntt-base-snapshot",
        networkEvidenceRecordId: "base-mainnet-snapshot",
      },
    ],
  },
  {
    contractId: "bridge.musd-wormhole-transceiver",
    contractName: "MUSD Wormhole Transceiver",
    sourceContractName: "WormholeTransceiver",
    protocol: "wormhole-ntt",
    domains: ["bridges", "musd", "ntt", "wormhole"],
    provenanceClass: "official-deployment-repository-live-configuration",
    abiFile: "musd-wormhole-transceiver.json",
    factoryPath: "evm/ts/src/ethers-contracts/1_1_0/factories/WormholeTransceiver__factory.ts",
    factorySha256: "c15603a88afba883e395fed535a654973c35dbccbefc1783de66be27740421a4",
    deployments: [
      {
        networkId: "mezo-mainnet",
        address: "0x62deeafee06c7442a21c93ededc79a0cb5791c83",
        implementation: "0x867cd4fd99ba3330afa65822c552c0d1247f6115",
        activationTransaction: "0x3e267901cbd981ba81a3ef53fe66d70689ce5a0991e3a5aab0ef310a8b49fb71",
        activationBlock: 7252117,
        broadcastSourceId: nttSourceId,
        broadcastRepository: nttRepository,
        broadcastPath: "evm/broadcast/DeployWormholeTransceiver.s.sol/31612/run-latest.json",
        configurationRecordId: "musd-ntt-mezo-snapshot",
        networkEvidenceRecordId: "mezo-mainnet-snapshot",
      },
      {
        networkId: "ethereum-mainnet",
        address: "0x147379a0174780570d07d70a14fb244ee5f2d786",
        implementation: "0x05bd601c3c381fd3d099dbb574cc39ea5d8b4a69",
        activationTransaction: "0x183d15d9b6b1f9426e98a31678e887f736438b50b3b834ca09e111323f71e203",
        activationBlock: 24584317,
        broadcastSourceId: nttSourceId,
        broadcastRepository: nttRepository,
        broadcastPath: "evm/broadcast/DeployWormholeTransceiver.s.sol/1/run-latest.json",
        configurationRecordId: "musd-ntt-ethereum-snapshot",
        networkEvidenceRecordId: "ethereum-mainnet-snapshot",
      },
      {
        networkId: "base-mainnet",
        address: "0x15c465e7df34f8ca06fdcae0569206cedf3f4467",
        implementation: "0xae52c85f4483e4fb14f7d1dd8ad2aeb12d890cc0",
        activationTransaction: "0x88c949eb49084cb2522de0230a059213d4d271dc2c9977a3696514004d4cabeb",
        activationBlock: 42920697,
        broadcastSourceId: nttSourceId,
        broadcastRepository: nttRepository,
        broadcastPath: "evm/broadcast/DeployWormholeTransceiver.s.sol/8453/run-latest.json",
        configurationRecordId: "musd-ntt-base-snapshot",
        networkEvidenceRecordId: "base-mainnet-snapshot",
      },
    ],
  },
];

const sourceArtifacts: JsonObject[] = [];
const abiRecords: JsonObject[] = [];
const deploymentRecords: JsonObject[] = [];
const observations: JsonObject[] = [];

for (const definition of contractDefinitions) {
  const abiPath = join(contractsDirectory, "artifacts", "abis", "bridge", definition.abiFile);
  const abiBytes = await readFile(abiPath);
  const abi = values(parseJson(abiBytes.toString("utf8"), abiPath), `${definition.contractId} ABI`);
  const factoryBytes = await readFile(join(nttRepository, definition.factoryPath));
  assert(
    sha256(factoryBytes) === definition.factorySha256,
    `${definition.contractId} TypeChain factory digest drifted`,
  );
  sourceArtifacts.push({
    sourceId: nttSourceId,
    path: definition.factoryPath,
    sha256: definition.factorySha256,
  });

  abiRecords.push(
    createAbiRecord({
      contractId: definition.contractId,
      abi,
      abiBytes,
      provenanceClass: definition.provenanceClass,
      intendedNetworkIds: ["mezo-mainnet", "ethereum-mainnet", "base-mainnet"],
      sourceId: nttSourceId,
      sourceArtifacts: [
        {
          networkIds: ["mezo-mainnet", "ethereum-mainnet", "base-mainnet"],
          version: "1.1.0",
          path: definition.factoryPath,
          sha256: definition.factorySha256,
        },
      ],
      limitations: [
        "The full ABI is extracted from the pinned official NTT 1.1.0 TypeChain factory and scoped to the three recorded MUSD deployments.",
        "The ABI and live configuration records are proposed evidence only; they do not establish relayer, quote, route, or writer support.",
      ],
    }),
  );

  for (const deployment of definition.deployments) {
    const network =
      capture.networks[deployment.networkId] ??
      fail(`capture network ${deployment.networkId} is missing`);
    const observed =
      network.contracts[definition.contractId] ??
      fail(`captured contract ${definition.contractId} is missing`);
    assert(observed.address === deployment.address, `${definition.contractId} address drifted`);
    assert(
      observed.implementation === deployment.implementation,
      `${definition.contractId} implementation drifted`,
    );
    assert(
      observed.adminSlot === zeroWord,
      `${definition.contractId} unexpectedly has a proxy admin`,
    );
    const activation = await nttActivation(deployment, network);
    const proxyCodeSha256 = sha256Hex(observed.code);
    const implementationCodeSha256 = sha256Hex(observed.implementationCode);
    const deploymentId = `${definition.contractId}@${deployment.networkId}`;
    const observationId = `observe-${definition.contractId.replaceAll(".", "-")}-${deployment.networkId}`;
    const history = [
      {
        implementationAddress: deployment.implementation,
        effectiveFrom: activation,
        effectiveUntilExclusive: null,
      },
    ];
    const proxy = {
      standard: "eip-1967-uups",
      implementationSlot,
      adminSlot: null,
      adminAddress: null,
      currentImplementationAddress: deployment.implementation,
      implementationHistory: history,
    };
    const provenanceEvidence = {
      liveConfiguration: {
        deploymentRepository: "https://github.com/mezo-org/ntt-bridge-musd-mainnet",
        commit: "8742584991b5f4d1ee63ff10fad8d833a460526c",
        deploymentArtifactPath: "deployment.json",
        deploymentArtifactSha256:
          "826fbb0694a3e78e624b7e8532d739ccefb14dfd8d2f4e96dc22a56d930a1909",
        configurationReference: {
          moduleId: "workflows/bridges",
          resourceId: "bridge-musd-ntt-evidence",
          recordId: deployment.configurationRecordId,
        },
        activationHistoryReference: {
          moduleId: "contracts",
          resourceId: evidenceId,
          recordId: observationId,
        },
        networkEvidenceReference: {
          moduleId: "workflows/bridges",
          resourceId: "bridge-musd-ntt-evidence",
          recordId: deployment.networkEvidenceRecordId,
        },
      },
    };

    observations.push({
      id: observationId,
      deploymentId,
      networkId: deployment.networkId,
      observedAt: capturedAt,
      observationBlock: network.snapshot,
      methods: [
        "eth_chainId",
        "eth_getBlockByNumber",
        "eth_getCode",
        "eth_getStorageAt",
        "official deployment repository broadcast receipt",
        "fixed-block bridge live-configuration reads",
      ],
      activation,
      runtime: {
        addressCodeSha256: proxyCodeSha256,
        implementationCodeSha256,
        implementationSlotValue: observed.implementationSlot,
        adminSlotValue: observed.adminSlot,
      },
      proxy,
      explorer: {
        primaryEvidence: false,
        note: "ADR-0005 class uses the official deployment repository, successful broadcast receipt, live fixed-block slots/code, and workflow configuration rather than explorer source labels.",
      },
      outcome: "passed",
    });

    deploymentRecords.push({
      id: deploymentId,
      contractId: definition.contractId,
      contractName: definition.contractName,
      sourceContractName: definition.sourceContractName,
      protocol: definition.protocol,
      domains: definition.domains,
      networkId: deployment.networkId,
      environment: "mainnet",
      address: deployment.address,
      provenanceClass: definition.provenanceClass,
      contractType: "erc1967-proxy",
      validity: {
        deploymentFrom: activation,
        currentCodeFrom: activation,
        effectiveUntilExclusive: null,
      },
      proxy,
      abi: {
        catalogReference: {
          moduleId: "contracts",
          resourceId: "contract-abis",
          recordId: definition.contractId,
        },
        appliesTo: "current-implementation-through-proxy",
      },
      source: {
        sourceReference: {
          moduleId: "contracts",
          resourceId: "contract-sources",
          recordId: nttSourceId,
        },
        artifactPath: "deployment.json",
        declaredImplementationAddress: deployment.implementation,
      },
      runtime: {
        observedAt: capturedAt,
        blockNumber: network.snapshot.number,
        blockHash: network.snapshot.hash,
        addressCodeSha256: proxyCodeSha256,
        implementationCodeSha256,
      },
      provenanceEvidence,
      evidenceReference: {
        moduleId: "contracts",
        resourceId: evidenceId,
        recordId: observationId,
      },
      status: "verified-current",
      supportStatus: "proposed",
      reviewStatus: "pending-qualified-review",
      limitations: [
        "This UUPS proxy record is proposed and pending qualified Level 3 review; it creates no route, relayer, quote, or writer support.",
        "The open range records the implementation observed at the evidence block and must be reverified after an upgrade or review-window expiry.",
        "The official live configuration proves the bounded MUSD graph only; it is not an availability or delivery guarantee.",
      ],
    });
  }
}

const deploymentArtifact = await readFile(join(nttRepository, "deployment.json"));
assert(
  sha256(deploymentArtifact) === "826fbb0694a3e78e624b7e8532d739ccefb14dfd8d2f4e96dc22a56d930a1909",
  "NTT deployment artifact digest drifted",
);
sourceArtifacts.push({
  sourceId: nttSourceId,
  path: "deployment.json",
  sha256: sha256(deploymentArtifact),
});

const precompileAbiPath = join(
  contractsDirectory,
  "artifacts",
  "abis",
  "bridge",
  "native-assets-precompile.json",
);
const precompileAbiBytes = await readFile(precompileAbiPath);
const precompileAbi = values(
  parseJson(precompileAbiBytes.toString("utf8"), precompileAbiPath),
  "Assets Bridge ABI",
);
const precompileNetwork =
  capture.networks["mezo-mainnet"] ?? fail("Mezo Mainnet capture is missing");
const precompileObserved =
  precompileNetwork.contracts["bridge.native-assets-precompile"] ??
  fail("Assets Bridge precompile capture is missing");
const precompileCodeSha256 = sha256Hex(precompileObserved.code);
const precompileByteCodeSource = await readFile(
  join(mezodRepository, "precompile", "assetsbridge", "byte_code.go"),
  "utf8",
);
const precompileSourceBytecode = /const EvmByteCode = "([a-fA-F0-9]+)"/.exec(
  precompileByteCodeSource,
)?.[1];
assert(precompileSourceBytecode, "Assets Bridge source bytecode is missing");
assert(
  sha256Hex(precompileSourceBytecode) === precompileCodeSha256,
  "Assets Bridge source bytecode differs from the fixed-block runtime",
);
const precompileInterfaceBytes = await readFile(
  join(mezodRepository, "precompile", "assetsbridge", "IAssetsBridge.sol"),
);
const precompileSourceAbiBytes = await readFile(
  join(mezodRepository, "precompile", "assetsbridge", "abi.json"),
);
const precompileAssetsBridgeBytes = await readFile(
  join(mezodRepository, "precompile", "assetsbridge", "assets_bridge.go"),
);
const precompileSourceArtifacts: readonly (readonly [string, Buffer])[] = [
  ["precompile/assetsbridge/IAssetsBridge.sol", precompileInterfaceBytes],
  ["precompile/assetsbridge/abi.json", precompileSourceAbiBytes],
  ["precompile/assetsbridge/byte_code.go", Buffer.from(precompileByteCodeSource)],
  ["precompile/assetsbridge/assets_bridge.go", precompileAssetsBridgeBytes],
];
for (const [path, bytes] of precompileSourceArtifacts) {
  sourceArtifacts.push({ sourceId: precompileSourceId, path, sha256: sha256(bytes) });
}
const precompileUpdateTransaction =
  "0xe572e8711d95b19b0814272d779cb75150b2d48b9fde1ff90d13fd353792fb49";
const precompileActivation = transactionCoordinate(
  precompileNetwork,
  precompileUpdateTransaction,
  11260864,
  null,
);
precompileActivation.activationKind = "maintenance-precompile-call";
precompileActivation.method = "setPrecompileByteCode(address,bytes)";
assertPrecompileTrace(
  capture.precompileUpdateTrace,
  precompileObserved.address,
  precompileObserved.code,
);
const precompileObservationId = "observe-bridge-native-assets-precompile-mezo-mainnet-v6-wrapper";
abiRecords.push(
  createAbiRecord({
    contractId: "bridge.native-assets-precompile",
    abi: precompileAbi,
    abiBytes: precompileAbiBytes,
    provenanceClass: "official-client-precompile-source",
    intendedNetworkIds: ["mezo-mainnet"],
    sourceId: precompileSourceId,
    sourceArtifacts: [
      {
        networkId: "mezo-mainnet",
        version: "wrapper-v6/execution-v5",
        path: "precompile/assetsbridge/abi.json",
        sha256: sha256(precompileSourceAbiBytes),
      },
    ],
    limitations: [
      "The ABI is the official wrapper-v6 interface installed on-chain while the live v12 client still executes Assets Bridge generation 5.",
      "Generation-6-only selectors are scheduled for v13 block 11358000 and are not current support; the artifact and deployment remain proposed pending re-verification at that boundary.",
    ],
  }),
);
const precompileProvenanceEvidence = {
  clientPrecompile: {
    clientRepository: "https://github.com/mezo-org/mezod",
    commit: "42ddabe17f20580d145441d8f607f6306d753311",
    release: "unreleased-v13-source-on-v12-chain-state",
    liveClientGeneration:
      "Mezod/12.0.0 with Assets Bridge execution generation 5 and wrapper-v6 bytecode installed by maintenance-precompile call; execution generation 6 is scheduled for block 11358000.",
    interfaceSha256: sha256(precompileInterfaceBytes),
    fixedBlockReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: precompileObservationId,
    },
    activationBoundaryReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: precompileObservationId,
    },
    nodeVersionEvidenceReference: {
      moduleId: "contracts",
      resourceId: evidenceId,
      recordId: precompileObservationId,
    },
  },
};
observations.push({
  id: precompileObservationId,
  deploymentId: "bridge.native-assets-precompile@mezo-mainnet#v6-wrapper-v5-execution",
  networkId: "mezo-mainnet",
  observedAt: capturedAt,
  observationBlock: precompileNetwork.snapshot,
  methods: [
    "eth_chainId",
    "web3_clientVersion",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_getTransactionReceipt",
    "debug_traceTransaction callTracer",
    "official client source and bytecode digest comparison",
  ],
  activation: precompileActivation,
  runtime: {
    addressCodeSha256: precompileCodeSha256,
    implementationCodeSha256: null,
    sourceBytecodeSha256: sha256Hex(precompileSourceBytecode),
    liveClientVersion: precompileNetwork.clientVersion,
    activeExecutionVersion: 5,
    wrapperInterfaceGeneration: 6,
    lastPriorCodeBlock: precompileNetwork.blocks[11260863],
    scheduledExecutionVersion6Block: 11358000,
  },
  proxy: null,
  explorer: {
    notApplicable: true,
    note: "A protocol precompile is established through official client source, live client generation, fixed-block code, and its successful maintenance-precompile activation call, not explorer source verification.",
  },
  outcome: "passed",
});
deploymentRecords.push({
  id: "bridge.native-assets-precompile@mezo-mainnet#v6-wrapper-v5-execution",
  contractId: "bridge.native-assets-precompile",
  contractName: "Native Assets Bridge Precompile",
  sourceContractName: "IAssetsBridge",
  protocol: "mezo-native-bridge",
  domains: ["bridges", "native-bridge", "precompile"],
  networkId: "mezo-mainnet",
  environment: "mainnet",
  address: precompileObserved.address,
  provenanceClass: "official-client-precompile-source",
  contractType: "precompile",
  validity: {
    deploymentFrom: precompileActivation,
    currentCodeFrom: precompileActivation,
    effectiveUntilExclusive: null,
  },
  proxy: null,
  abi: {
    catalogReference: {
      moduleId: "contracts",
      resourceId: "contract-abis",
      recordId: "bridge.native-assets-precompile",
    },
    appliesTo: "deployment",
  },
  source: {
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: precompileSourceId,
    },
    artifactPath: "precompile/assetsbridge/byte_code.go",
    declaredImplementationAddress: null,
  },
  runtime: {
    observedAt: capturedAt,
    blockNumber: precompileNetwork.snapshot.number,
    blockHash: precompileNetwork.snapshot.hash,
    addressCodeSha256: precompileCodeSha256,
    implementationCodeSha256: null,
  },
  provenanceEvidence: precompileProvenanceEvidence,
  evidenceReference: {
    moduleId: "contracts",
    resourceId: evidenceId,
    recordId: precompileObservationId,
  },
  status: "verified-current",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  limitations: [
    "The wrapper-v6 bytecode is current, but the live v12 client executes generation 5 until the scheduled v13 activation at block 11358000.",
    "The full ABI therefore includes generation-6-only selectors that are expected to revert before v13 and are not supported by MDK.",
    "The record is proposed and must be reverified at the scheduled boundary before any qualified review or writer work.",
  ],
});

const nativeAbiPath = join(
  contractsDirectory,
  "artifacts",
  "abis",
  "bridge",
  "native-mezo-bridge.json",
);
const nativeAbiBytes = await readFile(nativeAbiPath);
const nativeAbi = values(
  parseJson(nativeAbiBytes.toString("utf8"), nativeAbiPath),
  "Native bridge ABI",
);
const compilerContracts = object(
  nativeCompilerOutput.contracts,
  "native bridge compiler contracts",
);
const nativeSourceContracts = object(
  compilerContracts["contracts/MezoBridge.sol"],
  "native bridge compiler source contracts",
);
const nativeArtifact = object(nativeSourceContracts.MezoBridge, "native bridge compiler artifact");
const nativeArtifactAbi = values(nativeArtifact.abi, "native bridge compiler ABI");
assert(
  abiSemanticDigest(nativeArtifactAbi) === abiSemanticDigest(nativeAbi),
  "native bridge imported ABI differs from the exact build",
);
const nativeArtifactEvm = object(nativeArtifact.evm, "native bridge compiler EVM output");
const nativeArtifactBytecode = object(
  nativeArtifactEvm.bytecode,
  "native bridge creation bytecode",
);
const nativeArtifactDeployedBytecode = object(
  nativeArtifactEvm.deployedBytecode,
  "native bridge deployed bytecode",
);
const nativeNetwork =
  capture.networks["ethereum-mainnet"] ?? fail("Ethereum Mainnet capture is missing");
const nativeObserved =
  nativeNetwork.contracts["bridge.native-mezo-bridge"] ??
  fail("native Mezo Bridge capture is missing");
const nativeCreationTransaction =
  "0x0ab4efd49476a20065abee9a971835d279316f5814521240ffbe424951f939ac";
const nativeCreation =
  nativeNetwork.transactions[nativeCreationTransaction]?.transaction ??
  fail("native bridge creation transaction is missing");
assert(!nativeCreation?.error, "native bridge creation transaction is unavailable");
const compiledCreation = normalizeHex(
  text(nativeArtifactBytecode.object, "native bridge creation bytecode object"),
);
const compiledRuntime = normalizeHex(
  text(nativeArtifactDeployedBytecode.object, "native bridge deployed bytecode object"),
);
assert(
  normalizeHex(nativeCreation.input) === compiledCreation,
  "native bridge creation bytecode differs",
);
assert(
  normalizeHex(nativeObserved.implementationCode) === compiledRuntime,
  "native bridge runtime differs",
);
const nativeHistoryDefinitions: readonly (readonly [string, number, string])[] = [
  [
    "0x3d282cc0d69e27fbd4aa59dfd08d6a72b45ce889",
    22376538,
    "0x0accb979b9191a61553e383d8c513ba9c1611bc4305498f4264c9a03c29b9ddb",
  ],
  [
    "0x2ca0a2c31260cab77e84fbead81082861ef66c4c",
    22989590,
    "0xd5a9f659e43b170c9882a20a40812d75258e63f38d557757faa39de54a88adda",
  ],
  [
    "0xd23d709a6858c5e44a9833bbeccf92729fc2c8c8",
    23331652,
    "0x4a659748aa9ec87e2782dfd0e8101d2e0676e1e465e1b57770dedc1a83f06e98",
  ],
  [
    "0x7e994d7fc7a2c3cad2331dadb07902f3a46b6cd9",
    23589330,
    "0x81fc9f0dfea4c6d3b85f38164f481ffbbc199772a0623baed8e77f00f6da005f",
  ],
  [
    "0x1f8ed8193b902185c2bd495fe9b1963dc343ba87",
    25435730,
    "0xb2b367b706d88e052af124594a0045b80231a9bf2b0077fc812eb367f26d9961",
  ],
];
const nativeHistory: HistoryEntry[] = nativeHistoryDefinitions.map(
  ([implementation, block, transaction]) => ({
    implementationAddress: implementation,
    effectiveFrom: transactionCoordinate(
      nativeNetwork,
      transaction,
      block,
      findUpgradeLogIndex(
        nativeNetwork.transactions[transaction]?.receipt,
        nativeObserved.address,
        implementation,
      ),
    ),
    effectiveUntilExclusive: null,
  }),
);
for (let index = 0; index < nativeHistory.length - 1; index += 1) {
  const current = nativeHistory[index] ?? fail(`native bridge history ${index} is missing`);
  const next = nativeHistory[index + 1] ?? fail(`native bridge history ${index + 1} is missing`);
  current.effectiveUntilExclusive = next.effectiveFrom;
}
const nativeHistoryFirst = nativeHistory[0] ?? fail("native bridge history is empty");
const nativeHistoryLast = nativeHistory.at(-1) ?? fail("native bridge history is empty");
const nativeProxy = {
  standard: "eip-1967-transparent",
  implementationSlot,
  adminSlot: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  adminAddress: normalizeStorageAddress(nativeObserved.adminSlot),
  currentImplementationAddress: nativeObserved.implementation,
  implementationHistory: nativeHistory,
};
const nativeObservationId = "observe-bridge-native-mezo-bridge-ethereum-mainnet";
const nativeImplementationHtmlSha256 = sha256(nativeImplementationHtml);
const nativeProxyHtmlSha256 = sha256(nativeProxyHtml);
sourceArtifacts.push(
  {
    sourceId: nativeSourceId,
    path: "address/0x1f8ed8193b902185c2bd495fe9b1963dc343ba87#code",
    sha256: nativeImplementationHtmlSha256,
  },
  {
    sourceId: nativeSourceId,
    path: "address/0xf6680ea3b480ca2b72d96ea13ccaf2cfd8e6908c#code",
    sha256: nativeProxyHtmlSha256,
  },
);
const nativeSources = object(nativeStandardInput.sources, "native bridge standard input sources");
const nativeSettings = object(nativeStandardInput.settings, "native bridge compiler settings");
const nativeLibraries = object(nativeSettings.libraries ?? {}, "native bridge compiler libraries");
const nativeSourceBundleSha256 = sha256(JSON.stringify(canonicalize(nativeSources)));
const nativeCompilerSettingsSha256 = sha256(JSON.stringify(canonicalize(nativeSettings)));
const nativeLibrariesSha256 = sha256(JSON.stringify(canonicalize(nativeLibraries)));
const nativeCreationParts = stripMetadata(compiledCreation);
const nativeRuntimeParts = stripMetadata(compiledRuntime);
const nativeArtifactBytecodeComparison = {
  creationFullExact: true,
  creationExecutableExact: true,
  runtimeFullExact: true,
  runtimeExecutableExact: true,
  immutableSubstitutions: 0,
  creationFullSha256: sha256Hex(compiledCreation),
  creationExecutableSha256: sha256Hex(nativeCreationParts.executable),
  runtimeFullSha256: sha256Hex(compiledRuntime),
  runtimeExecutableSha256: sha256Hex(nativeRuntimeParts.executable),
};
const nativeReproduction = {
  explorerVerification: {
    isVerified: true,
    isFullyVerified: true,
    isPartiallyVerified: false,
  },
  sourceBundleSha256: nativeSourceBundleSha256,
  compilerVersion: "v0.8.24+commit.e11b9ed9",
  compilerSettingsSha256: nativeCompilerSettingsSha256,
  librariesSha256: nativeLibrariesSha256,
  buildProcedure:
    "Download the Etherscan Exact Match multi-file source page, extract its synthetic settings.json with scripts/extract-etherscan-standard-json.ts, compile with solc v0.8.24+commit.e11b9ed9 --standard-json, and compare the creation transaction/runtime with scripts/compare-standard-json-build.ts.",
  creationExecutableMatch: true,
  runtimeExecutableMatch: true,
  fullBytecodeDifference:
    "No difference: creation and runtime bytecode, including Solidity metadata, match the exact Etherscan Standard JSON build; the contract has no constructor arguments or immutable substitutions.",
  abiDerivedFromExactBuild: true,
  activationHistoryReference: {
    moduleId: "contracts",
    resourceId: evidenceId,
    recordId: nativeObservationId,
  },
};
abiRecords.push(
  createAbiRecord({
    contractId: "bridge.native-mezo-bridge",
    abi: nativeAbi,
    abiBytes: nativeAbiBytes,
    provenanceClass: "deployed-executable-reproduction",
    intendedNetworkIds: ["ethereum-mainnet"],
    sourceId: nativeSourceId,
    sourceArtifacts: [
      {
        networkId: "ethereum-mainnet",
        path: "address/0x1f8ed8193b902185c2bd495fe9b1963dc343ba87#code",
        sha256: nativeImplementationHtmlSha256,
      },
    ],
    limitations: [
      "The full ABI is derived from the exact current implementation build whose creation and runtime bytecode match Ethereum Mainnet.",
      "Etherscan Exact Match and executable equality do not establish Mezo authorship, audit coverage, future proxy identity, or writer support.",
    ],
  }),
);
const nativeAddressCodeSha256 = sha256Hex(nativeObserved.code);
const nativeImplementationCodeSha256 = sha256Hex(nativeObserved.implementationCode);
observations.push({
  id: nativeObservationId,
  deploymentId: "bridge.native-mezo-bridge@ethereum-mainnet",
  networkId: "ethereum-mainnet",
  observedAt: capturedAt,
  observationBlock: nativeNetwork.snapshot,
  methods: [
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_getCode",
    "eth_getStorageAt",
    "eth_getTransactionReceipt",
    "Etherscan Exact Match source and proxy history",
    "exact solc Standard JSON executable reproduction",
  ],
  activation: nativeHistoryFirst.effectiveFrom,
  runtime: {
    addressCodeSha256: nativeAddressCodeSha256,
    implementationCodeSha256: nativeImplementationCodeSha256,
    artifactBytecodeComparison: nativeArtifactBytecodeComparison,
  },
  proxy: nativeProxy,
  explorer: {
    proxyOrDirect: {
      address: nativeObserved.address,
      sourceLabel: "Exact Match",
      implementationHistoryEntries: nativeHistory.length,
      pageSha256: nativeProxyHtmlSha256,
    },
    activeContract: {
      address: nativeObserved.implementation,
      name: "MezoBridge",
      sourceLabel: "Exact Match",
      isVerified: true,
      isFullyVerified: true,
      isPartiallyVerified: false,
      compilerVersion: "v0.8.24+commit.e11b9ed9",
      optimizerRuns: 10000,
      evmVersion: "paris",
      abiSemanticSha256: abiSemanticDigest(nativeAbi),
      deployedBytecodeSha256: nativeImplementationCodeSha256,
      pageSha256: nativeImplementationHtmlSha256,
    },
    reproducedAbiMatch: true,
    rpcBytecodeMatch: true,
  },
  reproduction: nativeReproduction,
  outcome: "passed",
});
deploymentRecords.push({
  id: "bridge.native-mezo-bridge@ethereum-mainnet",
  contractId: "bridge.native-mezo-bridge",
  contractName: "Native Mezo Bridge",
  sourceContractName: "MezoBridge",
  protocol: "mezo-native-bridge",
  domains: ["bridges", "native-bridge", "ethereum"],
  networkId: "ethereum-mainnet",
  environment: "mainnet",
  address: nativeObserved.address,
  provenanceClass: "deployed-executable-reproduction",
  contractType: "transparent-proxy",
  validity: {
    deploymentFrom: nativeHistoryFirst.effectiveFrom,
    currentCodeFrom: nativeHistoryLast.effectiveFrom,
    effectiveUntilExclusive: null,
  },
  proxy: nativeProxy,
  abi: {
    catalogReference: {
      moduleId: "contracts",
      resourceId: "contract-abis",
      recordId: "bridge.native-mezo-bridge",
    },
    appliesTo: "current-implementation-through-proxy",
  },
  source: {
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: nativeSourceId,
    },
    artifactPath: "address/0x1f8ed8193b902185c2bd495fe9b1963dc343ba87#code",
    declaredImplementationAddress: nativeObserved.implementation,
  },
  runtime: {
    observedAt: capturedAt,
    blockNumber: nativeNetwork.snapshot.number,
    blockHash: nativeNetwork.snapshot.hash,
    addressCodeSha256: nativeAddressCodeSha256,
    implementationCodeSha256: nativeImplementationCodeSha256,
    artifactBytecodeComparison: nativeArtifactBytecodeComparison,
  },
  provenanceEvidence: { reproduction: nativeReproduction },
  evidenceReference: {
    moduleId: "contracts",
    resourceId: evidenceId,
    recordId: nativeObservationId,
  },
  status: "verified-current",
  supportStatus: "proposed",
  reviewStatus: "pending-qualified-review",
  limitations: [
    "This current proxy generation is proposed and pending qualified Level 3 review; exact reproduction does not create route or writer support.",
    "All five Etherscan-disclosed implementation activations are retained; future upgrades require a new range and ABI review.",
    "Volatile fees, token mappings, validators, thresholds, capacities, and pause/lockdown state remain workflow evidence and must be reread before use.",
  ],
});

const scheduleBytes = await readFile(join(mezodUpgradeScheduleRepository, "docs", "upgrades.md"));
assert(
  sha256(scheduleBytes) === "9bd59af211c88f22aaa59eb46b6a84f981301482d7e09280b6c3b1da2d7f0f7e",
  "mezod v13 upgrade schedule digest drifted",
);
sourceArtifacts.push({
  sourceId: upgradeScheduleSourceId,
  path: "docs/upgrades.md",
  sha256: sha256(scheduleBytes),
});

const networkSnapshots = Object.entries(capture.networks).map(([networkId, network]) => ({
  networkId,
  evmChainId: network.chainId,
  blockNumber: network.snapshot.number,
  blockHash: network.snapshot.hash,
  blockTimestamp: network.snapshot.timestamp,
  rpcUrl: network.rpcUrl,
  explorerApiUrl:
    networkId === "ethereum-mainnet"
      ? "https://etherscan.io"
      : networkId === "base-mainnet"
        ? "https://basescan.org"
        : "https://api.explorer.mezo.org",
}));
const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "pending-qualified-review",
  verifiedAt: capturedAt,
  reviewAfter: "2026-08-23T00:00:00Z",
  scope: {
    networkIds: ["mezo-mainnet", "ethereum-mainnet", "base-mainnet"],
    deploymentIds: deploymentRecords.map((record) => record.id),
  },
  limitations: [
    "All promoted bridge identities remain proposed evidence pending qualified Level 3 review; no route, relayer, quote, or writer support is created.",
    "Base activation blocks use retained prior eth_getBlockByNumber results plus official broadcast receipts because the selected public provider now prunes those historical receipts/blocks.",
    "The Assets Bridge wrapper changed after the August 18 workflow snapshot and must be reverified at the scheduled v13 execution-generation boundary.",
  ],
  observedFrom: capturedAt,
  observedThrough: capturedAt,
  methodology: [
    "Pinned the official current and initial MUSD NTT deployment repositories, deployment.json, TypeChain ABI factories, and six successful proxy broadcast receipts by exact commit/path digest.",
    "Captured current chain identity, block identity, proxy code, implementation slots, zero admin slots, and implementation code at one fixed block per network.",
    "Classified NTT proxies as ERC-1967/UUPS from official deployment source and live zero-admin-slot observations instead of mislabeling them transparent proxies.",
    "Reconstructed the Native Ethereum proxy's complete five-generation Etherscan history and checked every successful activation receipt, current slots, proxy code, and implementation code.",
    "Extracted the current Native implementation's Etherscan Standard JSON settings, compiled with exact solc 0.8.24, and matched full creation/runtime bytecode plus ABI semantics.",
    "Binary-searched the post-snapshot Assets Bridge code change, traced the successful maintenance-precompile call at block 11260864, and matched current code/ABI/interface to official commit 42ddabe.",
    "Preserved the live v12 execution-generation-5 versus wrapper-generation-6 distinction and the scheduled v13 block 11358000 limitation.",
  ],
  networkSnapshots,
  observations,
};
const evidencePath = join(contractsDirectory, "evidence", "bridge-contracts-2026-08-21.json");
await writeJson(evidencePath, evidence);
const evidenceSha256 = sha256(await readFile(evidencePath));

for (const definition of contractDefinitions) {
  for (const deployment of definition.deployments) {
    const bytes = await readFile(join(deployment.broadcastRepository, deployment.broadcastPath));
    sourceArtifacts.push({
      sourceId: deployment.broadcastSourceId,
      path: deployment.broadcastPath,
      sha256: sha256(bytes),
    });
  }
}
const sourceRecords = [
  {
    id: nttSourceId,
    kind: "official-deployment-repository-live-configuration",
    repository: "https://github.com/mezo-org/ntt-bridge-musd-mainnet",
    commit: "8742584991b5f4d1ee63ff10fad8d833a460526c",
    note: "Pinned official current MUSD NTT 1.1.0 deployment configuration, generated ABI factories, Base manager deployment, and three transceiver deployment broadcasts.",
  },
  {
    id: originalNttSourceId,
    kind: "official-deployment-repository-activation-history",
    repository: "https://github.com/mezo-org/ntt-bridge-musd",
    commit: "0022212b2433d8780f7aba932746b4d6f7b01c57",
    note: "Pinned official initial Mezo and Ethereum MUSD NTT manager deployment broadcasts retained for activation history after repository reorganization.",
  },
  {
    id: precompileSourceId,
    kind: "official-client-precompile-source",
    repository: "https://github.com/mezo-org/mezod",
    commit: "42ddabe17f20580d145441d8f607f6306d753311",
    note: "Exact official Assets Bridge wrapper-v6 interface, ABI, runtime bytecode, and version-map source matching the on-chain wrapper installed while execution generation 5 remains active.",
  },
  {
    id: upgradeScheduleSourceId,
    kind: "official-client-upgrade-schedule",
    repository: "https://github.com/mezo-org/mezod",
    commit: "0787e5db684c41142c3021468c660eab60d3e323",
    note: "Official current upgrade schedule establishing v13.0.0 activation at Mezo Mainnet block 11358000.",
  },
  {
    id: nativeSourceId,
    kind: "on-chain-explorer-executable-reproduction",
    reference: { moduleId: "contracts", resourceId: evidenceId },
    sha256: evidenceSha256,
    retrievedAt: capturedAt,
    endpoints: ["https://etherscan.io"],
    note: "Etherscan Exact Match proxy/current-implementation pages, full five-generation activation history, exact Standard JSON build, and fixed-block Ethereum code/slot observations.",
  },
];

await updateCatalogs({
  abiRecords,
  deploymentRecords,
  sourceRecords,
  sourceArtifacts,
  evidence,
  evidenceSha256,
});

process.stdout.write(
  `Imported ${abiRecords.length} proposed bridge contract IDs and ${deploymentRecords.length} deployments (${evidenceSha256}).\n`,
);

async function nttActivation(
  deployment: (typeof contractDefinitions)[number]["deployments"][number],
  network: CaptureNetwork,
): Promise<Coordinate> {
  const broadcast = await loadJson<JsonObject>(
    join(deployment.broadcastRepository, deployment.broadcastPath),
  );
  const receipt = objects(broadcast.receipts, "broadcast receipts").find(
    (candidate) =>
      normalizeHash(text(candidate.transactionHash, "broadcast transaction hash")) ===
      deployment.activationTransaction,
  );
  assert(receipt, `${deployment.address} broadcast receipt is missing`);
  assert(
    Number.parseInt(text(receipt.status, "broadcast receipt status"), 16) === 1,
    `${deployment.address} activation failed`,
  );
  assert(
    Number.parseInt(text(receipt.blockNumber, "broadcast receipt block number"), 16) ===
      deployment.activationBlock,
    `${deployment.address} activation block drifted`,
  );
  const logIndex = findUpgradeLogIndex(receipt, deployment.address, deployment.implementation);
  return transactionCoordinate(
    network,
    deployment.activationTransaction,
    deployment.activationBlock,
    logIndex,
  );
}

function transactionCoordinate(
  network: CaptureNetwork,
  transactionHash: string,
  blockNumber: number,
  logIndex: number | null,
): Coordinate {
  const block = network.blocks[blockNumber];
  assert(block && !block.error, `block ${blockNumber} is unavailable`);
  const receipt = network.transactions[transactionHash]?.receipt;
  if (receipt && !receipt.error) {
    assert(Number.parseInt(receipt.status, 16) === 1, `${transactionHash} did not succeed`);
    assert(
      Number.parseInt(receipt.blockNumber, 16) === blockNumber,
      `${transactionHash} block differs`,
    );
  }
  return {
    blockNumber,
    transactionHash,
    ...(logIndex === null ? {} : { logIndex }),
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
  };
}

function findUpgradeLogIndex(
  receipt: JsonObject | undefined,
  proxyAddress: string,
  implementationAddress: string,
): number {
  assert(receipt && !receipt.error, `${proxyAddress} receipt is unavailable`);
  const logs = objects(receipt.logs, `${proxyAddress} receipt logs`);
  const log = logs.find((candidate) => {
    const topics = values(candidate.topics, `${proxyAddress} log topics`);
    return (
      text(candidate.address, `${proxyAddress} log address`).toLowerCase() === proxyAddress &&
      text(topics[0], `${proxyAddress} log topic 0`).toLowerCase() === upgradedTopic &&
      normalizeStorageAddress(text(topics[1], `${proxyAddress} log topic 1`)) ===
        implementationAddress
    );
  });
  assert(log, `${proxyAddress} Upgraded log is missing`);
  return Number.parseInt(text(log.logIndex, `${proxyAddress} log index`), 16);
}

function assertPrecompileTrace(trace: unknown, address: string, expectedCode: string): void {
  const calls: TraceCall[] = [];
  visit(trace);
  const matchingCall = calls.find((call) => {
    if (call.to?.toLowerCase() !== "0x7b7c000000000000000000000000000000000013") return false;
    if (!call.input?.startsWith("0x175116dd")) return false;
    return normalizeStorageAddress(`0x${call.input.slice(10, 74)}`) === address;
  });
  assert(matchingCall, "Assets Bridge maintenance update call is absent from the trace");
  const payload = text(matchingCall.input, "Assets Bridge trace input").slice(10);
  const dynamicOffset = Number.parseInt(payload.slice(64, 128), 16) * 2;
  const byteLength = Number.parseInt(payload.slice(dynamicOffset, dynamicOffset + 64), 16);
  const bytecode = payload.slice(dynamicOffset + 64, dynamicOffset + 64 + byteLength * 2);
  assert(
    normalizeHex(bytecode) === normalizeHex(expectedCode),
    "maintenance trace bytecode differs",
  );
  assert(
    normalizeHex(text(matchingCall.output, "Assets Bridge trace output")) === "0".repeat(63) + "1",
    "maintenance call failed",
  );

  function visit(call: unknown): void {
    if (!call || typeof call !== "object") return;
    const traceCall = call as TraceCall;
    calls.push(traceCall);
    for (const child of traceCall.calls ?? []) visit(child);
  }
}

function createAbiRecord({
  contractId,
  abi,
  abiBytes,
  provenanceClass,
  intendedNetworkIds,
  sourceId,
  sourceArtifacts: artifacts,
  limitations,
}: AbiRecordArguments): JsonObject {
  return {
    id: contractId,
    contractId,
    provenanceClass,
    intendedNetworkIds,
    artifactReference: { moduleId: "contracts", resourceId: `abi.${contractId}` },
    entryCount: abi.length,
    fileSha256: sha256(abiBytes),
    abiSha256: sha256(JSON.stringify(canonicalize(abi))),
    abiSemanticSha256: abiSemanticDigest(abi),
    sourceReference: {
      moduleId: "contracts",
      resourceId: "contract-sources",
      recordId: sourceId,
    },
    sourceArtifacts: artifacts,
    status: "verified",
    supportStatus: "proposed",
    reviewStatus: "pending-qualified-review",
    limitations,
  };
}

async function updateCatalogs({
  abiRecords: newAbiRecords,
  deploymentRecords: newDeploymentRecords,
  sourceRecords: newSourceRecords,
  sourceArtifacts: newSourceArtifacts,
  evidence: newEvidence,
}: UpdateCatalogArguments): Promise<void> {
  const contractIds = newAbiRecords.map((record) => text(record.contractId, "ABI contract ID"));
  const networkIds = ["mezo-mainnet", "mezo-testnet", "ethereum-mainnet", "base-mainnet"];
  const abiCatalogPath = join(contractsDirectory, "records", "abis.json");
  const abiCatalog = await loadJson<JsonObject>(abiCatalogPath);
  abiCatalog.verifiedAt = capturedAt;
  const abiScope = object(abiCatalog.scope, "ABI catalog scope");
  abiCatalog.scope = abiScope;
  abiScope.networkIds = networkIds;
  abiScope.contractIds = unique([
    ...texts(abiScope.contractIds, "ABI catalog contract IDs"),
    ...contractIds,
  ]);
  abiCatalog.records = upsert(
    objects(abiCatalog.records, "ABI catalog records"),
    newAbiRecords,
    "contractId",
  );
  abiCatalog.limitations = replacePrefixed(
    texts(abiCatalog.limitations, "ABI catalog limitations"),
    "The catalog contains",
    "The catalog contains accepted bootstrap ABIs plus proposed incentives and bridge ABIs; record-level lifecycle and provenance govern use.",
  );
  await writeJson(abiCatalogPath, abiCatalog);

  const deploymentCatalogPath = join(contractsDirectory, "records", "deployments.json");
  const deploymentCatalog = await loadJson<JsonObject>(deploymentCatalogPath);
  deploymentCatalog.verifiedAt = capturedAt;
  const deploymentScope = object(deploymentCatalog.scope, "deployment catalog scope");
  deploymentCatalog.scope = deploymentScope;
  deploymentScope.networkIds = networkIds;
  deploymentScope.contractIds = unique([
    ...texts(deploymentScope.contractIds, "deployment catalog contract IDs"),
    ...contractIds,
  ]);
  deploymentCatalog.records = upsert(
    objects(deploymentCatalog.records, "deployment catalog records"),
    newDeploymentRecords,
  );
  deploymentCatalog.limitations = replacePrefixed(
    texts(deploymentCatalog.limitations, "deployment catalog limitations"),
    "The catalog contains",
    "The catalog contains accepted bootstrap deployments plus proposed incentives and bridge deployments; record-level lifecycle and provenance govern use.",
  );
  await writeJson(deploymentCatalogPath, deploymentCatalog);

  const sourceCatalogPath = join(contractsDirectory, "sources", "catalog.json");
  const sourceCatalog = await loadJson<JsonObject>(sourceCatalogPath);
  sourceCatalog.verifiedAt = capturedAt;
  const sourceScope = object(sourceCatalog.scope, "source catalog scope");
  sourceCatalog.scope = sourceScope;
  sourceScope.networkIds = networkIds;
  sourceScope.sourceIds = unique([
    ...texts(sourceScope.sourceIds, "source catalog IDs"),
    ...newSourceRecords.map((record) => text(record.id, "source record ID")),
  ]);
  sourceCatalog.sources = upsert(
    objects(sourceCatalog.sources, "source catalog records"),
    newSourceRecords,
  );
  sourceCatalog.sourceArtifacts = upsert(
    objects(sourceCatalog.sourceArtifacts, "source artifacts"),
    deduplicateSourceArtifacts(newSourceArtifacts),
    (record) =>
      `${text(record.sourceId, "source artifact source ID")}:${text(record.path, "source artifact path")}`,
  );
  await writeJson(sourceCatalogPath, sourceCatalog);

  const indexPath = join(contractsDirectory, "index.json");
  const index = await loadJson<JsonObject>(indexPath);
  index.verifiedAt = capturedAt;
  const indexScope = object(index.scope, "Contracts index scope");
  index.scope = indexScope;
  indexScope.networkIds = networkIds;
  indexScope.contractIds = unique([
    ...texts(indexScope.contractIds, "Contracts index contract IDs"),
    ...contractIds,
  ]);
  index.limitations = [
    "MDK support covers only the accepted 21-contract, 42-deployment bootstrap scope; incentives and bridge registry records remain proposed pending qualified review.",
    "Open deployment validity ranges and current implementation ABIs require re-verification after upgrades or the review window.",
    "The Assets Bridge wrapper changed after the prior workflow snapshot and has a scheduled v13 generation boundary at block 11358000; no precompile writer support is implied.",
    "Accepted ADR-0005 provenance classes do not create route, relayer, quote, writer, or product support; accepted ADR-0001 does not define a public package API.",
  ];
  const indexExtensions = object(index.extensions, "Contracts index extensions");
  index.extensions = indexExtensions;
  indexExtensions.networkReferences = networkIds.map((resourceId) => ({
    moduleId: "networks",
    resourceId,
  }));
  let indexResources = objects(index.resources, "Contracts index resources");
  for (const [resourceId, records] of [
    ["contract-deployments", newDeploymentRecords],
    ["contract-abis", newAbiRecords],
    ["contract-sources", newSourceRecords],
  ] as const) {
    const resource =
      indexResources.find((item) => item.id === resourceId) ??
      fail(`Contracts index resource ${resourceId} is missing`);
    resource.recordIds = unique([
      ...texts(resource.recordIds, `${resourceId} record IDs`),
      ...records.map((record) => text(record.id, `${resourceId} record ID`)),
    ]);
  }
  const artifactResources: JsonObject[] = newAbiRecords.map((record) => {
    const contractId = text(record.contractId, "ABI artifact contract ID");
    return {
      id: `abi.${contractId}`,
      role: "artifact",
      kind: "contract-abi",
      path: `artifacts/abis/bridge/${contractId.replace("bridge.", "").replaceAll(".", "-")}.json`,
    };
  });
  const expectedArtifactPaths: Record<string, string> = {
    "abi.bridge.musd-ntt-manager": "artifacts/abis/bridge/musd-ntt-manager.json",
    "abi.bridge.musd-wormhole-transceiver": "artifacts/abis/bridge/musd-wormhole-transceiver.json",
    "abi.bridge.native-assets-precompile": "artifacts/abis/bridge/native-assets-precompile.json",
    "abi.bridge.native-mezo-bridge": "artifacts/abis/bridge/native-mezo-bridge.json",
  };
  for (const resource of artifactResources) {
    const resourceId = text(resource.id, "ABI artifact resource ID");
    resource.path =
      expectedArtifactPaths[resourceId] ?? fail(`ABI artifact path ${resourceId} is missing`);
  }
  indexResources = indexResources.filter(
    (resource) =>
      resource.id !== evidenceId &&
      !artifactResources.some((artifact) => artifact.id === resource.id),
  );
  const reviewIndex = indexResources.findIndex((resource) => resource.role === "review");
  if (reviewIndex < 0) fail("Contracts review resource is missing");
  indexResources.splice(
    reviewIndex,
    0,
    {
      id: evidenceId,
      role: "evidence",
      kind: "contract-observation-set",
      path: "evidence/bridge-contracts-2026-08-21.json",
      recordIds: newEvidence.observations.map((observation) =>
        text(observation.id, "bridge evidence observation ID"),
      ),
      recordCollectionPointer: "/observations",
    },
    ...artifactResources,
  );
  index.resources = indexResources;
  await writeJson(indexPath, index);
}

function deduplicateSourceArtifacts(artifacts: JsonObject[]): JsonObject[] {
  return [
    ...new Map(
      artifacts.map((record) => [
        `${text(record.sourceId, "source artifact source ID")}:${text(record.path, "source artifact path")}`,
        record,
      ]),
    ).values(),
  ];
}

function replacePrefixed(values: string[], prefix: string, replacement: string): string[] {
  return [...values.filter((value) => !value.startsWith(prefix)), replacement];
}

function upsert(
  records: JsonObject[],
  additions: JsonObject[],
  key: string | ((record: JsonObject) => unknown) = "id",
): JsonObject[] {
  const keyFunction =
    typeof key === "function" ? key : (record: JsonObject): unknown => record[key];
  const additionKeys = new Set(additions.map(keyFunction));
  return [...records.filter((record) => !additionKeys.has(keyFunction(record))), ...additions];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

async function loadJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function normalizeHex(value: unknown): string {
  const normalized = text(value, "hex bytes").toLowerCase().replace(/^0x/, "");
  assert(/^[a-f0-9]*$/.test(normalized) && normalized.length % 2 === 0, "invalid hex");
  return normalized;
}

function sha256Hex(value: unknown): string {
  return sha256(Buffer.from(normalizeHex(value), "hex"));
}

function normalizeHash(value: unknown): string {
  const source = text(value, "hash");
  const normalized = source.toLowerCase();
  assert(/^0x[a-f0-9]{64}$/.test(normalized), `invalid hash '${source}'`);
  return normalized;
}

function normalizeStorageAddress(value: unknown): string {
  const source = text(value, "storage address");
  const normalized = source.toLowerCase();
  assert(/^0x[a-f0-9]{64}$/.test(normalized), `invalid storage address '${source}'`);
  return `0x${normalized.slice(-40)}`;
}

function abiSemanticDigest(abi: readonly unknown[]): string {
  return sha256(JSON.stringify(abi.map((entry) => JSON.stringify(canonicalize(entry))).sort()));
}

function stripMetadata(value: unknown): { full: string; executable: string; metadata: string } {
  const normalized = normalizeHex(value);
  const metadataBytes = Number.parseInt(normalized.slice(-4), 16) + 2;
  const executableEnd = normalized.length - metadataBytes * 2;
  assert(executableEnd >= 0, "invalid Solidity metadata length");
  return {
    full: normalized,
    executable: normalized.slice(0, executableEnd),
    metadata: normalized.slice(executableEnd),
  };
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} is invalid`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fail(message: string): never {
  throw new Error(message);
}
