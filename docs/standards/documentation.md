# Documentation standard

Write for the person using the page. A reader should understand what it offers,
take a useful next step, and find detail without learning MDK's development history.

## Give each document a job

| Document                   | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| README                     | Explain a project or directory, help someone start, and point to useful next reading.     |
| Documentation landing page | Help readers choose a task, subject, or reference from the maintained collection.         |
| Tutorial or quickstart     | Teach through a guided example with an achievable outcome and visible results.            |
| Guide                      | Help someone complete a task: prerequisites, steps, expected result, and troubleshooting. |
| Reference                  | Describe exact APIs, fields, units, errors, compatibility, or evidence-backed data.       |
| Explanation                | Build understanding of a concept, its relationships, and the reasons for its boundaries.  |
| Manifest                   | State the current project baseline and the responsibilities of its detailed owners.       |
| ARCHITECTURE               | Describe the package map, dependencies, and technical boundaries under that baseline.     |
| CONTRIBUTING               | Explain human setup, contribution, verification, and review.                              |
| Standard                   | Define shared rules for one subject.                                                      |
| AGENTS.md                  | Give coding agents concise instructions that apply within a directory.                    |
| SKILL.md                   | Provide an on-demand procedure for a repeatable agent task.                               |
| Machine index or schema    | Resolve structured resources or validate their shape.                                     |
| Changelog                  | Explain what changed and preserve the reasons for earlier choices.                        |
| Task record                | Explain the outcome, remaining work, and any decision needed from a person.               |

Keep security reporting, license terms, and review ownership in the existing
SECURITY, LICENSE, and CODEOWNERS files. Create a new document only when it has
a useful responsibility that an existing document cannot serve.

