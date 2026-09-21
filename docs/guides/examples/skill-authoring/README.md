# Synthetic skill-authoring examples

`repository/` is a documentation-only miniature MDK skill repository. It
contains one fictional contributor skill, one fictional consumer skill, and a
portable catalog that keeps their audiences separate.

## Try the example

Follow the [disposable skill walkthrough](../../SKILL_AUTHORING.md#exercise-the-disposable-examples)
to copy the miniature repository, validate its catalog and skills, and check
unchanged materialization for each audience.

These fixtures are outside the maintained agent catalog and local discovery
tree. They contain no Mezo protocol facts or public API promises. The normal
`.agents/skills/` tree is generated local output and is ignored by Git.

The shared catalog schema is intentionally not duplicated here. The guide
copies `agents/schema/` into each disposable repository before validation.
