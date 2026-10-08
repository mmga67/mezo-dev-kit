# Evidence and contract-source tools

[Scripts manual](../README.md) · Run from the repository root. These are
maintainer tools; several retain inputs, dates, and source revisions from a
specific evidence procedure. Read the selected source and owning module before
running an importer. The mainnet oracle importer has the reviewed proposal workflow below; other tools have no shared dry-run contract.

## Choose the operation

| Operation          | Effect                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Capture            | Reads RPC/explorer/official-source data and emits a candidate JSON capture                              |
| Import or refresh  | Writes canonical knowledge records, artifacts, indexes, or related guidance from the procedure's inputs |
| Inspect or compare | Reads retained source/build data or queries a bounded on-chain code range                               |

Follow the [knowledge-authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md)
for evidence acceptance and the
[oracle refresh guide](../../docs/guides/oracle-evidence-refresh.md) for the
current price/contract capture workflow. Module indexes own source identity,
accepted scope, checks, and review requirements.

Use ignored `local/` or `/tmp/` for raw captures and diagnostics. Inspect the
capture before passing it to an importer, review all written files, regenerate
affected projections, then run the owning module's declared checks. A capture
does not automatically update knowledge or establish support.

## Captures

The scripts below use live network reads. Paths in angle brackets are supplied
by the caller. Do not run the placeholders literally.

| Script                                                                                 | Arguments after the filename                                                                                                | Output and prerequisites                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [capture-current-price-state.ts](capture-current-price-state.ts)                       | `--network mezo-mainnet\|mezo-testnet <output.json>`                                                                        | Writes a new current-state capture; requires an explicit network and refuses an existing output file                   |
| [capture-price-knowledge.ts](capture-price-knowledge.ts)                               | `<output.json> <documentation-checkout> <mezod-checkout> <pyth-crosschain-checkout> [--network mezo-mainnet\|mezo-testnet]` | Writes full price/source/history capture using the official checkouts; omission of network selects both networks       |
| [capture-bridge-contract-observations.ts](capture-bridge-contract-observations.ts)     | `<output.json>`                                                                                                             | Writes live bridge contract observations                                                                               |
| [capture-pool-knowledge.ts](capture-pool-knowledge.ts)                                 | No arguments                                                                                                                | Prints JSON to stdout using its configured mainnet RPC/explorer endpoints                                              |
| [capture-institutional-debt-knowledge.ts](capture-institutional-debt-knowledge.ts)     | `[output.json]`                                                                                                             | Writes JSON to the supplied path or stdout; supports `MDK_MEZO_RPC_URL` and `MDK_MEZO_EXPLORER_API_URL`                |
| [capture-validator-incentives-knowledge.ts](capture-validator-incentives-knowledge.ts) | `[/tmp/output.json]`                                                                                                        | Writes to a `/tmp/*.json` path or stdout; supports the two endpoint variables above and `MDK_VALIDATOR_EVIDENCE_BLOCK` |

Example of a bounded current-state capture:

```sh
mkdir -p local/evidence
node scripts/evidence/capture-current-price-state.ts \
  --network mezo-mainnet local/evidence/mainnet-current-state.json
```

Choose a new output filename for a subsequent observation. Consult the source
for endpoint selection and required evidence fields; the environment overrides
listed above are specific to those two capture scripts.

## Price and bridge refreshes

These commands write into the checkout. A refresh accepts only the capture
shape and source scope implemented by that script; a current-state capture is
not interchangeable with the full-history capture.

