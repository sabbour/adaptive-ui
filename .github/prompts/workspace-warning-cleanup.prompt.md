---
description: "Triage and clean workspace doctor warnings before release or sync operations."
argument-hint: "Doctor output or intent, e.g. 'clean warnings before release'"
agent: "agent"
tools: [read, edit, search, execute]
---

Use this prompt when `npm run doctor` reports warnings and the user needs a clean workspace for coordinated operations.

## Procedure

1. Run `npm run doctor`.
2. Parse warning categories:
- Dirty working tree warnings
- Branch mismatch warnings
- Non-git repo warnings
- Missing command/auth warnings
3. Apply cleanup guidance by category.

## Cleanup Guidance

### Dirty working tree

From each flagged repo, run:

```bash
git status
git add -A && git commit -m "wip: local changes"
# or: git stash -u
```

### Branch mismatch

```bash
git checkout main
```

### Missing auth

```bash
gh auth login
```

### Non-git repo warning

Treat as informational if expected by workspace layout. Do not block local development.

## Gate Before Coordinated Ops

Before `release` or `sync --create-pr`, require:

```bash
npm run doctor
npm run contract
```

If either fails, do not continue to execution commands.

## Follow-up Commands

- Release preview:

```bash
npm run release -- patch --dry-run
```

- Sync preview:

```bash
npm run sync -- --dry-run --create-pr
```
