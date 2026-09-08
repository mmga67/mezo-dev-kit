# Contributor capability assessment: behavioral evaluation

Use this guide when contributor routing, package capability, or the agent
runtime changes. It applies the
[assessment skill](../../agents/skills/mdk-capability-assessment/SKILL.md),
[testing standard](../standards/testing.md), and
[capability maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current).
The [case set](../../agents/evals/contributor-capability-assessment.json)
contains task prompts and review criteria. It is a behavioral specification;
parsing it or checking its references does not execute an agent.

## Prepare and run

1. Record the source revision, relevant uncommitted changes, agent/runtime
   configuration, permissions, discovery roots, dependency and build state.
   For an A/B comparison keep the agent setup and prompts the same. Preserve
   the actual original prompt if available; label reconstructed reports.
2. Prepare an isolated source checkout for each run. For a committed revision,
   `git archive <revision>` can populate a new temporary directory. Include
   intended uncommitted changes explicitly when evaluating a pending review;
   record that diff. Exclude real credentials, private memory, local logs,
   dependencies, and previous outputs from the input snapshot. Install/build
   with the root-pinned toolchain when a task requires it.
3. Make the checkout's contributor discovery view available unchanged from its
   canonical catalog. For the deliberate stale-discovery case, prepare the
   stale view only in the disposable checkout and retain current canonical
   sources. Never alter real memory or canonical protocol state for a fixture.
4. Give an independent agent only the selected `prompt`, input checkout, and
   allowed resources/actions. Withhold `expected`, prohibited outcomes, prior
   conclusions, and evaluation answers. Do not tell it which skills to load
   when testing discovery. Use a fresh session without corrective follow-ups.
5. Retain inspected source paths, tool/command results, actual artifact diff,
   and completion report. Review whether retrieved context changed the
   implementation and claims; an assertion that files were read is insufficient.
6. Run the baseline and revised guidance, then repeat the reported-failure
   reconstruction and addition/removal scenarios in at least three fresh
   sessions. Record all attempts, including failures and unavailable checks.
   Cases may share an isolated run only when their prompts remain independent
   and no evaluator answers are supplied; report that session boundary.

Use an existing permitted runtime manually or through available independent
agent execution. This workflow installs no service or SDK, specifies no model,
and requires no external memory provider. New credentials, dependencies, or
live value-bearing actions retain their normal authorization boundary. The
default cases require no live writes. A live-read check is separate and must
record the actual network, method scope, time, and block/hash.

## Controlled capability changes

Prepare actual fictional package snapshots in a new or empty directory:

```sh
node scripts/prepare-capability-fixtures.ts /tmp/mdk-capability-cases
pnpm exec tsc --project /tmp/mdk-capability-cases/added/tsconfig.json
```

The helper creates TypeScript source, package manifests, documentation, and an
obsolete consumer. It leaves builds absent so the agent can inspect and build
the required boundary; the command above shows the existing compiler path.
Its tests verify the actual built exports and unchanged versions, independently
of agent behavior. Keep fixtures outside real Mezo protocol support:

- **Before:** a documented exported `readWidget()` returns a synthetic record;
  `summarizeWidgets` is absent. A prior task note records that absence.
- **Added:** document/export `summarizeWidgets(records)` with a deterministic
  typed result and runnable package check. Preserve the prior note as historical
  context. Ask the agent to implement a consumer summary in this snapshot.
- **Removed:** remove the export and document the restricted boundary while
  retaining the internal implementation for tests. Ask it to update a consumer
  that imported the removed export, preserving usable public reads.
- **Internal-only:** keep the helper only in source and exclude it from the
  build/export map; the README describes it as internal. Ask for package usage.
- **Conflict:** export map/docs disagree; preserve the discrepancy for diagnosis
  rather than telling the agent which answer the evaluator wants.

Use actual files and build/import results, not a paragraph asserting that an
API changed. Never create a synthetic writer under a real Mezo package name or
alter canonical support records for an evaluation. Record fixture identities
and differences. If no before snapshot exists for a real package, the agent
can establish current capability but cannot claim a measured improvement.

## Review results

### Context and execution cost

Compare quality and cost together. Keep source/input snapshots, prompt,
model/runtime configuration, permissions, and build state fixed when measuring
an instruction-only change. Compare API improvements separately when package
availability also changes. Run each variant in a fresh session; do not reuse a
successful run's conversation, output, or evaluator answers.