| Script                                                                     | Arguments after the filename                                                                           | Written owner / purpose                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [import-mainnet-oracle-refresh.ts](import-mainnet-oracle-refresh.ts)       | `propose <capture> <local/proposal.json>`, `apply <proposal> --reviewed-digest <sha256>`, or `recover` | Mainnet oracle evidence and its Contract/Price references; use the oracle refresh guide |
| [refresh-pyth-oracle-knowledge.ts](refresh-pyth-oracle-knowledge.ts)       | `<capture.json>`                                                                                       | Pinned Pyth ABI, implementation history, and price evidence refresh procedure           |
| [refresh-bridge-contract-evidence.ts](refresh-bridge-contract-evidence.ts) | `<capture.json>`                                                                                       | Bridge upgrade evidence, implementation generations, and associated references          |
| [import-musdt-token-profile.ts](import-musdt-token-profile.ts)             | `<capture-directory>`                                                                                  | Retained proxy/implementation/runtime inputs → Contracts token profile                  |
| [import-ntt-transfer-evidence.ts](import-ntt-transfer-evidence.ts)         | `<capture-directory> <official-source-checkout> <attestation-capture-directory>`                       | Retained captures and pinned source → NTT transfer/recovery evidence                    |

For example, after producing and reviewing the full mainnet capture using the
oracle guide:

```sh
node scripts/evidence/import-mainnet-oracle-refresh.ts propose \
  local/evidence/mainnet-oracle-capture.json local/evidence/oracle-proposal.json
```

This importer is separate from `capture-current-price-state.ts`; use the input
named by the refresh procedure.

## Bootstrap and domain importers

These tools encode bounded imports used to establish particular records. Some
fetch RPC/explorer data; some read retained evidence; some replace entire
catalogs. They are not an unattended "refresh everything" pipeline. In
particular, the original contract bootstrap rebuilds its catalog from its own
fixed definitions and can discard later additions if rerun blindly.

Invoke a selected script as `node scripts/evidence/<filename> <arguments>` only
after reviewing its inputs and intended writes.

| Script                                                                                             | Inputs / behavior                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [import-contract-knowledge.ts](import-contract-knowledge.ts)                                       | Requires `--docs-source <checkout> --musd-source <checkout> --tigris-source <checkout>` at its pinned commits; fetches deployment evidence, rebuilds bootstrap catalogs, and regenerates the Contract reference |
| [import-economic-system-contract-records.ts](import-economic-system-contract-records.ts)           | No arguments; fetches the configured economic-system contracts and writes registry evidence/records/artifacts                                                                                                   |
| [import-incentives-contract-abis.ts](import-incentives-contract-abis.ts)                           | No arguments; fetches ABIs against retained incentives source-reproduction evidence                                                                                                                             |
| [import-incentives-contract-records.ts](import-incentives-contract-records.ts)                     | No arguments; imports its defined incentives contracts and evidence into the registry                                                                                                                           |
| [import-validator-incentives-contract-records.ts](import-validator-incentives-contract-records.ts) | No arguments; fetches validator factory ABIs/evidence and updates registry records                                                                                                                              |
| [import-institutional-debt-contract-abis.ts](import-institutional-debt-contract-abis.ts)           | No arguments; fetches institutional contract ABIs/source evidence                                                                                                                                               |
| [import-institutional-debt-contract-records.ts](import-institutional-debt-contract-records.ts)     | No arguments; reads retained institutional evidence and updates registry records                                                                                                                                |
| [import-pool-contract-abis.ts](import-pool-contract-abis.ts)                                       | No arguments; fetches pool ABIs and retains verified source bundles                                                                                                                                             |
| [import-pool-contract-records.ts](import-pool-contract-records.ts)                                 | No arguments; reads retained pool topology/reproduction evidence and updates registry records                                                                                                                   |
| [import-price-contract-abis.ts](import-price-contract-abis.ts)                                     | `<capture.json> <mezod-checkout>`; writes oracle ABIs                                                                                                                                                           |
| [import-price-contract-records.ts](import-price-contract-records.ts)                               | `<capture.json>`; writes the original oracle registry evidence/records                                                                                                                                          |
| [import-price-knowledge.ts](import-price-knowledge.ts)                                             | `<capture.json>`; writes the original Price module inputs and related oracle guidance                                                                                                                           |
| [import-bridge-contract-abis.ts](import-bridge-contract-abis.ts)                                   | `<ntt-checkout> <mezod-checkout> <native-bridge-compiler-output>`; writes bridge ABIs                                                                                                                           |
| [import-bridge-contract-records.ts](import-bridge-contract-records.ts)                             | Nine positional inputs, in the order below; writes original bridge registry records/evidence                                                                                                                    |