The [manifest](../manifest#document-authority) defines authority. This standard
owns writing and navigation conventions; the [coding standard](coding.md#api-and-implementation-comments)
owns API comments and TSDoc.

## Write a useful README

Use this outline as a starting point, omitting sections that do not help:

1. **Purpose.** A plain title and a short paragraph explaining what this is,
   who it serves, and what someone can do with it.
2. **Start here.** A minimal working example, setup path, or linked topic list.
   A knowledge directory needs subject navigation; it does not need installation steps.
3. **Limits that affect use.** Relevant compatibility, evidence, or availability
   information near the action it affects.
4. **Next steps.** A short path to detailed reference, help, or contribution.

Explain the first useful step on the page. Keep long procedures and complete
API inventories in their existing guides and references. Avoid repeated
directory trees, review histories, maintenance checklists, and lists of files
without an explanation of why a reader would open them.

When a project serves several audiences, give each a visible starting route.
Distinguish using the project from contributing to it; readers exploring a
subject should not have to follow application setup first. A short feature list
should name concrete outcomes, not just components. Use action headings or
“I want to…” choices so readers can recognize their task and see what the next
page will help them do.

A README's quality is determined by whether a reader can use it. There is no
mandatory word count, section count, badge set, or diagram requirement.

### Example

An introduction such as “This module follows the accepted v0.4 baseline” tells a
new reader little about the directory.

Prefer: “This directory collects Mezo network, contract, and protocol
information with the sources used to check it. Choose a subject below to
find an explanation or look up a deployment.”

For maintenance, a short link to the
[knowledge authoring guide](../guides/KNOWLEDGE_AUTHORING.md) supplies the next
step without repeating its procedure.

### Knowledge READMEs

A knowledge README helps a person understand a subject and choose what to read
next. Write for a developer who is new to this part of Mezo. Start with what the
directory helps them do, then explain the subject and how its main parts relate
before presenting a link inventory. Use maintained models as the basis and link
their detailed owners; a summary does not become another authority for formulas,
deployments, parameters, or evidence.

Build a connected explanation. Introduce a concept before using it to explain
the next choice, and make clear why one paragraph or section follows another.
For contracts, finding a deployment leads to choosing its interface, checking
the version, and inspecting source when more detail is needed. Avoid assembling
independent facts, caveats, or maintenance notes into a page without that flow.

Use familiar words and concrete verbs. Expand unfamiliar abbreviations at first
use and explain necessary terms where they appear; spelling out an acronym alone
may not explain the concept. Prefer headings such as “Read the saved contract
source code” to “Retained CL source.” Explain what a check establishes and why
the reader needs it instead of relying on internal process labels. The
[contracts README](../../knowledge/contracts/README.md) illustrates this approach.

Adapt the explanation to the subject. A protocol page might trace a deposit,
debt, vote, or reward. Networks should distinguish chain identity from access
through a provider. Troubleshooting should explain how to select a diagnosis.
Use a small example or diagram only when it helps. There is no required set of
headings, word count, or diagram for every module.

Link useful detail beside the explanation it supports. For pages with several
destinations, include a compact **Quick links** section after the explanation
and before contribution guidance. Use descriptive link labels and a short
description of what each destination offers, preferably a two-column table.
Include the subject-specific references, source records, SDK documentation, and
related explanations already introduced on the page. Repeating those inline
links here is intentional: it gives returning readers a place to find them.
Keep the selection useful rather than reproducing the full module index.

Distinguish learning the mechanism, looking up exact facts, and using an SDK.
Keep contribution instructions brief and at the end; the index owns resource
inventories and exact checks. Keep agent routing in AGENTS files and skills,
following [knowledge retrieval](knowledge-management.md#read-or-use-knowledge).
The human page needs neither agent setup nor instructions telling agents to skip it.

State limits as consequences near the affected use: for example, a historical
observation cannot establish current delivery or available liquidity. Explain
the subject before SDK availability, and derive any operation claim from its
package owner. A module status cannot establish the status of every SDK method.

Use the shared [evidence, review, and support explanation](../../knowledge/README.md#evidence-review-and-support)
when those terms matter. Do not repeat a general disclaimer or a status-field
inventory on every page. Define an unavoidable term briefly in context, and keep
the applicable limitation on the page so a reader arriving directly can use it.
Review history, capture logs, and individual corrections belong in their existing
evidence or review owners; link them when they explain a current limitation.

Review a knowledge README by asking whether a newcomer can:

- explain the subject and its main relationships after reading the opening;
- follow the reasoning between sections without already knowing the terminology;
- choose a useful next page for learning, lookup, or integration;
- use the quick links and their descriptions without rereading the explanation;
- understand the relevant limit without interpreting repository status fields.

Automated checks validate structured lifecycle fields, source references,
generated consistency, and working links. They must not require a particular
sentence in authored prose as proof of review or support. Retain those underlying
checks when removing wording assertions, and review the prose against its owners.
Report this editorial review separately from automated validation.

Follow the README's main links during that review: generated references,
explanations, package APIs and examples must agree about what exists and what
still needs review. Fix generated prose in its generator. Avoid hard-coded
capability inventories such as “Writers: none” in a knowledge projection; the
package owns implemented APIs. Label balances and topology by their observation
scope, and expose a material source conflict beside the affected explanation.
A clear entry page does not compensate for a contradictory destination.

## Write actionable task records

Task records serve people coordinating work as well as agents continuing it.
Use the same plain language and connected explanation as a human README. Keep
one task file: a short introduction for the person, followed by the exact detail
needed to carry out or verify the work. Save tokens by removing repetition and
linking evidence, not by compressing an action into unexplained process terms.
The [task guide](../guides/TASK_MANAGEMENT.md) owns lifecycle and the
[task template](../templates/TASK.md) supplies the structure.

Start with **What needs your attention**. Explain what is finished, what remains,
and the next action's owner. State the specific human decision when one is
needed; otherwise say that no human action is needed now and name the agent's
next step. A backlog task can say that work is queued. Do not turn this opening
into a second status field or repeat the full goal and evidence below it.

For a review request, name the question to decide, link the exact change or
material to inspect, and explain what accepting it would allow. Add a short
description beside each link. Link to a section or specific comparison when a
whole file would make the reviewer search again. Summarize what raw evidence
shows and its relevant limits; a log or JSON file alone is not a review request.
Prepare the comparison and proposed change before asking a person to approve it.
If preparation remains, name that work instead of saying only “awaiting review.”
Follow the existing [review responsibilities](../../CONTRIBUTING.md#qualified-human-review)
when specialist judgment is required; do not invent a reviewer or imply acceptance.

Give each task section a concrete job:

| Section                      | Reader's question                                                              |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Verification                 | What was checked, what passed or failed, and where is the result?              |
| Dependencies / Blockers      | What cannot proceed, why, and who can resolve it?                              |
| Review findings, when useful | What was wrong, what changed, and what still needs a decision?                 |
| Follow-ups                   | What separate work was discovered, why does it matter, and which task owns it? |

Separate completed checks from planned checks. Give failures their practical
consequence, and distinguish unrelated failures from checks required for this
task. Put commands and evidence identities below the explanation. Preserve
dates and scope so an earlier passing result cannot look like a new run.

Use observable acceptance criteria. Replace labels such as “disposition of the
overdue model review” with the action: “Review the listed borrowing rules and
decide which can be marked as checked again.” Say who does this and link the
rules and proposed changes. Keep necessary limits next to that decision instead
of repeating a general release disclaimer in every section.

Update the opening as work progresses. Keep useful historical decisions dated
below it; remove obsolete instructions to begin work that is already complete.
Use “None” for an empty blocker or follow-up section. Do not leave template
instructions or speculative future work in a completed task.

Review a task by reading its opening and following its links: can a person tell
whether they need to act, what to inspect, what to decide, and what happens next?
Automated checks validate structure and links; they cannot prove that the request
is understandable or that a reviewer accepted it.

## Choose a structure for the reader's task

These outlines adapt the shared writing rules to different reader needs. Use
only the sections that help; a directory name does not require every page in
it to have the same structure. An explanation can keep an established reference
path when its title, introduction, and incoming links describe its purpose.

### Documentation landing pages

Start with the choices a reader is likely to make: try a workflow, build an
application, look up an API, understand a subject, or contribute. Group links
by those needs and explain what each destination offers.

The root README supplies the first choices and a useful starting action. The
[documentation index](../INDEX.md) supplies the wider collection. Add a section
README only when it makes that directory meaningfully easier to navigate;
keep one maintained inventory instead of copying it into several landing pages.

### Tutorials and quickstarts

State what the reader will complete, then give prerequisites and a short,
ordered path through one working example. Show expected results at meaningful
steps so the reader can tell whether to continue. Finish with what they have
accomplished and the next task or reference.

Keep the first run focused. Put alternative environments, advanced options,
and long explanations after the working path or in their existing owners.

### Task guides

Name the task and when the guide applies. List required inputs and setup,
then give steps in execution order, verification of the result, and recovery
for likely failures. Commands should state where they run and distinguish
sample values from required user input. Link exact option and API inventories
to their references.

### References

State the covered API, subject, version, or evidence scope. Organize exact
details in a predictable lookup order. Describe inputs, outputs, units,
defaults, errors, and compatibility where relevant; keep examples beside the
item they demonstrate. Link a setup guide for readers who need a walkthrough.

A reference landing page may route to detailed owners. Say what readers will
find there and link the useful section. Avoid repeating a changing capability
inventory or evidence status already maintained at the destination.

#### Package API references

Open with what the package lets a developer do, its import path, and a short
choice of useful entry points. Define package-specific terms before relying on
them. Explain units and the relationship between readers, calculations and
writers where those distinctions affect use. Link the existing setup or
walkthrough for a complete runnable workflow.

Group APIs by responsibility, then give substantial functions and client methods
their own descriptive, linkable headings containing the exact API name. Keep a
predictable order within each entry:

1. **Purpose:** what the call does and when it is useful.
2. **Inputs:** signature, required and optional values, defaults, units and bounds.
3. **Example:** one representative use, with its prerequisites stated.
4. **Result:** what the returned value means and what to inspect next.
5. **Failures and limits:** rejection conditions and the caller's next action.

Adapt this pattern for small helpers; avoid empty sections or repeated boilerplate.
Use compact tables for comparable fields and choices. Give lengthy validation,
accounting or recovery contracts their own prose subsections instead of placing
whole paragraphs in table cells. A type inventory supplements the API entries;
it does not replace explanations of how the types are used.

Preserve exact behavior while improving language. In particular, distinguish
base units from display units, estimates from received amounts, client checks
from contract-enforced bounds, and confirmation from reconciled outcomes.
Explain unusual field names and differences between related APIs explicitly.
Keep detailed protocol facts with their existing owners and link there.

#### Reference code examples

Introduce each example with its purpose and required setup. State whether it is
a complete runnable example or an excerpt with application-supplied values.
TypeScript `declare` statements describe dependencies; they do not initialize
them. Show representative request contents when those contents are the subject
of the example. Link a maintained walkthrough for transport, wallet or storage
setup instead of hiding that setup behind unexplained placeholders.

Separate imports, supplied dependencies, construction, the operation, and result
handling with blank lines. Use one variable declaration per statement and
expand complex input objects so related fields are easy to scan. Keep examples
within the repository formatter's conventions; avoid compressed one-line control
flow and nested lifecycle calls. Comments explain units or consequential choices.
Follow the code with expected output or an explanation of the fields the reader
should inspect. Label illustrative values; never fabricate a live result.

Keep each TypeScript example independently typecheckable. The existing
`scripts/tests/test-sdk-references.ts` checks exported-name coverage, snippet
types against built entrypoints, and local link destinations. It does not run
RPC examples or assess prose, heading anchors, or usability. Review those
properties explicitly, including whether a developer can choose a call, supply
valid inputs and understand the result without opening its implementation.

### Explanations and architecture

Begin with the question the page answers and a compact mental model. Describe
components, relationships, boundaries, and the reasons that help readers
understand them. Use a diagram when it clarifies relationships; label what
arrows mean and whether a view shows runtime imports, data flow, or injected
composition.

Architecture owns the current package map and technical boundaries. Distinguish
implemented packages from planned areas. Link procedures, exact APIs, and
qualification details to their owners. Keep useful rationale and tradeoffs
beside the rule in the manifest or its delegated owner.

## Separate human and agent workflows

Human onboarding and contribution must work without reading AGENTS files or
skills. Put shared contributor policy in CONTRIBUTING and the relevant standard.

AGENTS files contain scoped constraints, applicable commands, and routes to
those shared owners. Add nested instructions only for a real local difference.
Skills supply task-specific procedures without copying policy or protocol facts.

A guide about agent setup or skill authoring should name the files the reader
is managing. A general guide may include an optional agent section after its
ordinary human workflow. Keep agent setup, skill loading, and prompt examples
in that section; do not make them prerequisites for a manual task.

## Use clear language and links

- Lead with the reader's purpose or action. Define unfamiliar terms when they
  first become necessary. Prefer subject names to internal process labels.
- Give essential context locally. Link when a destination supplies useful
  detail or a next action; avoid chains of links needed to understand one sentence.
- Use short descriptive link labels, such as “Transaction lifecycle” or
  “Knowledge authoring guide”. Reserve literal filenames for commands and
  instructions about those files.
- Use relative Markdown links for repository content. Link to the most useful
  section when a whole manual would make the reader search again.
- Include a link once where it is most useful. Repeat it only for a distinct
  entry point or a distant section in a long guide.
- Use versions in compatibility instructions, schema definitions, migrations,
  releases, and historical evidence. Omit decorative version numbers
  from introductions and ordinary navigation.
- Current instructions link the current rule. Pinned source references retain
  the exact identities needed to establish their evidence scope.
- Use headings, lists, and tables when they improve scanning. Keep commands
  copyable and state their working directory or prerequisites when ambiguous.

## Preserve accurate references

Keep one detailed owner for each rule or fact. A short summary may orient a
reader, but it must agree with the owner and link there for detail.

Protocol addresses, ABIs, formulas, governed values, and evidence belong in
indexed knowledge. Generated references identify their inputs and generator;
change those inputs or templates and regenerate instead of editing outputs.

Distinguish implemented behavior, verification, protocol support, and
distribution where the difference affects use. State a relevant limit once
near that use. Avoid scattering the same release caveat across every paragraph.

When a file or heading moves, update incoming links. Preserve historical URLs
where practical. Recheck exact commands and compatibility claims against their
owners rather than carrying forward a dated assessment.

## Review a documentation change

- Can the intended reader explain the page's purpose and take its first useful step?
- Can each named audience find its own starting route, with only the setup its task needs?
- Does each section serve that reader, with agent-only steps clearly located?
- Is there one detailed owner, with descriptive working links to it?
- Are commands, examples, versions, evidence scope, and support claims accurate?
- Do generated or distributed versions preserve the context needed to use the source correctly?
- Have changed links, anchors, formatting, and relevant generated outputs been checked?

Use existing format and link tools; they cannot certify readable prose.
Follow the reader's path as part of review, including any changed setup commands
or examples. Check the affected files explicitly with Prettier: the root
`format:check` script does not include root Markdown or `docs/`.

The [Markdown link checker](../../scripts/checks/validate-markdown-links.ts)
checks local destinations and heading anchors in its declared documentation
roots, including package documentation and the extensionless manifest. It does
not establish that a destination explains the linked subject or that an external
page is current. Preserve useful old anchors when reorganizing a long page, and
update incoming links when a heading or file must change.

### Preserve meaning in generated and distributed documentation

Keep task-critical labels and their content together through generation,
link rewriting, extraction, and distribution. Preserve environment/network,
version, units, prerequisites, warnings, evidence dates, and support limits
beside the claim or action they qualify. Keep literal code examples unchanged;
Markdown syntax inside an example is data, not document navigation.

Review intentional omissions against the tasks the output supports. Declare
excluded resources and retain explicit source pointers where applicable; a
removed prerequisite or warning must not make an incomplete procedure appear
usable. If a future renderer uses tabs or other interactive components, retain
every task-relevant alternative under an explicit label before cleanup.

Test transformations with small synthetic documents that distinguish relevant
alternatives and contain literal markup in examples. Assert preserved content
and relationships, then check representative final bundled output. Hashes and
generation drift checks establish byte identity and reproducibility, not that
the transformation retained the source's meaning.

Review a few tasks using only the distributed documents: can the reader choose
the correct network, distinguish historical evidence from current state, and
tell which operations are available? Report automated content checks separately
from an observed human or agent task evaluation. Reuse canonical records and
existing tests instead of maintaining a second copy of protocol facts.

## Basis

These conventions apply [GitHub's README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes),
[Diátaxis's distinction between documentation needs](https://diataxis.fr/),
the [AGENTS.md separation of audiences](https://agents.md/), and
[Google's guidance on useful cross-references](https://developers.google.com/style/cross-references).
Package references also follow
[Microsoft's API reference guidance](https://learn.microsoft.com/en-us/style-guide/developer-content/reference-documentation),
[Microsoft's code-example guidance](https://learn.microsoft.com/en-us/style-guide/developer-content/code-examples),
and [Google's code-sample guidance](https://developers.google.com/style/code-samples).
