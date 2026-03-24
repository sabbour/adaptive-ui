---
description: "Run Adaptive UI workspace operations safely from user intent: doctor, contract, build, start, release, sync, and provision."
argument-hint: "Intent, e.g. 'preview release', 'open submodule sync PR', 'start try-aks', 'provision swa in eastus2'"
agent: "agent"
tools: [read, edit, search, execute]
---

Convert the user's plain-English intent into the correct workspace control-plane command sequence using `tooling/workspacectl.mjs`.

## Command Policy

Always use this flow unless the intent is clearly a single command:

1. `npm run doctor`
2. `npm run contract`
3. Intent-specific command

If the intent is only to run local app dev (`start`), skip `contract` and run:

1. `npm run doctor`
2. `npm run start -- <app-name>`

## Intent Mapping

- Health check only: `npm run doctor`
- Dependency contract validation: `npm run contract`
- Full build: `npm run build`
- Start local app: `npm run start -- <trip-notebook|solution-architect|try-aks>`
- Release preview: `npm run release -- <patch|minor|major> --dry-run`
- Release execution: `npm run release -- <patch|minor|major>`
- Sync preview: `npm run sync -- --dry-run --create-pr`
- Sync with PR: `npm run sync -- --create-pr`
- SWA provision: `npm run provision -- --name <name> --resource-group <rg> --location <region> [--subscription <sub>] [--domain <fqdn>] [--dns-zone-id <id> | --dns-zone-rg <rg> --dns-zone-name <zone>]`

## Safety Rules

- For `release` and `sync --create-pr`, run preview first unless user explicitly asks to execute directly.
- If doctor reports dirty repos before release/sync, stop and give cleanup steps.
- Never hardcode personal identity values. Use configured git identity and repository metadata.

## Output Format

When responding:

1. State the exact command(s) to run.
2. State why those commands match the user's intent.
3. If the command is destructive or publishes changes, explicitly label it as preview vs execution.