The bridge ABI importer verifies the approved NTT manager event correction
against its preserved TypeChain export and pinned Solidity interface before
writing the corrected full ABI. Its source checkout must contain both exact
inputs; a mismatched or unapproved correction fails before any ABI is written.

The bridge-record importer takes:

```text
<capture-json> <ntt-repository> <original-ntt-repository> <mezod-repository>
<native-standard-input> <native-compiler-output>
<native-implementation-etherscan-html> <native-proxy-etherscan-html>
<mezod-upgrade-schedule-repository>
```

## Source inspection and build comparison

The optional [compiler container](compile-solidity-container.ts) runs the reviewed
static Linux amd64 solc 0.8.29+commit.ab55807c without installing a host compiler.
Download the binary only with the dependency approval required by
[CONTRIBUTING](../../CONTRIBUTING.md#dependencies). The exact official URL and
SHA-256 are pinned in [the compiler definition](../lib/solc-container.ts); the
runner refuses other bytes before invoking Docker. It does not download tools.

```sh
node scripts/evidence/compile-solidity-container.ts \
  /tmp/approved-solc-0.8.29 local/evidence/input.json local/evidence/new-build
```

The input must embed every Solidity source as `content`. The output directory
must not exist; its parent must exist. The runner builds a compiler-only
`FROM scratch` image, uses its immutable image ID, and passes Standard JSON over
stdin. Compilation has no network, host mounts, root user or writable root
filesystem, and has bounded time, memory, CPU and process counts. Docker must
support Linux amd64 containers. The temporary build context and run containers
are cleaned up; the local image/build cache remains available for reuse.

`input.json`, `output.json` and `receipt.json` retain source bytes, compiler
diagnostics, compiler/image identities and input/output hashes. Compilation
errors fail the command even when solc exits zero. These receipts establish
compilation only; compare the result with independently anchored deployment
evidence. Historical compiler versions are reproduction tools, not a security
recommendation for new deployments. The older dynamically linked 0.7.6 binary
is not supported by this compiler-only image.

| Script                                                                   | Arguments after the filename                                                                                                          | Effect                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [read-pool-contract-source.ts](read-pool-contract-source.ts)             | `<contract-id> [--file <source-path>]`                                                                                                | Offline: checks the indexed bundle digest and prints its main source or selected embedded file                       |
| [reproduce-explorer-contract.ts](reproduce-explorer-contract.ts)         | `<address> [explorer-api-base]`                                                                                                       | Fetches explorer source/settings and writes a temporary Foundry project; prints its directory and build instructions |
| [compare-explorer-build.ts](compare-explorer-build.ts)                   | `<reproduction-directory>`                                                                                                            | Reads the explorer snapshot and compiled Foundry output; prints comparison JSON                                      |
| [extract-etherscan-standard-json.ts](extract-etherscan-standard-json.ts) | `<etherscan-html> <output-json>`                                                                                                      | Extracts retained HTML's standard compiler input into a file                                                         |
| [compare-standard-json-build.ts](compare-standard-json-build.ts)         | `<compiler-output> <source-name> <contract-name> <creation-rpc-json> <creation-response-id> <runtime-rpc-json> <runtime-response-id>` | Compares compiled creation/runtime bytecode with retained RPC responses and prints JSON                              |
| [find-code-change-boundary.ts](find-code-change-boundary.ts)             | `<rpc-url> <address> <known-old-block> <known-new-block>`                                                                             | Queries historical runtime code within the supplied range and prints the detected boundary                           |

Offline source inspection example:

```sh
node scripts/evidence/read-pool-contract-source.ts mezo-earn.cl-position-manager
```

Build comparison requires the exact compiler/settings and artifacts named by
the reproduction procedure. Creating a Foundry project does not compile it or
prove a deployed match. Follow the owning
[Contract provenance guidance](../../knowledge/contracts/README.md) for source,
ABI, bytecode, and history verification.

The Standard JSON comparator accepts a single RPC response or an array of
responses in each RPC input file. It selects the supplied response ID and
rejects an error response; unrelated entries cannot replace the selected result.
