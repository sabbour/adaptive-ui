---
description: "Run the Adaptive UI release go/no-go checklist before coordinated publish operations."
argument-hint: "Bump type and intent, e.g. 'patch dry-run', 'minor release', 'go/no-go for release'"
agent: "agent"
tools: [read, edit, search, execute]
---

Use this checklist whenever the user asks to prepare, preview, or execute a coordinated workspace release.

## Checklist Sequence

1. `npm run doctor`
2. `npm run contract`
3. `npm run release -- <patch|minor|major> --dry-run`
4. If dry-run is clean and user confirms execution: `npm run release -- <patch|minor|major>`

## Stop Conditions

Stop and report a no-go decision if any of these are true:

- `doctor` has failures.
- `doctor` has dirty-tree warnings for repos participating in release.
- `contract` fails.
- release dry-run errors.

## Required Output

1. Decision: `go` or `no-go`.
2. Exact command(s) run or to run next.
3. If no-go, minimal remediation steps in command form.
4. For execution intent, always show dry-run first unless user explicitly asks to skip it.

## JSON Mode (Optional for Automation)

For machine-readable checks, use:

- `npm run doctor -- --json`
- `npm run contract -- --json`
- `npm run release -- <patch|minor|major> --dry-run --json`

Parse failures and warnings from command output before deciding go/no-go.
