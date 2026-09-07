# Refresh oracle evidence

Use this guide to refresh the mainnet oracle observations used by the Savings,
mUSDC lending, and USDC Lending Vault reader slices. It covers setup from a clean MDK checkout,
source capture, canonical import, generated files, and verification. Other
knowledge modules use their own README/index and the general
[knowledge-authoring workflow](KNOWLEDGE_AUTHORING.md#update-an-existing-fact-manually).

**Running `pnpm check` does not refresh evidence.** A refresh makes new
read-only RPC observations and imports the resulting capture. No wallet,
signer, transaction, or source-repository dependency installation is needed.

## Current state when historical storage is unavailable

For a bounded current-state capture, no source clones or temporary input files
are required. From the repository root, choose a new output filename:

```sh
node scripts/capture-current-price-state.ts --network mezo-testnet local/oracle-evidence/current-testnet.json
node scripts/capture-current-price-state.ts --network mezo-mainnet local/oracle-evidence/current-mainnet.json
```

These commands resolve the RPC, root identities, and feed IDs from canonical
records. They pin a recent block, verify root/implementation code and slots,
read Skip/Pyth values under an explicit one-hour observation policy, and recheck
the block/chain. The output includes raw requests/responses and
`coverage: current-state-only`, with historical storage explicitly not rechecked.
A file is created only after successful capture; an existing file is not overwritten.

Review `observations[].status`. Only `usable` passes this capture's value/time
predicate; keep excluded observations for diagnostics and apply the consuming
SDK's additional constraints. These snapshots do not automatically extend any
canonical review deadline, rewrite old evidence, or promote testnet reader
support. In particular, do not pass them to the full-history importer below.
The complete source/history workflow remains available for that different scope.

Current-state capture verifies the present observation scope. Lack of
archive state is no longer an alpha/current-state blocker. Historical audits
retain an explicit limitation; no historical request is silently served from
`latest`. See [price selection and DEX quotes](price-selection-and-dex-quotes.md)
for the feed status and SDK behavior boundaries.

## Choose the operation

| What you need                                             | Command or steps                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Check code, tests, builds, and generated-file consistency | `pnpm check`                                                             |
| Check stored mainnet evidence and reader dependencies     | `pnpm check:evidence:mainnet`                                            |
| Run both checks                                           | `pnpm check:readers:mainnet`                                             |
| Refresh expired mainnet oracle evidence                   | Follow steps 1–5 below                                                   |
| Refresh another module or a changed oracle implementation | Follow the owning module's maintenance procedure and review requirements |

The check commands inspect existing evidence; none calls the live capture
script or renews `verifiedAt`/`reviewAfter`. Use a refresh when the relevant
review window expires or a maintenance task calls for re-observation. An
implementation, ABI, source, or feed-outcome change requires a separate review;
the mainnet importer intentionally rejects it.

## 1. Prepare the workspace and source pins

Run all commands from the **MDK repository root**, using Bash. Complete the
[SDK setup](SDK_DEVELOPMENT.md#prerequisites), including Git, the root-declared
Node/pnpm versions, and `pnpm install --frozen-lockfile`. Capture needs network
access to the RPC and explorer endpoints used by the script; initial source
setup also needs access to the official Git repositories.

Inspect existing changes before starting:

```sh
git status --short
mkdir -p local/oracle-evidence/sources local/oracle-evidence/captures
```

`local/` is ignored by Git. It holds disposable working checkouts, captures,
and logs. Accepted evidence is stored separately under `knowledge/` during
import. `/tmp` is not required, and no directory from another developer's
machine is assumed.

Resolve the current mainnet deployment's evidence and its captured source pins.
This reads the canonical resource references rather than copying commit hashes
from this guide:

```sh
node --input-type=module-typescript <<'TS'
import { writeFile } from "node:fs/promises";
import { loadKnowledgeReference } from "./scripts/lib/knowledge-reference.ts";
import { object, text } from "./scripts/lib/json.ts";

const root = process.cwd();
async function readReference(value: unknown) {
  const reference = object(value, "evidence reference");
  return loadKnowledgeReference(root, {
    moduleId: text(reference.moduleId, "module ID"),
    resourceId: text(reference.resourceId, "resource ID"),
  });
}
const deployment = await loadKnowledgeReference(root, {
  moduleId: "contracts",
  resourceId: "contract-deployments",
  recordId: "oracle.pyth-price-feed@mezo-mainnet",
});
const evidence = await readReference(object(deployment.value, "deployment").evidenceReference);
const capture = await readReference(object(evidence.document, "evidence").captureReference);
const source = object(capture.document, "capture");
await writeFile("local/oracle-evidence/source-pins.json", JSON.stringify({
  officialDocumentation: source.officialDocumentation,
  officialClient: source.officialClient,
  officialPyth: source.officialPyth,
}, null, 2) + "\n");
TS
```

The current importer re-verifies the accepted Pyth 1.4.6 generation. It compares
source commits and artifacts against that accepted baseline. Checking out the
latest upstream branch can change the inputs and trigger a source-drift error.
Use the recorded pins for this re-verification workflow.

## 2. Clone and pin the official sources

Run this setup once. The subshell stops if a clone or checkout fails. Clone
uses recorded official URLs; partial clone avoids downloading every historical
file immediately while retaining the Git history needed to resolve pins.

```sh
(
  set -eu
  oracle_docs_url=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialDocumentation.repository')
  oracle_client_url=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialClient.repository')
  oracle_pyth_url=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialPyth.repository')

  git clone --filter=blob:none --no-checkout "$oracle_docs_url" local/oracle-evidence/sources/documentation
  git clone --filter=blob:none --no-checkout "$oracle_client_url" local/oracle-evidence/sources/mezod
  git clone --filter=blob:none --no-checkout "$oracle_pyth_url" local/oracle-evidence/sources/pyth-crosschain
)
```

Pin those dedicated working checkouts. For later refreshes, reuse them and rerun
this block after regenerating `source-pins.json`; if a new pin is unavailable
locally, fetch it from that repository's recorded origin first. Preserve any
local source changes before checking out a different commit.

```sh
(
  set -eu
  oracle_docs_commit=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialDocumentation.commit')
  oracle_client_commit=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialClient.commit')
  oracle_client_tag=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialClient.tag')
  oracle_pyth_commit=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialPyth.commit')
  oracle_pyth_release=$(node -p 'require("./local/oracle-evidence/source-pins.json").officialPyth.releaseCommit')

  git -C local/oracle-evidence/sources/documentation checkout --detach "$oracle_docs_commit"
  git -C local/oracle-evidence/sources/mezod checkout --detach "$oracle_client_commit"
  git -C local/oracle-evidence/sources/pyth-crosschain checkout --detach "$oracle_pyth_commit"
  test "$(git -C local/oracle-evidence/sources/mezod rev-list -n 1 "$oracle_client_tag")" = "$oracle_client_commit"
  git -C local/oracle-evidence/sources/pyth-crosschain cat-file -e "$oracle_pyth_release^{commit}"
  git -C local/oracle-evidence/sources/documentation status --short
  git -C local/oracle-evidence/sources/mezod status --short
  git -C local/oracle-evidence/sources/pyth-crosschain status --short
)
```

The three status commands must print no changes before you continue. Documentation and Pyth
artifact bytes are read from their working trees; mezod artifacts are read
from its pinned tag. Do not install or build these source repositories.

## 3. Capture fresh mainnet observations

```sh
node scripts/capture-price-knowledge.ts \
  local/oracle-evidence/captures/mainnet.json \
  local/oracle-evidence/sources/documentation \
  local/oracle-evidence/sources/mezod \
  local/oracle-evidence/sources/pyth-crosschain \
  --network mezo-mainnet
```

The four path arguments are, in order: **output JSON**, **Mezo documentation
checkout**, **mezod checkout**, and **Pyth checkout**. They are explicit so the
capture can record the exact sources it used. You may choose other paths, but
keep them consistent between setup, capture, and import.

Success prints `Captured price knowledge at … in …`. Inspect the JSON's
`capturedAt`, `networkIds`, `observations`, and `explorer` fields. It must cover
mainnet only for the mainnet importer. If capture fails, do not import an older
file left at the output path. Preserve the failed command/error for diagnosis.

Capture checks chain identity, fixed-block source/feed/runtime state,
before/at historical implementation storage, explorer history, full ABI,
and pinned sources. It rechecks the observation block hash. No previously
accepted storage response is substituted for a fresh read.

## 4. Import, regenerate, and inspect

Import the successful capture within 24 hours:

```sh
node scripts/import-mainnet-oracle-refresh.ts local/oracle-evidence/captures/mainnet.json
```

The importer checks the unchanged accepted generation before writing canonical
files. It rejects stale captures, changed identity/runtime/ABI/history or feed
outcomes, and rollback of the current mainnet observation block. The old
`scripts/refresh-pyth-oracle-knowledge.ts` script is the August 27 upgrade
migration; **do not use it for this routine refresh**.

Artifact and observation IDs currently use the capture's UTC date. The
importer does not allocate separate IDs for multiple captures on the same
UTC day. If that day's capture is already reviewed/accepted, preserve it and
resolve separate evidence IDs before importing a second observation; do not
overwrite accepted evidence as a routine retry.

After a successful import, regenerate:

```sh
node scripts/generate-contract-reference.ts
node scripts/generate-price-reference.ts
node scripts/generate-contracts-package.ts
node scripts/generate-savings-package.ts
node scripts/generate-lending-package.ts
node scripts/generate-vault-package.ts
git status --short
git diff --stat
```

Expect a new capture artifact and evidence under Contracts/Prices, updated
index/source/current-deployment references, and regenerated references/package
inputs. Include the new untracked canonical files in review, as well as the
tracked diff. Keep local clones, intermediate captures, and logs out of Git.
Testnet observations/deployment data and older accepted evidence must retain
their existing scope and timestamps. Do not manually patch generated files or
extend deadlines to make checks pass.

## 5. Verify and record the result

Run the complete mainnet acceptance command. This Bash subshell saves a log
without hiding a failing command's exit status:

```sh
(
  set -o pipefail
  pnpm check:readers:mainnet 2>&1 | tee local/oracle-evidence/mainnet-check.log
)
node scripts/validate-markdown-links.ts
git diff --check
```

A successful acceptance run exits zero and ends with `Mainnet reader evidence
checks passed.` It includes the code gate and all declared checks for the
readers' Networks, Contracts, Prices, MUSD, Savings, mUSDC lending, USDC Lending Vault, Incentives,
Bridges, and Transactions dependencies. Only Contracts/Prices current-evidence
freshness is scoped to mainnet; shared structural/provenance checks still run.

Record the task, network, capture time, block/hash, source pins, changed
canonical resource IDs, exact commands/results, and remaining limitations in
the review packet. Evidence import and green checks do not replace qualified
Level 3 review before release. Stale Pyth feed observations do not establish
live-price support.

## Full-registry and testnet checks

These default commands retain the full scope:

```sh
node scripts/validate-contract-knowledge.ts
node scripts/validate-price-knowledge.ts
```

Historical testnet re-verification remains separate. While that evidence is
expired, the full-registry checks and their explicit `--network mezo-testnet`
variants fail. A mainnet pass does not renew testnet evidence. Omitting
`--network` from capture still requests both networks; the mainnet importer
accepts neither a testnet-only capture nor a combined capture.

## Troubleshooting

| Symptom                                                                     | Meaning and next step                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` passes but evidence is expired                                 | The code gate does not refresh evidence. Run the scoped evidence check and, when required, this capture/import workflow.                                                                                                                                       |
| Source directory missing, Git pin/tag unavailable, or artifact file missing | Finish steps 1–2. Use the recorded pins and required files; an arbitrary shallow checkout may not contain them.                                                                                                                                                |
| `source … drift` or a dirty source working tree                             | Compare checkout commits and files with `source-pins.json`. Restore the intended clean source checkout, or review an intentional upstream change separately.                                                                                                   |
| `no commit info found` / failed historical `eth_getStorageAt`               | The RPC cannot serve a required historical state. Save the network, block, method, and error; arrange a reviewed archive-capable provider or track a blocker. Mainnet scope avoids the separate testnet request, but preserves every mainnet historical check. |
| HTTP/RPC rate limit or connection failure                                   | Preserve the failure and retry capture later after checking the provider. Import only a newly successful capture.                                                                                                                                              |
| Capture older than 24 hours, block too old, or rollback rejected            | Capture again against current state. Do not change timestamps in the saved JSON.                                                                                                                                                                               |
| Changed implementation, ABI, history, runtime, or feed outcome              | Stop the unchanged-generation import and prepare a separately reviewed evidence change.                                                                                                                                                                        |
| Generated input/reference drift                                             | Run the four generators in step 4, then repeat the relevant checks.                                                                                                                                                                                            |
