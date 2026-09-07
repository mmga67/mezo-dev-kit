# Synthetic skill-authoring examples

`repository/` is a documentation-only miniature MDK skill repository. It
contains one fictional contributor skill, one fictional consumer skill, and a
portable catalog that keeps their audiences separate.

The examples are not entries in the maintained `agents/catalog.json`, are not
materialized into the tracked `.agents/skills/` discovery view, and contain no
Mezo protocol facts or public API promises. Copy the miniature repository into
a temporary directory before following the
[`skill-authoring guide`](../../SKILL_AUTHORING.md).

The shared catalog schema is intentionally not duplicated here. The guide
copies `agents/schema/` into each disposable repository before validation.
