---
description: "Route workspace requests to the right operational prompt: workspace-ops, workspace-warning-cleanup, or workspace-release-checklist."
argument-hint: "Intent, e.g. 'prepare release', 'fix doctor warnings', 'open sync PR'"
agent: "agent"
tools: [read, edit, search, execute]
---

Route the user request to the most appropriate workspace prompt and then follow that prompt.

## Routing Rules

Use `workspace-release-checklist.prompt.md` when the user asks to:
- prepare for release
- perform release go/no-go
- run release readiness checks
- preview then execute coordinated release

Use `workspace-warning-cleanup.prompt.md` when the user asks to:
- fix warnings
- clean doctor output
- prepare workspace state before release or sync
- resolve dirty branch or dirty working tree issues

Use `workspace-ops.prompt.md` when the user asks to:
- run or plan doctor/contract/build/start/release/sync/provision commands
- preview or execute releases
- preview or create submodule sync PRs
- provision SWA resources

If the intent overlaps:
1. Start with `workspace-warning-cleanup.prompt.md`
2. Continue with `workspace-release-checklist.prompt.md` for release intents, otherwise use `workspace-ops.prompt.md`

## Expected Output

1. State which prompt was selected and why.
2. Provide exact command(s) for preview and execution when relevant.
3. For risky operations, show dry-run first.
