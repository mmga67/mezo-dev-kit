# Local task management

Significant MDK work uses an agreed task, issue or pull request. Human direction
owns scope and priority; a task records the outcome, evidence and next action.
[CONTRIBUTING](../../CONTRIBUTING.md) owns contributor review and completion.
This guide owns local task layout, naming and operation. Individual task records
remain ignored under [the branch workflow](BRANCH_WORKFLOW.md).

## Instructions apply to ignored paths

Git ignore controls source tracking and common search visibility. It does not
change instruction authority, review requirements or the required task format.
Root instructions govern every workspace path. Read applicable nested AGENTS.md
files explicitly when working in a local tree, including ignored ancestors;
do not assume a tracked-file listing or a runtime's automatic discovery found them.
Legacy source instructions apply only within their actual scope and do not
replace MDK's repository rules.

A repository-wide `rg --files` omits ignored task records. Use direct filesystem
reads, `pnpm tasks:list`, or a narrowly scoped search:

```sh
rg --files --hidden --no-ignore tasks
rg -n --hidden --no-ignore 'specific task or subject' tasks
```

Do not disable ignores for the entire repository just to find one local record.
An empty tracked-file search does not prove a local directory or instruction is
absent. Check the exact path before creating an alternative convention.

The reusable guide and [template](../templates/TASK.md) are tracked so fresh
checkouts retain the rules. Local `tasks/README.md` is a routing pointer and
`tasks/TEMPLATE.md` is a materialized copy. They are checked for drift; author
reusable changes in their tracked owners.

## Layout and identity

```text
tasks/
├── README.md
├── TEMPLATE.md
├── backlog/
├── active/
├── blocked/
├── review/
└── done/
```

A task is `TASK-NNN-short-kebab-name.md`, with a positive, monotonically allocated
ID padded to at least three digits. Its title starts `# TASK-NNN — Title`.
Keep the ID when moving or renaming a task; never reuse an old ID or renumber
existing work to fill a gap. Dates belong in the task's progress/evidence, not
in place of its ID. Only the two guidance files and status folders belong at
the root, apart from an applicable `AGENTS.md`. A status folder may also have
its own `AGENTS.md`; task listing reports these ignored instruction paths.
Retain large histories and original migration snapshots under local/.

The folder is the task status. Do not add a second `Status:` field. Use the
required template sections; additional task-specific sections are allowed.
One task owns one clear outcome. A program task may coordinate bounded child
outcomes without duplicating their implementation logs. `Parent: TASK-NNN`
links a child to one existing parent; use `Parent: none` or omit the declaration
for an independent task. The parent must remain open while a child is unfinished.

## Lifecycle and evidence

| Folder  | Meaning                                                                                    | Required next step                                          |
| ------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| backlog | Defined work not currently executing, including approved work deferred by a newer priority | Confirm existing scope and dependencies before starting     |
| active  | Implementation or a currently pursued parent program                                       | Keep deliverables, acceptance and next actions current      |
| blocked | Dependent work cannot safely continue                                                      | Name the unresolved condition and action or decision needed |
| review  | Deliverables are complete; verification or acceptance remains                              | Record the specific remaining check or reviewer decision    |
| done    | Acceptance criteria and required verification are satisfied                                | Retain evidence and route separately scoped follow-ups      |

Use `backlog → active → review → done`, with `active → blocked → active/review`
when a concrete condition requires it. A changed user priority is not a blocker.
Do not carry an authentication, dependency or approval blocker forward after it
is resolved. Earlier user authorization persists; do not request it again merely
because a task moved folders or a session resumed.

Audit status against current code/exports, the applicable canonical owners,
retained verification and recorded human decisions. A receipt or old task status
alone cannot prove current protocol support, fresh evidence or acceptance. A
published commit resolves publication evidence; it does not automatically prove
a separate qualified review occurred. Keep completed historical tasks complete
when their bounded outcome was accepted; later evidence expiry belongs to a new
refresh task unless it disproves the original result.

When consolidating duplicated continuation notes, preserve the originals,
identify the delivered portion and transfer unfinished work to an explicit
current owner. Do not silently mark the original full scope delivered. Keep
progress brief, with pointers to detailed local receipts rather than repeated
chronological dumps. Update incoming links when a task moves.

## Commands and checks

```sh
pnpm setup:tasks
pnpm task:new explain-a-concrete-outcome
pnpm task:new implement-a-bounded-child --parent TASK-001
pnpm tasks:list
pnpm check:tasks
```

`task:new` uses the tracked template, allocates above all retained IDs, and
creates in backlog. Its parent example is illustrative: the selected parent
must actually exist and remain unfinished. Fill scope and observable acceptance
before moving the file to active. Creation is serialized locally; if a crashed
process leaves `.creation-lock`, verify no creator is running before removing
that lock. Do not remove another process's active lock.

Setup never overwrites different local guidance by default. Preserve meaningful
customization and promote reusable rules to the tracked owner, then run
`pnpm setup:tasks --refresh`. This refresh writes only the two guidance files,
not task records. Existing custom nested instructions should be read and
reconciled with the owning rules before reorganizing their tree.

`pnpm check` includes `check:tasks`. The validator uses direct filesystem reads
and checks naming, IDs, title, required sections, folder/status consistency,
parent references/cycles, unfinished children, explicit local links and local
guidance drift. It rejects unnumbered root notes, duplicate IDs, unfinished done
tasks and blocked records that say they have no blocker. It also refuses symlinked
task roots, status directories and task files.

A fresh checkout with no tasks tree passes without needing anyone's private
records. Synthetic tests exercise the rules independently of real local data.
Do not force-add local records or narrow the ignore policy to make a check see
them. The validator does not certify semantic correctness, human acceptance or
universal agent compliance; those still require the evidence review above.