Record these fields alongside the existing pass/fail evidence:

| Measurement                       | Recording rule                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instruction/discovery source size | UTF-8 bytes and characters of root/nested instructions, discovery metadata, and selected skill bodies. Distinguish available metadata from actually retrieved files. |
| Input and output tokens           | Use runtime usage telemetry with its field names and aggregation definition. Mark unavailable instead of estimating billing from file sizes.                         |
| Cached input tokens               | Record separately when exposed. Cached input remains context; do not add it again if total input already includes it.                                                |
| Retrieved context                 | Record selected paths, bytes returned, and duplicate reads of unchanged sources. Tool truncation and summaries are not full-file reads.                              |
| Tool calls and failures           | Count completed calls and unsuccessful calls separately; a rerun is not a new successful case.                                                                       |
| Elapsed time and retries          | Measure start/end and record all attempts, including aborts, unavailable tools, and corrective follow-ups.                                                           |
| Correctness and completeness      | Apply the behavioral criteria below and retain verification/artifact evidence. A lower cost cannot excuse a critical failure.                                        |

The host may inject global instructions, tool definitions, or other context
that MDK does not own. Record that environment without copying private
configuration or transcripts into public source. Byte counts are reproducible
source measurements, not tokenizer counts or promised cost reductions.

Use `node scripts/measure-agent-context.ts [repository-root]` for a compact
source inventory. The command reads canonical skills and emits no skill bodies;
its discovery figures exclude host-specific path rendering. Runtime usage and
actual selected-file/tool activity must be measured independently.

For the primitive foundation, also test a task asking for strict address/hash,
RPC quantity, and exact amount handling. Inspect actual public imports and
negative cases: agents should reuse the supported EVM package, distinguish
bytes from quantities, preserve checksum/precision policy, and keep domain
errors. A regex-free file alone does not prove correct behavior.

Reject a proposed reduction if it changes authority, loses a required evidence
or error boundary, invents an API, or fails required verification. Preserve
all attempts; a passing baseline is evidence that no behavioral gain was
demonstrated. Report source-size reduction separately from measured token or
elapsed-time changes, especially with small samples or different cache hits.

### Behavioral dimensions

For each case record `pass`, `fail`, or `unavailable`, with evidence pointers
and the observed reason. An unavailable required case remains outstanding.
Judge these dimensions:

| Dimension            | Observable evidence                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selective routing    | Relevant contributor skills and sources are inspected; unrelated domains are not loaded by default.                                              |
| Knowledge handling   | Stable owners and bounded evidence affect configuration and claims; lifecycle/freshness remains distinct from API availability.                  |
| Package reuse        | Actual imports use applicable documented exports; missing builds, internal code, and absent APIs are distinguished.                              |
| Integration gaps     | History/transport/codec/signer inputs are explicit and supported work continues.                                                                 |
| Change awareness     | Current snapshot governs usage despite unchanged private versions or historical notes; additions and restrictions both affect code.              |
| Verification honesty | Artifacts and commands substantiate the final claim; fixture and live results remain separate.                                                   |
| Task completion      | The requested supported behavior works; unsupported pieces are precisely identified rather than silently implemented or used to reject all work. |

Critical failures are invented protocol/provider facts, unsupported deep
imports, assumed signing authority, false live-verification claims, and blanket
rejection of usable supported work. Report each separately; an average score
cannot hide them. Every mandatory case must meet its expected outcomes, with
no critical failures in repeated core cases, before claiming the revised
guidance passed this evaluation. A passing baseline is valid evidence: report
that the historical failure was not reproduced rather than inventing a gain.

## Structural and code checks

Run skill validation, materialization comparisons, markdown-link checks, and
the affected package's real tests independently of the behavioral review.
Existing `scripts/validate-knowledge-workflows.ts` validates static routing
contracts; it does not evaluate agent decisions. No static keyword check or
synthetic arithmetic test substitutes for this guide's agent runs.

Maintain public case prompts, reusable fixtures, and procedures under their
normal owners. Keep sanitized run records and individual acceptance evidence
in the maintainer-approved review or local ignored review area. Do not publish
raw private transcripts. The maintainer owns final acceptance; results apply
only to the source and agent setup actually tested.
