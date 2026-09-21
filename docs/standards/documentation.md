# Documentation standard

Write for the person using the page. A reader should understand what it offers,
take a useful next step, and find detail without learning MDK's decision history.

## Give each document a job

| Document                         | Purpose                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| README                           | Explain a project or directory, help someone start, and point to useful next reading.     |
| Documentation landing page       | Help readers choose a task, subject, or reference from the maintained collection.         |
| Tutorial or quickstart           | Teach through a guided example with an achievable outcome and visible results.            |
| Guide                            | Help someone complete a task: prerequisites, steps, expected result, and troubleshooting. |
| Reference                        | Describe exact APIs, fields, units, errors, compatibility, or evidence-backed data.       |
| Explanation                      | Build understanding of a concept, its relationships, and the reasons for its boundaries.  |
| Manifest                         | State the current project baseline and the responsibilities of its detailed owners.       |
| ARCHITECTURE                     | Describe the package map, dependencies, and technical boundaries under that baseline.     |
| CONTRIBUTING                     | Explain human setup, contribution, verification, and review.                              |
| Standard                         | Define shared rules for one subject.                                                      |
| AGENTS.md                        | Give coding agents concise instructions that apply within a directory.                    |
| SKILL.md                         | Provide an on-demand procedure for a repeatable agent task.                               |
| Machine index or schema          | Resolve structured resources or validate their shape.                                     |
| Changelog or historical decision | Explain what changed and preserve the reasons for earlier choices.                        |

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

A README's quality is determined by whether a reader can use it. There is no
mandatory word count, section count, badge set, or diagram requirement.

### Example

An introduction such as “This accepted v0.4 module follows ADR-0006” tells a
new reader little about the directory.

Prefer: “This directory collects Mezo network, contract, and protocol
information with the sources used to check it. Choose a subject below to
find an explanation or look up a deployment.”

For maintenance, a short link to the
[knowledge authoring guide](../guides/KNOWLEDGE_AUTHORING.md) supplies the next
step without repeating its procedure.

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
qualification details to their owners; historical decisions retain the fuller
record of alternatives and original acceptance.

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
  releases, and historical evidence. Omit decorative version and ADR numbers
  from introductions and ordinary navigation.
- Current instructions link the current rule. Historical decisions and pinned
  source references may retain exact ADR identities when their history matters.
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
- Does each section serve that reader, with agent-only steps clearly located?
- Is there one detailed owner, with descriptive working links to it?
- Are commands, examples, versions, evidence scope, and support claims accurate?
- Have changed links, anchors, formatting, and relevant generated outputs been checked?

Use existing format and link tools; they cannot certify readable prose.
Follow the reader's path as part of review, including any changed setup commands
or examples. Check the affected files explicitly with Prettier: the root
`format:check` script does not include root Markdown or `docs/`.

The [Markdown link checker](../../scripts/checks/validate-markdown-links.ts)
checks local destination existence in its declared Markdown roots. It does not
validate heading anchors, read links inside the extensionless manifest, or scan
package documentation as a source root. Check affected links in those locations
explicitly. Preserve useful old anchors when reorganizing a long page, and
update incoming links when a heading or file must change.

## Basis

These conventions apply [GitHub's README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes),
[Diátaxis's distinction between documentation needs](https://diataxis.fr/),
the [AGENTS.md separation of audiences](https://agents.md/), and
[Google's guidance on useful cross-references](https://developers.google.com/style/cross-references).
Package references also follow
[Microsoft's API reference guidance](https://learn.microsoft.com/en-us/style-guide/developer-content/reference-documentation),
[Microsoft's code-example guidance](https://learn.microsoft.com/en-us/style-guide/developer-content/code-examples),
and [Google's code-sample guidance](https://developers.google.com/style/code-samples).
